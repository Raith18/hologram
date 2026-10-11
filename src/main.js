import './styles.css';
import { HoloScene } from './scene.js';
import { MODELS } from './models/index.js';
import { GestureEngine, HAND_CONNECTIONS } from './gestureEngine.js';
import { clamp } from './utils.js';

const $ = (id) => document.getElementById(id);
const video = $('video');
const fxCanvas = $('fx');
const ctx = fxCanvas.getContext('2d');
const boardCanvas = $('board-canvas');
const boardCtx = boardCanvas.getContext('2d', { alpha: true });
const banner = $('banner');

let W = innerWidth, H = innerHeight, DPR = 1;
let boardStateReady = false;
function sizeFx() {
  W = innerWidth;
  H = innerHeight;
  DPR = Math.min(devicePixelRatio || 1, 1.4);
  fxCanvas.width = W * DPR;
  fxCanvas.height = H * DPR;
  boardCanvas.width = W * DPR;
  boardCanvas.height = H * DPR;
  boardCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (boardStateReady) redrawBoard();
}
sizeFx();
addEventListener('resize', sizeFx);

function showBanner(msg, info = false) {
  banner.textContent = msg;
  banner.className = info ? 'info' : '';
  banner.style.display = msg ? 'block' : 'none';
}
let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

// ------------------------------------------------------------------ scene + UI
let scene;
try {
  scene = new HoloScene($('scene'), MODELS);
} catch (e) {
  console.error(e);
  showBanner('WebGL is not available. Use a current Chrome, Edge or Firefox with hardware acceleration on.');
  throw e;
}

const ui = { skeleton: true, labels: true, feed: false };
let trackingState = 'Off';
let boardMode = false;
let studioMode = false;
let studio = null;
let studioLastGesture = 'NONE';
let studioColorIndex = 0;
const studioColors = ['#65d6c4', '#ffb454', '#f27791', '#8d9cff'];
let studioHandPoint = null;
let studioPalmPrevious = null;
let studioOrbitPointer = null;
const handTaskLocks = {
  board: { id: null, last: null, lostAt: 0, notified: false },
  studio: { id: null, last: null, lostAt: 0, notified: false },
  model: { id: null, last: null, lostAt: 0, notified: false },
};

function clearHandTaskLock(task) {
  Object.assign(handTaskLocks[task], { id: null, last: null, lostAt: 0, notified: false });
  const finishButton = task === 'board' ? $('board-finish-task') : task === 'studio' ? $('studio-finish-task') : task === 'model' ? $('b-release-grab') : null;
  if (finishButton) finishButton.hidden = true;
}

function lockHandTask(task, hand) {
  const lock = handTaskLocks[task];
  lock.id = hand.id;
  lock.last = hand;
  lock.lostAt = 0;
  lock.notified = false;
  const finishButton = task === 'board' ? $('board-finish-task') : task === 'studio' ? $('studio-finish-task') : task === 'model' ? $('b-release-grab') : null;
  if (finishButton) finishButton.hidden = false;
}

function taskFeedback(task, message) {
  if (task === 'board') $('board-status').textContent = message;
  else if (task === 'studio') $('studio-status').textContent = message;
  else toast(message);
}

function handForTask(task) {
  const lock = handTaskLocks[task];
  if (lock.id) {
    const tracked = perc.hands.find((item) => item.id === lock.id);
    if (tracked && !tracked.held && tracked.score >= 0.2) {
      const wasLost = lock.notified;
      lock.last = tracked;
      lock.lostAt = 0;
      lock.notified = false;
      if (wasLost) {
        taskFeedback(task, task === 'board' ? 'Hand recovered. Your stroke continued.' : 'Hand recovered. Your active gesture continued.');
      }
      return tracked;
    }
    // MediaPipe can briefly flip its Left/Right label. Only adopt a replacement
    // when exactly one good hand is visible and it is close to the locked pose.
    const candidates = perc.hands.filter((item) => !item.held && item.score >= 0.35);
    if (candidates.length === 1 && lock.last?.palm && candidates[0].palm) {
      const candidate = candidates[0];
      const displacement = Math.hypot((candidate.palm.x - lock.last.palm.x) * W, (candidate.palm.y - lock.last.palm.y) * H);
      if (displacement / Math.hypot(W, H) < 0.35) {
        lock.id = candidate.id;
        lock.last = candidate;
        lock.lostAt = 0;
        return candidate;
      }
    }
    if (!lock.lostAt) lock.lostAt = performance.now();
    if (lock.last) {
      if (!lock.notified) {
        lock.notified = true;
        taskFeedback(task, 'Hand temporarily lost. This task stays locked until the same hand returns or you finish it here.');
      }
      return { ...lock.last, held: true };
    }
    clearHandTaskLock(task);
    return null;
  }
  return perc.hands.find((item) => !item.held && item.score >= 0.35) || null;
}
let boardColor = '#f8f7f0';
let brushSize = 8;
let eraserOn = false;
let boardStroke = null;
let boardStrokes = [];
let boardUndo = [];
let appStarted = false;
let lastBoardGesture = 'NONE';
let boardHandVisible = false;
let boardNoHandSince = 0;
const handCursor = $('hand-cursor');
boardStateReady = true;
redrawBoard();

function applyBoardInk(stroke) {
  boardCtx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
  boardCtx.globalAlpha = stroke.erase ? 1 : 0.9;
  boardCtx.strokeStyle = stroke.color;
  boardCtx.fillStyle = stroke.color;
  boardCtx.lineWidth = stroke.size;
  boardCtx.lineCap = 'round';
  boardCtx.lineJoin = 'round';
}

function paintBoardCurveSegment(stroke, start, control, end) {
  boardCtx.save();
  applyBoardInk(stroke);
  boardCtx.beginPath();
  boardCtx.moveTo(start.x, start.y);
  boardCtx.quadraticCurveTo(control.x, control.y, end.x, end.y);
  boardCtx.stroke();
  if (!stroke.erase) {
    boardCtx.globalAlpha = 0.2;
    boardCtx.lineWidth = Math.max(1, stroke.size * 0.48);
    boardCtx.stroke();
  }
  boardCtx.restore();
}

function paintBoardStroke(stroke) {
  const points = stroke.points;
  if (!points.length) return;
  boardCtx.save();
  applyBoardInk(stroke);
  boardCtx.beginPath();
  boardCtx.moveTo(points[0].x, points[0].y);
  if (points.length > 1) {
    boardCtx.quadraticCurveTo(points[0].x, points[0].y, (points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2);
    for (let i = 1; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      boardCtx.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
    }
  }
  if (points.length > 1) boardCtx.lineTo(points.at(-1).x, points.at(-1).y);
  if (points.length === 1) {
    boardCtx.arc(points[0].x, points[0].y, Math.max(0.7, stroke.size / 2), 0, Math.PI * 2);
    boardCtx.fill();
  } else {
    boardCtx.stroke();
  }
  // A second low-opacity core gives the stroke a chalk-like body without
  // per-point particles or blur filters.
  if (!stroke.erase && points.length > 1) {
    boardCtx.globalAlpha = 0.2;
    boardCtx.lineWidth = Math.max(1, stroke.size * 0.48);
    boardCtx.beginPath();
    boardCtx.moveTo(points[0].x, points[0].y);
    boardCtx.quadraticCurveTo(points[0].x, points[0].y, (points[0].x + points[1].x) / 2, (points[0].y + points[1].y) / 2);
    for (let i = 1; i < points.length - 1; i++) {
      const current = points[i], next = points[i + 1];
      boardCtx.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
    }
    boardCtx.lineTo(points.at(-1).x, points.at(-1).y);
    boardCtx.stroke();
  }
  boardCtx.restore();
}

function paintBoardPoint(stroke, point) {
  boardCtx.save();
  boardCtx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
  boardCtx.globalAlpha = stroke.erase ? 1 : 0.9;
  boardCtx.fillStyle = stroke.color;
  boardCtx.beginPath();
  boardCtx.arc(point.x, point.y, Math.max(0.7, stroke.size / 2), 0, Math.PI * 2);
  boardCtx.fill();
  boardCtx.restore();
}

function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

function smoothBoardPoint(stroke, raw) {
  const last = stroke.points.at(-1);
  const distance = Math.hypot(raw.x - last.x, raw.y - last.y);
  // Suppress sub-pixel jitter, but let a deliberate fast movement catch up.
  if (distance < 1.15) return null;
  const alpha = clamp(0.2 + distance / 52, 0.2, 0.72);
  return { x: last.x + (raw.x - last.x) * alpha, y: last.y + (raw.y - last.y) * alpha };
}

function redrawBoard() {
  if (!boardCtx || !boardCanvas) return;
  boardCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  boardCtx.clearRect(0, 0, W, H);
  for (const stroke of boardStrokes) paintBoardStroke(stroke, true);
}

function beginBoardStroke(x, y, source = 'pointer') {
  const p = { x, y };
  boardStroke = { color: boardColor, size: brushSize, erase: eraserOn, source, points: [p], lastMid: p };
  boardStrokes.push(boardStroke);
  paintBoardPoint(boardStroke, p);
}

function extendBoardStroke(x, y) {
  if (!boardStroke) return;
  const next = smoothBoardPoint(boardStroke, { x, y });
  if (!next) return;
  boardStroke.points.push(next);
  const previous = boardStroke.points.at(-2);
  const end = midpoint(previous, next);
  paintBoardCurveSegment(boardStroke, boardStroke.lastMid, previous, end);
  boardStroke.lastMid = end;
}

function finishBoardStroke() {
  if (!boardStroke) return;
  const last = boardStroke.points.at(-1);
  if (boardStroke.points.length > 1) paintBoardCurveSegment(boardStroke, boardStroke.lastMid, last, last);
  boardUndo.push({ type: 'stroke', stroke: boardStroke });
  if (boardUndo.length > 300) boardUndo.shift();
  boardStroke = null;
  clearHandTaskLock('board');
}

function chooseBoardColor(color) {
  boardColor = color;
  $('board-color').value = color;
  document.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('active', b.dataset.color === color));
  eraserOn = false;
  $('board-eraser').setAttribute('aria-pressed', 'false');
}

function nextBoardColor() {
  const swatches = [...document.querySelectorAll('.swatch')].map((button) => button.dataset.color);
  const current = swatches.indexOf(boardColor);
  chooseBoardColor(swatches[(current + 1 + swatches.length) % swatches.length]);
  $('board-status').textContent = `Chalk colour changed to ${$('board-color').value}. Close your hand to write.`;
}

function overBoardTools(x, y) {
  const r = $('board-tools').getBoundingClientRect();
  return x >= r.left - 18 && x <= r.right + 18 && y >= r.top - 18 && y <= r.bottom + 18;
}

function updateHandCursor(point, drawing) {
  handCursor.style.left = `${point.x * W}px`;
  handCursor.style.top = `${point.y * H}px`;
  handCursor.classList.toggle('visible', true);
  handCursor.classList.toggle('drawing', drawing);
}

function hideHandCursor() {
  handCursor.classList.remove('visible', 'drawing');
}

function handleBoardHandFrame() {
  const hand = handForTask('board');
  if (!hand) {
    if (boardStroke?.source === 'hand') finishBoardStroke();
    hideHandCursor();
    if (!boardNoHandSince) boardNoHandSince = performance.now();
    if (performance.now() - boardNoHandSince > 650 && boardHandVisible) {
      boardHandVisible = false;
      lastBoardGesture = 'NONE';
      $('board-status').textContent = 'No hand in view. Show one hand; open palm keeps the pen up, close your hand to write.';
    }
    return;
  }
  if (hand.held) {
    if (boardStroke?.source === 'hand') updateHandCursor(handTaskLocks.board.last.palm, true);
    return;
  }
  boardNoHandSince = 0;
  if (!boardHandVisible) {
    boardHandVisible = true;
    $('board-status').textContent = 'Hand detected. Open palm to move without ink; close your hand to write.';
  }

  const gesture = hand.gesture;
  const gestureChanged = gesture !== lastBoardGesture;
  if (gesture === 'PEACE' && lastBoardGesture !== 'PEACE') nextBoardColor();
  lastBoardGesture = gesture;

  const drawing = gesture === 'FIST' && hand.openness < 0.42;
  // The fist/palm centre is steadier than a curled fingertip and makes the
  // closed-hand gesture behave like a broad chalk grip. Open hand is cursor-only.
  const point = drawing ? hand.palm : hand.tip;
  const x = point.x * W, y = point.y * H;
  if (overBoardTools(x, y)) {
    if (boardStroke?.source === 'hand') finishBoardStroke();
    hideHandCursor();
    return;
  }

  updateHandCursor(point, drawing);
  if (drawing) {
    if (!boardStroke) {
      beginBoardStroke(x, y, 'hand');
      lockHandTask('board', hand);
      $('board-status').textContent = 'Writing. Open your hand to lift the chalk; brief tracking gaps will not interrupt the stroke.';
    }
    else if (boardStroke.source === 'hand') extendBoardStroke(x, y);
  } else if (boardStroke?.source === 'hand') {
    finishBoardStroke();
    $('board-status').textContent = 'Pen up. Open palm moves without ink; close your hand to write again.';
  } else if (gesture === 'OPEN' && gestureChanged) {
    $('board-status').textContent = 'Open palm: pen up. Move freely, then close your hand to write.';
  }
}

function setBoardMode(on) {
  boardMode = on;
  document.body.classList.toggle('board-mode', on);
  $('t-board').classList.toggle('on', on);
  if (!on) {
    finishBoardStroke();
    hideHandCursor();
    lastBoardGesture = 'NONE';
    if (!appStarted) $('start').classList.remove('gone');
  }
}

function undoBoard() {
  finishBoardStroke();
  const action = boardUndo.pop();
  if (!action) return;
  if (action.type === 'clear') boardStrokes = action.before;
  else {
    const i = boardStrokes.lastIndexOf(action.stroke);
    if (i >= 0) boardStrokes.splice(i, 1);
  }
  redrawBoard();
}

document.querySelectorAll('.swatch').forEach((button) => button.addEventListener('click', () => chooseBoardColor(button.dataset.color)));
$('board-color').addEventListener('input', (e) => chooseBoardColor(e.target.value));
$('board-size').addEventListener('input', (e) => {
  brushSize = Number(e.target.value);
  $('board-size-value').textContent = String(brushSize);
});
$('board-eraser').addEventListener('click', () => {
  eraserOn = !eraserOn;
  $('board-eraser').setAttribute('aria-pressed', String(eraserOn));
});
$('board-undo').addEventListener('click', undoBoard);
$('board-finish-task').addEventListener('click', () => {
  if (boardStroke?.source === 'hand') {
    finishBoardStroke();
    $('board-status').textContent = 'Finished the stroke. Pinch to start another.';
  }
});
$('board-clear').addEventListener('click', () => {
  finishBoardStroke();
  if (boardStrokes.length) {
    boardUndo.push({ type: 'clear', before: boardStrokes });
    if (boardUndo.length > 300) boardUndo.shift();
    boardStrokes = [];
    redrawBoard();
  }
});
boardCanvas.addEventListener('pointerdown', (e) => {
  if (!boardMode) return;
  e.preventDefault();
  boardCanvas.setPointerCapture(e.pointerId);
  beginBoardStroke(e.clientX, e.clientY, 'pointer');
});
boardCanvas.addEventListener('pointermove', (e) => {
  if (boardMode && boardStroke?.source === 'pointer') extendBoardStroke(e.clientX, e.clientY);
});
boardCanvas.addEventListener('pointerup', finishBoardStroke);
boardCanvas.addEventListener('pointercancel', finishBoardStroke);
$('btn-board').addEventListener('click', () => setBoardMode(true));
$('t-board').addEventListener('click', () => setBoardMode(!boardMode));
$('board-exit').addEventListener('click', () => setBoardMode(false));
$('board-enable-hand').addEventListener('click', () => {
  appStarted = true;
  startCamera();
});

async function setStudioMode(on) {
  if (on) {
    if (!studio) {
      const { SketchStudio } = await import('./studio.js');
      studio = new SketchStudio($('studio-canvas'), (selection) => {
        $('studio-shape-name').textContent = selection?.title || 'No shape selected';
        $('studio-shape-info').textContent = selection?.info || 'Draw a profile or upload a model, then select a shape or part to explain it.';
        $('studio-selection-kind').textContent = selection?.imported ? `MODEL PART · ${selection.sourceFile}` : 'SELECTED SHAPE';
        $('studio-notes').value = selection?.notes || '';
        $('studio-depth').disabled = Boolean(selection?.imported);
        $('studio-isolate').hidden = !selection?.imported;
        $('studio-isolate').textContent = selection?.isolated ? 'Show all parts' : 'Isolate selected part';
        const partSelect = $('studio-part-select');
        const partOptions = selection?.parts || [];
        const signature = JSON.stringify(partOptions);
        if (partSelect.dataset.signature !== signature) {
          partSelect.replaceChildren(new Option(partOptions.length ? 'Choose a model part…' : 'Upload a model to list its parts', ''));
          partOptions.forEach((part) => partSelect.add(new Option(part.title, part.id)));
          partSelect.dataset.signature = signature;
        }
        partSelect.value = selection?.imported ? selection.id : '';
        if (selection?.depth) {
          $('studio-depth').value = String(clamp(selection.depth, 0.2, 4));
          $('studio-depth-label').textContent = Number(selection.depth).toFixed(1);
        }
      });
    }
    boardMode = false;
    studioMode = true;
    appStarted = true;
    if (camOn) {
      ui.feed = true;
      document.body.classList.add('feed');
    }
    document.body.classList.remove('board-mode');
    document.body.classList.add('studio-mode');
    $('start').classList.add('gone');
    $('t-studio').classList.add('on');
    studio.resize();
    $('studio-hand').textContent = trackingState === 'Hands on' ? 'Hand drawing on' : 'Enable hand drawing';
    $('studio-hand').disabled = trackingState === 'Hands on';
    $('studio-status').textContent = camOn ? 'Camera ready. Point to aim; pinch and move to sketch.' : 'Choose a tool. Enable hand drawing for air sketching, or draw with your mouse / touch.';
    return;
  }
  studioMode = false;
  if (studio?.dragging) studio.pointerUp(studioHandPoint?.x ?? 0, studioHandPoint?.y ?? 0);
  clearHandTaskLock('studio');
  document.body.classList.remove('studio-mode', 'studio-present');
  $('t-studio').classList.remove('on');
  $('studio-cursor').classList.remove('visible', 'drawing');
  studioLastGesture = 'NONE';
  if (!appStarted) $('start').classList.remove('gone');
}

function setStudioColor(color) {
  if (!studio) return;
  studio.setColor(color);
  $('studio-color').value = color;
  document.querySelectorAll('.studio-colors [data-color]').forEach((b) => b.classList.toggle('active', b.dataset.color === color));
}

function cycleStudioColor() {
  studioColorIndex = (studioColorIndex + 1) % studioColors.length;
  setStudioColor(studioColors[studioColorIndex]);
  $('studio-status').textContent = `Material colour changed. Active colour: ${studioColors[studioColorIndex]}.`;
}

function overStudioUi(x, y) {
  const selectors = document.body.classList.contains('studio-present') ? ['.studio-bar', '.studio-explain'] : ['.studio-bar', '.studio-tools', '.studio-explain'];
  return selectors.some((selector) => {
    const r = document.querySelector(selector).getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  });
}

function handleStudioHandFrame() {
  const hand = handForTask('studio');
  const cursor = $('studio-cursor');
  if (!hand) {
    if (studio?.dragging) {
      const status = studio.pointerUp(studioHandPoint?.x ?? 0, studioHandPoint?.y ?? 0);
      if (status) $('studio-status').textContent = 'Hand left view; finished the current stroke.';
    }
    clearHandTaskLock('studio');
    cursor.classList.remove('visible', 'drawing');
    studioLastGesture = 'NONE';
    studioPalmPrevious = null;
    studioHandPoint = null;
    return;
  }
  if (hand.held) {
    if (studio.dragging) {
      const point = studioLastGesture === 'PINCH' ? handTaskLocks.studio.last.pinchPt : handTaskLocks.studio.last.tip;
      cursor.style.left = `${point.x * W}px`;
      cursor.style.top = `${point.y * H}px`;
      cursor.classList.add('visible', 'drawing');
    }
    return;
  }
  const gesture = hand.gesture;
  if (gesture === 'PEACE' && studioLastGesture !== 'PEACE') cycleStudioColor();
  if (gesture === 'FIST' && studioLastGesture !== 'FIST') {
    if (studio.undo()) $('studio-status').textContent = 'Undid the last shape change.';
  }
  studioLastGesture = gesture;
  const taskLocked = Boolean(handTaskLocks.studio.id);
  const drawing = hand.pinching && (gesture === 'PINCH' || taskLocked);
  const p = drawing ? hand.pinchPt : hand.tip;
  const x = p.x * W, y = p.y * H;
  if (gesture === 'POINT') studio.select(studio.pick(x, y));
  studioHandPoint = { x, y };
  if (overStudioUi(x, y)) {
    if (studio.dragging) {
      const status = studio.pointerUp(studioHandPoint.x, studioHandPoint.y);
      if (status) $('studio-status').textContent = status;
      clearHandTaskLock('studio');
    }
    cursor.classList.remove('visible', 'drawing');
    return;
  }
  const palm = { x: hand.palm.x * W, y: hand.palm.y * H };
  if (gesture === 'OPEN' && studioPalmPrevious && !studio.dragging) {
    studio.rotateBy((palm.x - studioPalmPrevious.x) * 0.006, (palm.y - studioPalmPrevious.y) * 0.005);
  }
  studioPalmPrevious = palm;
  cursor.style.left = `${x}px`; cursor.style.top = `${y}px`;
  cursor.classList.add('visible'); cursor.classList.toggle('drawing', drawing);
  if (drawing) {
    if (!studio.dragging) {
      studio.pointerDown(x, y);
      if (studio.dragging) {
        lockHandTask('studio', hand);
        $('studio-status').textContent = 'Gesture locked. Release the pinch to finish; brief tracking gaps will not interrupt it.';
      }
    }
    else studio.pointerMove(x, y);
  } else if (studio.dragging) {
    const status = studio.pointerUp(x, y);
    if (status) $('studio-status').textContent = status;
    clearHandTaskLock('studio');
  }
}

$('btn-studio').addEventListener('click', () => setStudioMode(true));
$('t-studio').addEventListener('click', () => setStudioMode(!studioMode));
$('studio-exit').addEventListener('click', () => setStudioMode(false));
$('studio-upload').addEventListener('click', () => $('studio-file').click());
$('studio-file').addEventListener('change', async (e) => {
  const files = [...(e.target.files || [])];
  const supported = /\.(glb|gltf|obj|stl|fbx|ply)$/i;
  const file = files.find((item) => supported.test(item.name));
  if (!file || !studio) {
    if (files.length) $('studio-status').textContent = 'Select a .glb, .gltf, .obj, .stl, .fbx, or .ply model file.';
    e.target.value = '';
    return;
  }
  const companions = files.filter((item) => item !== file);
  $('studio-status').textContent = `Loading ${file.name}…`;
  try {
    const result = await studio.loadModelFile(file, companions);
    const dims = result.dimensions.map((v) => Number(v).toPrecision(3)).join(' × ');
    $('studio-status').textContent = `Loaded ${result.filename}: ${result.parts} selectable parts. Source bounds ${dims}; source units may be unspecified.`;
  } catch (error) {
    console.error('Model import failed:', error);
    $('studio-status').textContent = error?.message || 'Could not read this model. Try a GLB, OBJ, or STL file.';
  } finally {
    e.target.value = '';
  }
});
$('studio-part-select').addEventListener('change', (e) => {
  if (!studio || !e.target.value) return;
  const part = studio.shapes.find((shape) => shape.uuid === e.target.value);
  if (part) studio.select(part);
});
$('studio-isolate').addEventListener('click', () => {
  if (studio?.toggleIsolation()) $('studio-status').textContent = studio.isolatedModelId ? 'Showing the selected model part. Choose another part or show all parts.' : 'Showing all uploaded model parts.';
});
$('studio-save-notes').addEventListener('click', () => {
  if (!studio?.saveSelectedNotes($('studio-notes').value)) {
    $('studio-status').textContent = 'Select a model part or shape before saving presenter notes.';
    return;
  }
  $('studio-status').textContent = 'Presenter notes saved with this selected part for the current session.';
});
$('studio-finish-task').addEventListener('click', () => {
  if (studio?.dragging) {
    const status = studio.pointerUp(studioHandPoint?.x ?? 0, studioHandPoint?.y ?? 0);
    clearHandTaskLock('studio');
    $('studio-status').textContent = status ? `${status} Finished safely.` : 'Finished safely.';
  }
});
$('studio-hand').addEventListener('click', () => { appStarted = true; startCamera(); $('studio-status').textContent = 'Starting camera…'; });
$('studio-present').addEventListener('click', () => {
  document.body.classList.toggle('studio-present');
  $('studio-present').textContent = document.body.classList.contains('studio-present') ? 'Exit present' : 'Present';
});
document.querySelectorAll('.studio-tools [data-tool]').forEach((button) => button.addEventListener('click', () => {
  if (!studio) return;
  studio.setTool(button.dataset.tool);
  document.querySelectorAll('.studio-tools [data-tool]').forEach((b) => b.classList.toggle('selected', b === button));
  $('studio-status').textContent = `${button.textContent} selected. Point to aim; pinch and move to draw.`;
}));
document.querySelectorAll('.studio-colors [data-color]').forEach((button) => button.addEventListener('click', () => setStudioColor(button.dataset.color)));
$('studio-color').addEventListener('input', (e) => setStudioColor(e.target.value));
$('studio-depth').addEventListener('input', (e) => {
  const depth = Number(e.target.value);
  $('studio-depth-label').textContent = depth.toFixed(1);
  studio?.setDepth(depth);
});
$('studio-undo').addEventListener('click', () => { if (studio?.undo()) $('studio-status').textContent = 'Undid the last shape change.'; });
$('studio-clear').addEventListener('click', () => { studio?.clear(); $('studio-status').textContent = 'Scene cleared. Use Undo to restore it.'; });
$('studio-view').addEventListener('click', () => studio?.resetView());
$('studio-canvas').addEventListener('pointerdown', (e) => {
  if (!studioMode) return;
  if (e.button === 2 || e.button === 1) { studioOrbitPointer = { x: e.clientX, y: e.clientY }; $('studio-canvas').setPointerCapture(e.pointerId); return; }
  if (e.button !== 0) return;
  e.preventDefault(); $('studio-canvas').setPointerCapture(e.pointerId); studio.pointerDown(e.clientX, e.clientY);
});
$('studio-canvas').addEventListener('pointermove', (e) => {
  if (!studioMode) return;
  if (studioOrbitPointer) {
    studio.rotateBy((e.clientX - studioOrbitPointer.x) * 0.008, (e.clientY - studioOrbitPointer.y) * 0.006);
    studioOrbitPointer = { x: e.clientX, y: e.clientY };
  } else if (studio?.dragging) studio.pointerMove(e.clientX, e.clientY);
});
$('studio-canvas').addEventListener('pointerup', (e) => {
  if (studioOrbitPointer) { studioOrbitPointer = null; return; }
  if (!studioMode || !studio?.dragging) return;
  const status = studio.pointerUp(e.clientX, e.clientY);
  if (status) $('studio-status').textContent = status;
});
$('studio-canvas').addEventListener('pointercancel', () => { if (studio?.dragging) studio.pointerUp(-100, -100); });
$('studio-canvas').addEventListener('contextmenu', (e) => e.preventDefault());
$('studio-canvas').addEventListener('wheel', (e) => { if (studioMode) studio?.zoomBy(Math.exp(e.deltaY * 0.001)); }, { passive: true });

// model chips grouped by category
const chips = $('chips');
for (const cat of [...new Set(MODELS.map((m) => m.category))]) {
  const grp = document.createElement('div');
  grp.className = 'grp';
  const gl = document.createElement('span');
  gl.className = 'gl';
  gl.textContent = cat;
  grp.appendChild(gl);
  MODELS.forEach((m, i) => {
    if (m.category !== cat) return;
    const b = document.createElement('button');
    b.textContent = m.name;
    b.dataset.i = i;
    b.onclick = () => scene.setModel(i);
    grp.appendChild(b);
  });
  chips.appendChild(grp);
}

scene.onModel = (i, def, g) => {
  $('m-name').textContent = def.name;
  $('m-sub').textContent = def.subtitle;
  $('m-cat').textContent = def.category;
  $('m-count').textContent = `${g.meta.length} parts`;
  chips.querySelectorAll('button').forEach((b) => b.classList.toggle('active', +b.dataset.i === i));
  showPart(-1);
  toast(def.name);
};
// initial UI for model 0 (constructor loaded it before the callback existed)
scene.onModel(scene.index, MODELS[scene.index], scene.cache.get(scene.index));

function showPart(i) {
  const p = i >= 0 ? scene.parts[i] : null;
  $('pc-name').textContent = p ? p.name : 'No part selected';
  $('pc-desc').textContent = p ? p.desc : 'Point at a part, or click one, to read what it does.';
  $('pc-dot').style.background = p ? p.color : '#555a70';
}

const rExplode = $('r-explode');
const rInt = $('r-int');
let draggingExplode = false;
rExplode.addEventListener('pointerdown', () => (draggingExplode = true));
addEventListener('pointerup', () => (draggingExplode = false));
rExplode.addEventListener('input', () => (scene.explodeTarget = rExplode.value / 100));
rInt.addEventListener('input', () => {
  scene.intensity = rInt.value / 100;
  $('v-int').textContent = rInt.value + '%';
});

$('b-explode').onclick = () => (scene.explodeTarget = scene.explodeTarget > 0.5 ? 0 : 1);
$('b-release-grab').onclick = () => {
  endGrab();
  scene.holdVel = false;
  toast('Part drag released safely.');
};
$('b-spin').onclick = () => {
  scene.autoSpin = !scene.autoSpin;
  $('b-spin').classList.toggle('on', scene.autoSpin);
};
$('b-reset').onclick = () => {
  scene.resetView();
  showPart(-1);
};
$('b-next').onclick = () => scene.next();

function toggle(id, key, after) {
  $(id).onclick = () => {
    ui[key] = !ui[key];
    $(id).classList.toggle('on', ui[key]);
    after?.();
  };
}
toggle('t-feed', 'feed', () => document.body.classList.toggle('feed', ui.feed && camOn));
toggle('t-skel', 'skeleton');
toggle('t-labels', 'labels');
$('t-full').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());

// ------------------------------------------------------------------ camera + tracking
let tracker = null;
const engine = new GestureEngine();
let camOn = false;
let lastVideoTime = -1;
let perc = { hands: [] };

async function startCamera() {
  $('start').classList.add('gone');
  setTracking('Starting…', 'warn');
  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
    enterMouseMode('Camera needs http://localhost or https.');
    return;
  }
  if (!camOn) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' }, audio: false });
      video.srcObject = stream;
      await video.play();
      camOn = true;
      ui.feed = true;
      $('t-feed').classList.add('on');
      document.body.classList.add('feed');
    } catch (e) {
      console.warn(e);
      enterMouseMode(e && e.name === 'NotAllowedError' ? 'Camera permission denied. Allow it in the address bar and reload.' : 'No camera found.');
      return;
    }
  }
  setTracking('Loading hand model…', 'warn');
  try {
    if (!tracker) {
      const { HandTracker } = await import('./handTracking.js');
      tracker = new HandTracker();
    }
    await tracker.init();
    setTracking('Hands on', 'ok');
    showBanner('');
  } catch (e) {
    console.error(e);
    setTracking('Mouse only', 'warn');
    showBanner('Hand model failed to load (needs internet once). Mouse controls still work.');
  }
}

function enterMouseMode(msg) {
  setTracking('Mouse only', 'warn');
  if (msg) showBanner(msg + ' Mouse controls are on.', true);
}

function setTracking(text, cls) {
  trackingState = text;
  const el = $('s-track');
  el.textContent = text;
  el.className = cls || '';
  const status = $('board-status');
  const enable = $('board-enable-hand');
  if (text === 'Hands on') {
    status.textContent = 'Camera ready. Open palm moves without ink; close your hand to write. Peace changes chalk colour.';
    enable.textContent = 'Hand drawing on';
    enable.disabled = true;
  } else if (text === 'Starting…' || text === 'Loading hand model…') {
    status.textContent = `${text} Keep your hand in view.`;
    enable.disabled = true;
  } else if (text === 'Mouse only') {
    status.textContent = 'Hand tracking is unavailable. Use mouse/touch or try camera again.';
    enable.textContent = 'Try camera again';
    enable.disabled = false;
  }
  if (studioMode) {
    if (text === 'Hands on') {
      $('studio-status').textContent = 'Camera ready. Point to aim; pinch and move to sketch; open palm to orbit.';
      $('studio-hand').textContent = 'Hand drawing on';
      $('studio-hand').disabled = true;
    } else if (text === 'Mouse only') {
      $('studio-status').textContent = 'Hand tracking unavailable. Use mouse/touch, or try enabling the camera again.';
      $('studio-hand').textContent = 'Try hand drawing again';
      $('studio-hand').disabled = false;
    } else {
      $('studio-status').textContent = `${text} Keep your hand in view.`;
      $('studio-hand').disabled = true;
    }
  }
}

$('btn-cam').onclick = () => {
  appStarted = true;
  startCamera();
};
$('btn-mouse').onclick = () => {
  appStarted = true;
  $('start').classList.add('gone');
  enterMouseMode('');
};

/** raw camera landmark -> viewport 0..1 (mirrored, matches object-fit: cover) */
function mapPoint(p) {
  const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
  const s = Math.max(W / vw, H / vh);
  const ox = (W - vw * s) / 2, oy = (H - vh * s) / 2;
  return { x: ((1 - p.x) * vw * s + ox) / W, y: (p.y * vh * s + oy) / H };
}

// ------------------------------------------------------------------ gesture -> action
let zoomRef = null;
let grab = null;
let lastHover = { i: -1, t: 0 };
let dwell = { i: -1, t: 0 };
let peaceCool = 0;
const prevPalm = new Map();
let activeKey = '';

function setActive(key) {
  if (key === activeKey) return;
  activeKey = key;
  document.querySelectorAll('#gest li').forEach((li) => li.classList.toggle('active', li.dataset.g === key));
}

function endGrab() {
  if (grab) scene.releaseAll();
  grab = null;
  clearHandTaskLock('model');
}

function control(t, dt) {
  if (boardMode || studioMode) {
    endGrab();
    scene.holdVel = false;
    setActive('');
    return;
  }
  const modelTaskActive = Boolean(handTaskLocks.model.id);
  let lockedModelHand = null;
  if (modelTaskActive) {
    lockedModelHand = handForTask('model');
    if (!lockedModelHand) {
      endGrab();
      scene.holdVel = false;
      setActive('');
      return;
    }
    if (lockedModelHand.held) {
      scene.holdVel = true;
      scene.idle = 0;
      return;
    }
  }
  const live = perc.hands.filter((h) => !h.held);
  $('s-hands').textContent = String(live.length);

  // two hands: distance between palms = zoom
  if (live.length >= 2 && !modelTaskActive) {
    const a = live[0].palm, b = live[1].palm;
    const dist = Math.hypot((a.x - b.x) * W, (a.y - b.y) * H);
    if (!zoomRef) zoomRef = { d0: Math.max(60, dist), s0: scene.scaleTarget };
    scene.scaleTarget = clamp((zoomRef.s0 * dist) / zoomRef.d0, 0.5, 2.6);
    scene.holdVel = true;
    scene.idle = 0;
    endGrab();
    scene.setHover(-1);
    prevPalm.clear();
    setActive('TWO');
    return;
  }
  zoomRef = null;

  const h = modelTaskActive ? lockedModelHand : live[0];
  if (!h) {
    endGrab();
    scene.holdVel = draggingMouse;
    if (!draggingMouse) scene.setHover(-1);
    prevPalm.clear();
    setActive('');
    return;
  }

  scene.holdVel = true;
  scene.idle = 0;
  const g = h.gesture;
  const actionGesture = handTaskLocks.model.id ? (h.pinching ? 'PINCH' : 'RELEASE') : g;
  const palmPx = { x: h.palm.x * W, y: h.palm.y * H };

  if (actionGesture === 'RELEASE') {
    scene.setHover(-1);
    setActive('');
  } else if (actionGesture === 'OPEN' || actionGesture === 'FIST' || actionGesture === 'NONE') {
    // openness drives the explosion
    scene.explodeTarget = actionGesture === 'FIST' ? 0 : clamp((h.openness - 0.12) / 0.78, 0, 1);
    // moving the hand rotates the model
    const prev = prevPalm.get(h.id);
    if (prev) {
      const dx = palmPx.x - prev.x, dy = palmPx.y - prev.y;
      if (Math.hypot(dx, dy) > 1.5) scene.rotateBy(dx * 0.0048, dy * 0.0032, dt);
    }
    if (h.rollDelta) scene.rollBy(h.rollDelta * 0.7);
    scene.setHover(-1);
    setActive(actionGesture === 'NONE' ? 'MOVE' : actionGesture);
    if (actionGesture === 'OPEN' && prev && Math.hypot(palmPx.x - prev.x, palmPx.y - prev.y) > 6) setActive('MOVE');
  } else {
    if (actionGesture === 'POINT') {
      const idx = scene.pick(h.tip.x * W, h.tip.y * H, 95);
      scene.setHover(idx);
      if (idx >= 0) {
        lastHover = { i: idx, t };
        showPart(idx);
      }
      if (idx >= 0 && idx === dwell.i) {
        dwell.t += dt;
        if (dwell.t > 0.7 && scene.sel !== idx) scene.setSel(idx);
      } else dwell = { i: idx, t: 0 };
    } else if (actionGesture === 'PINCH') {
      const pp = { x: h.pinchPt.x * W, y: h.pinchPt.y * H };
      if (!grab) {
        let idx = scene.pick(pp.x, pp.y, 170);
        if (idx < 0 && t - lastHover.t < 0.9) idx = lastHover.i;
        if (idx >= 0) {
          grab = { part: idx, last: pp };
          lockHandTask('model', h);
          toast('Part drag locked. Brief tracking loss will not release it.');
          scene.setSel(idx);
          scene.setHover(idx);
          showPart(idx);
        }
      } else {
        scene.dragPart(grab.part, pp.x - grab.last.x, pp.y - grab.last.y);
        grab.last = pp;
      }
    } else if (actionGesture === 'PEACE') {
      if (t > peaceCool) {
        peaceCool = t + 1.6;
        scene.next();
      }
    }
    setActive(actionGesture);
  }
  if (actionGesture !== 'PINCH') endGrab();
  prevPalm.set(h.id, palmPx);
}

// ------------------------------------------------------------------ mouse + keyboard
let draggingMouse = false;
let mouseStart = null;
let mouseLast = null;
const onUi = (e) => e.target.closest && e.target.closest('#panel,#chips,#toolbar,#start,#board-tools');

addEventListener('pointerdown', (e) => {
  if (boardMode || studioMode) return;
  if (e.button !== 0 || onUi(e)) return;
  draggingMouse = true;
  mouseStart = mouseLast = { x: e.clientX, y: e.clientY };
});
addEventListener('pointermove', (e) => {
  if (boardMode || studioMode) return;
  if (!draggingMouse) return;
  scene.holdVel = true;
  scene.rotateBy((e.clientX - mouseLast.x) * 0.006, (e.clientY - mouseLast.y) * 0.004, 1 / 60);
  mouseLast = { x: e.clientX, y: e.clientY };
});
addEventListener('pointerup', (e) => {
  if (boardMode || studioMode) return;
  if (!draggingMouse) return;
  draggingMouse = false;
  scene.holdVel = false;
  if (Math.hypot(e.clientX - mouseStart.x, e.clientY - mouseStart.y) < 5) {
    const idx = scene.pick(e.clientX, e.clientY, 80);
    scene.setSel(idx === scene.sel ? -1 : idx);
    showPart(scene.sel);
  }
});
addEventListener('wheel', (e) => {
  if (boardMode || studioMode) return;
  if (onUi(e)) return;
  scene.zoomBy(Math.exp(-e.deltaY * 0.0012));
}, { passive: true });
addEventListener('keydown', (e) => {
  if (studioMode) {
    if (e.key === 'Escape') setStudioMode(false);
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') studio?.undo();
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (studio?.selected) {
        const item = studio.selected;
        studio.group.remove(item);
        studio.shapes.splice(studio.shapes.indexOf(item), 1);
        studio.undoStack.push({ type: 'remove', object: item });
        studio.select(null);
        $('studio-status').textContent = 'Selected shape deleted. Undo can restore it.';
      }
    }
    return;
  }
  if (boardMode) {
    if (e.key === 'Escape') setBoardMode(false);
    return;
  }
  if (e.target.tagName === 'INPUT' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (e.key === ' ') {
    e.preventDefault();
    scene.explodeTarget = scene.explodeTarget > 0.5 ? 0 : 1;
  } else if (e.key === 'ArrowRight') scene.next(1);
  else if (e.key === 'ArrowLeft') scene.next(-1);
  else if (e.key.toLowerCase() === 'r') scene.resetView();
  else if (e.key >= '1' && e.key <= String(MODELS.length)) scene.setModel(+e.key - 1);
});

// ------------------------------------------------------------------ overlay drawing
const ringR = new Map();

function drawHand(h) {
  const pts = h.lm.map((p) => ({ x: p.x * W, y: p.y * H }));
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(236, 232, 255, 0.78)';
  ctx.shadowColor = 'rgba(176, 164, 255, 0.95)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.moveTo(pts[a].x, pts[a].y);
    ctx.lineTo(pts[b].x, pts[b].y);
  }
  ctx.stroke();
  ctx.fillStyle = '#fff';
  for (const p of pts) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawRing(h) {
  const pts = h.lm;
  const cx = h.palm.x * W, cy = h.palm.y * H;
  const g = h.gesture;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(242, 201, 76, 0.9)';
  ctx.shadowBlur = 14;
  if (g === 'POINT') {
    const x = h.tip.x * W, y = h.tip.y * H;
    ctx.strokeStyle = '#f2c94c';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (g === 'PINCH') {
    const x = h.pinchPt.x * W, y = h.pinchPt.y * H;
    ctx.strokeStyle = '#f2c94c';
    ctx.fillStyle = 'rgba(242, 201, 76, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    const len = Math.hypot((pts[0].x - pts[12].x) * W, (pts[0].y - pts[12].y) * H);
    const target = len * 0.95 + 22;
    const r = (ringR.get(h.id) ?? target) * 0.85 + target * 0.15;
    ringR.set(h.id, r);
    ctx.strokeStyle = 'rgba(242, 201, 76, 0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // white arc = how far it is exploded
    const e = clamp(scene.explode, 0, 1);
    if (e > 0.01) {
      ctx.shadowColor = 'rgba(255,255,255,0.9)';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * e);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawZoom(a, b) {
  const x1 = a.palm.x * W, y1 = a.palm.y * H, x2 = b.palm.x * W, y2 = b.palm.y * H;
  ctx.save();
  ctx.strokeStyle = 'rgba(242, 201, 76, 0.85)';
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(242, 201, 76, 0.8)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#fff';
  ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowBlur = 6;
  ctx.fillText(`zoom ${scene.scale.toFixed(2)}x`, (x1 + x2) / 2, (y1 + y2) / 2 - 12);
  ctx.restore();
}

function drawLabels() {
  const e = clamp((scene.shownExplode - 0.1) / 0.3, 0, 1);
  if (e <= 0.01 || scene.uniforms.uScatter.value > 0.3) return;
  const pts = scene.labelPoints();
  const c = scene.centerScreen();
  const panelR = W > 900 ? 310 : 0;
  const left = [], right = [];
  for (const p of pts) (p.x < c.x ? left : right).push(p);
  const maxX = Math.max(...pts.map((p) => p.x), c.x);
  const minX = Math.min(...pts.map((p) => p.x), c.x);
  const colR = clamp(maxX + 80, panelR + 360, W - 170);
  const colL = clamp(minX - 80, panelR + 20, W - 400);
  ctx.save();
  ctx.globalAlpha = e;
  ctx.font = '500 12px ui-sans-serif, system-ui, "Segoe UI", sans-serif';
  ctx.textBaseline = 'middle';
  const place = (list, colX, dir) => {
    list.sort((a, b) => a.y - b.y);
    const ys = list.map((p) => p.y);
    for (let i = 1; i < ys.length; i++) if (ys[i] < ys[i - 1] + 20) ys[i] = ys[i - 1] + 20;
    const over = ys.length ? ys[ys.length - 1] - (H - 90) : 0;
    if (over > 0) for (let i = 0; i < ys.length; i++) ys[i] -= over;
    list.forEach((p, k) => {
      const hot = p.i === scene.hover || p.i === scene.sel;
      const ly = clamp(ys[k], 24, H - 24);
      ctx.strokeStyle = hot ? p.color : 'rgba(255,255,255,0.38)';
      ctx.lineWidth = hot ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(colX - dir * 16, ly);
      ctx.lineTo(colX, ly);
      ctx.stroke();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, hot ? 4 : 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hot ? '#fff' : 'rgba(255,255,255,0.82)';
      ctx.font = `${hot ? 600 : 500} ${hot ? 13 : 12}px ui-sans-serif, system-ui, "Segoe UI", sans-serif`;
      ctx.textAlign = dir > 0 ? 'left' : 'right';
      ctx.fillText(p.name, colX + dir * 6, ly);
    });
  };
  place(right, colR, 1);
  place(left, colL, -1);
  ctx.restore();
}

function drawOverlay() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (ui.labels) drawLabels();
  const live = perc.hands.filter((h) => !h.held);
  if (ui.skeleton) for (const h of live) drawHand(h);
  for (const h of live) drawRing(h);
  if (live.length >= 2) drawZoom(live[0], live[1]);
}

// ------------------------------------------------------------------ main loop
let lastT = performance.now() / 1000;
let lastFrameAt = 0;
function frame(now) {
  const frameInterval = boardMode ? 1000 / 30 : 1000 / 50;
  if (now - lastFrameAt < frameInterval) {
    requestAnimationFrame(frame);
    return;
  }
  lastFrameAt = now;
  const t = now / 1000;
  const dt = Math.min(0.05, Math.max(0.001, t - lastT));
  lastT = t;

  let videoFrameUpdated = false;
  if (camOn && tracker?.ready && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const hands = tracker.detect(video, now);
    perc = engine.update(hands, t, mapPoint, (video.videoWidth || 16) / (video.videoHeight || 9));
    videoFrameUpdated = true;
  }
  control(t, dt);

  if (boardMode && videoFrameUpdated) handleBoardHandFrame();
  if (studioMode && videoFrameUpdated) handleStudioHandFrame();

  if (!draggingExplode) rExplode.value = Math.round(clamp(scene.explode, 0, 1) * 100);
  $('v-explode').textContent = Math.round(clamp(scene.explode, 0, 1) * 100) + '%';
  $('b-explode').textContent = scene.explodeTarget > 0.5 ? 'Assemble' : 'Explode';

  if (studioMode) {
    studio?.render();
  } else if (!boardMode) {
    scene.update(dt, t);
    drawOverlay();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
