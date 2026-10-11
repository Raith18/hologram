import * as THREE from 'three';

const DEFAULT_DEPTH = 1.2;
const EXPLANATIONS = {
  free: ['Extruded profile', 'A flat outline becomes a solid when it is extended through depth. This is the same basic idea as an extrude feature in CAD.'],
  rect: ['Rectangular prism', 'This solid has six rectangular faces. Its length, width, and depth describe its three dimensions.'],
  circle: ['Circular prism', 'A circular profile extended through depth makes a cylinder. The circle is the cross section.'],
  box: ['Box', 'A box is a rectangular prism. Compare its three edge lengths and notice how changing depth changes its volume.'],
  sphere: ['Sphere', 'Every point on a sphere is the same distance from its centre. Rotate the view to compare it with a circle.'],
  cylinder: ['Cylinder', 'A cylinder has two parallel circular faces and one curved surface. Its height is the distance between the circles.'],
  cone: ['Cone', 'A cone has a circular base and a single tip. It can be described by its radius and height.'],
};

export class SketchStudio {
  constructor(canvas, onSelection = () => {}) {
    this.canvas = canvas;
    this.onSelection = onSelection;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
    this.renderer.setClearColor(0x101827, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
    this.scene = new THREE.Scene();
    // Keep the WebGL layer genuinely transparent: no world background, fog,
    // floor, grid, or backdrop plane. The camera video (when enabled) shows
    // through the canvas, and only the teaching geometry is composited above it.
    this.scene.background = null;
    this.scene.fog = null;
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    this.camera.position.set(0, 0, 13);
    this.camera.lookAt(0, 0, 0);
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.scene.add(new THREE.AmbientLight(0xb7d8ff, 1.8));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(-4, 6, 9);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x54b7d9, 1.1);
    fill.position.set(5, -3, 2);
    this.scene.add(fill);

    this.tool = 'free';
    this.color = '#65d6c4';
    this.depth = DEFAULT_DEPTH;
    this.shapes = [];
    this.uploads = [];
    this.isolatedModelId = null;
    this.undoStack = [];
    this.selected = null;
    this.stroke = null;
    this.preview = null;
    this.dragging = false;
    this.depthDrag = null;
    this.viewYaw = 0;
    this.viewPitch = 0;
    this.viewDistance = 13;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  screenToWorld(x, y) {
    const vHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.position.length();
    const vWidth = vHeight * this.camera.aspect;
    return new THREE.Vector3((x / this.canvas.clientWidth - 0.5) * vWidth, (0.5 - y / this.canvas.clientHeight) * vHeight, 0);
  }

  setTool(tool) { this.tool = tool; }
  setColor(color) { this.color = color; }
  setDepth(depth) {
    this.depth = Number(depth);
    if (this.selected && !this.selected.userData.isUploadedPart) {
      const ratio = this.depth / (this.selected.userData.baseDepth || DEFAULT_DEPTH);
      if (this.selected.userData.kind === 'sphere') this.selected.scale.setScalar(ratio);
      else this.selected.scale.z = ratio;
      this.selected.userData.depth = this.depth;
      if (this.selected.userData.dimensions) {
        const axes = ['x', 'y', 'z'];
        axes.forEach((axis, i) => { this.selected.userData.dimensions[i] = (this.selected.geometry.boundingBox.max[axis] - this.selected.geometry.boundingBox.min[axis]) * this.selected.scale[axis]; });
      }
      this.describe(this.selected);
    }
  }

  pointerDown(x, y) {
    const p = this.screenToWorld(x, y);
    if (this.tool === 'push') {
      const target = this.pick(x, y) || this.selected;
      if (!target) return;
      this.select(target);
      this.depthDrag = { object: target, y, depth: target.userData.depth || DEFAULT_DEPTH };
      this.dragging = true;
      return;
    }
    this.stroke = { start: p, points: [p], moved: false };
    this.dragging = true;
    this.removePreview();
  }

  pointerMove(x, y) {
    if (this.depthDrag) {
      const next = THREE.MathUtils.clamp(this.depthDrag.depth + (this.depthDrag.y - y) * 0.025, 0.2, 4);
      this.setDepth(next);
      return;
    }
    if (!this.dragging || !this.stroke) return;
    const p = this.screenToWorld(x, y);
    const last = this.stroke.points[this.stroke.points.length - 1];
    if (p.distanceTo(last) > 0.025) {
      this.stroke.points.push(p);
      this.stroke.moved ||= p.distanceTo(this.stroke.start) > 0.08;
      if (this.tool === 'free') this.showPreview(this.stroke.points);
    }
  }

  pointerUp(x, y) {
    if (this.depthDrag) {
      this.pointerMove(x, y);
      const { object, depth: before } = this.depthDrag;
      const after = object.userData.depth || before;
      this.depthDrag = null;
      this.dragging = false;
      if (Math.abs(after - before) > 0.01) this.undoStack.push({ type: 'depth', object, before, after });
      return 'Depth adjusted. Point at a shape to select it or pinch to adjust again.';
    }
    if (!this.dragging || !this.stroke) return null;
    this.pointerMove(x, y);
    this.dragging = false;
    const stroke = this.stroke;
    this.stroke = null;
    this.removePreview();
    if (!stroke.moved) {
      const hit = this.pick(x, y);
      this.select(hit);
      return hit ? 'Selected shape.' : 'Pinch and move to draw a shape.';
    }
    const object = this.makeShape(stroke);
    if (object) {
      this.group.add(object);
      this.shapes.push(object);
      this.undoStack.push({ type: 'add', object });
      this.select(object);
      return `${object.userData.title} added. Pinch and move to draw another.`;
    }
    return 'Draw a slightly larger outline to make a solid.';
  }

  makeShape(stroke) {
    const { start, points } = stroke;
    const end = points[points.length - 1];
    const w = Math.abs(end.x - start.x), h = Math.abs(end.y - start.y);
    const kind = this.tool;
    let geometry, title, baseDepth = this.depth;
    const material = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.38, metalness: 0.12, transparent: true, opacity: 0.94, side: THREE.DoubleSide });

    if (kind === 'sphere') {
      const radius = Math.max(0.12, Math.hypot(w, h) * 0.5);
      geometry = new THREE.SphereGeometry(radius, 24, 16);
      title = 'Sphere';
    } else if (kind === 'cone') {
      const radius = Math.max(0.12, w * 0.5);
      const height = Math.max(0.12, h);
      geometry = new THREE.ConeGeometry(radius, height, 24, 1);
      title = 'Cone';
    } else {
      let shape = new THREE.Shape();
      if (kind === 'free') {
        const clean = points.filter((p, i) => i === 0 || p.distanceTo(points[i - 1]) > 0.045);
        if (clean.length < 3) return null;
        shape.moveTo(clean[0].x, clean[0].y);
        clean.slice(1).forEach((p) => shape.lineTo(p.x, p.y));
        title = 'Freeform profile';
      } else if (kind === 'circle' || kind === 'cylinder') {
        const rx = Math.max(0.12, w), ry = Math.max(0.12, h);
        shape.absellipse(start.x, start.y, rx, ry, 0, Math.PI * 2, false, 0);
        title = kind === 'circle' ? 'Circular prism' : 'Cylinder';
      } else {
        const minX = Math.min(start.x, end.x), maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y), maxY = Math.max(start.y, end.y);
        shape.moveTo(minX, minY); shape.lineTo(maxX, minY); shape.lineTo(maxX, maxY); shape.lineTo(minX, maxY); shape.closePath();
        title = kind === 'box' ? 'Box' : 'Rectangular prism';
      }
      geometry = new THREE.ExtrudeGeometry(shape, { depth: this.depth, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.035, bevelThickness: 0.035, curveSegments: 20 });
    }

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox;
    const mesh = new THREE.Mesh(geometry, material);
    if (kind === 'sphere') mesh.position.set(start.x, start.y, 0.62);
    if (kind === 'cone') mesh.position.set((start.x + end.x) / 2, (start.y + end.y) / 2, 0.35);
    mesh.userData = { kind, title, baseDepth, depth: this.depth, color: this.color, dimensions: bounds ? [bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z] : [0, 0, 0] };
    return mesh;
  }

  async loadModelFile(file, companionFiles = []) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const manager = new THREE.LoadingManager();
    const resources = new Map();
    for (const resource of [file, ...companionFiles]) {
      resources.set(resource.name.toLowerCase(), resource);
      if (resource.webkitRelativePath) resources.set(resource.webkitRelativePath.replaceAll('\\', '/').toLowerCase(), resource);
    }
    const objectUrls = new Map();
    manager.setURLModifier((url) => {
      if (/^(data:|blob:)/i.test(url)) return url;
      const clean = decodeURIComponent(url.split(/[?#]/, 1)[0]).replaceAll('\\', '/').toLowerCase();
      const basename = clean.split('/').at(-1);
      const resource = resources.get(clean) || resources.get(basename);
      if (!resource) throw new Error(`Missing model resource “${basename}”. Select the model and its companion files together, or upload a self-contained GLB.`);
      if (!objectUrls.has(resource)) objectUrls.set(resource, URL.createObjectURL(resource));
      return objectUrls.get(resource);
    });
    let root;
    try {
      if (ext === 'glb' || ext === 'gltf') {
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const data = ext === 'gltf' ? await file.text() : await file.arrayBuffer();
        const result = await new GLTFLoader(manager).parseAsync(data, '');
        root = result.scene || result.scenes?.[0];
      } else if (ext === 'obj') {
        const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');
        const materialFile = companionFiles.find((item) => item.name.toLowerCase().endsWith('.mtl'));
        const loader = new OBJLoader(manager);
        if (materialFile) {
          const { MTLLoader } = await import('three/addons/loaders/MTLLoader.js');
          const materials = new MTLLoader(manager).parse(await materialFile.text(), '');
          materials.preload();
          loader.setMaterials(materials);
        }
        root = loader.parse(await file.text());
      } else if (ext === 'fbx') {
        const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
        root = new FBXLoader(manager).parse(await file.arrayBuffer(), '');
      } else if (ext === 'ply') {
        const { PLYLoader } = await import('three/addons/loaders/PLYLoader.js');
        const geometry = new PLYLoader(manager).parse(await file.arrayBuffer());
        geometry.computeVertexNormals();
        root = new THREE.Group();
        root.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: this.color, vertexColors: geometry.hasAttribute('color'), roughness: 0.62, metalness: 0.05 })));
      } else if (ext === 'stl') {
        const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
        const geometry = new STLLoader(manager).parse(await file.arrayBuffer());
        geometry.computeVertexNormals();
        root = new THREE.Group();
        root.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.62, metalness: 0.05 })));
      } else {
        throw new Error('Use a .glb, .gltf, .obj, .stl, .fbx, or .ply model file. GLB is the most reliable choice for a single-file upload.');
      }
    } catch (error) {
      objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
      throw error;
    }
    objectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    if (!root) throw new Error('No model scene was found in that file.');

    const bounds = new THREE.Box3().setFromObject(root);
    if (bounds.isEmpty()) throw new Error('This file did not contain any 3D geometry.');
    const center = bounds.getCenter(new THREE.Vector3());
    const dimensions = bounds.getSize(new THREE.Vector3());
    const largest = Math.max(dimensions.x, dimensions.y, dimensions.z);
    if (!Number.isFinite(largest) || largest <= 0) throw new Error('The model has no measurable size.');
    const fitScale = 5.2 / largest;
    const fitted = new THREE.Group();
    const modelId = THREE.MathUtils.generateUUID();
    fitted.name = file.name;
    fitted.add(root);
    fitted.scale.setScalar(fitScale);
    fitted.position.copy(center).multiplyScalar(-fitScale);
    fitted.userData = { uploadedModel: true, modelId, sourceFile: file.name, sourceDimensions: dimensions.toArray(), fitScale };

    const parts = [];
    let index = 0;
    root.traverse((node) => {
      if (!node.isMesh) return;
      index++;
      node.name = node.name?.trim() || `Part ${index}`;
      const noteKey = `holohand-notes:${file.name}:${file.size}:${file.lastModified}:${index}:${node.name}`;
      let savedNotes = '';
      try { savedNotes = localStorage.getItem(noteKey) || ''; } catch { /* notes remain available for this session */ }
      node.userData = { ...node.userData, isUploadedPart: true, modelId, sourceFile: file.name, partName: node.name, sourceDimensions: dimensions.toArray(), notesKey: noteKey, presenterNotes: savedNotes };
      if (Array.isArray(node.material)) node.material = node.material.map((material) => material.clone());
      else if (node.material) node.material = node.material.clone();
      node.frustumCulled = true;
      parts.push(node);
    });
    if (!parts.length) throw new Error('The file has no selectable mesh parts.');

    const upload = { root: fitted, source: file.name, parts, dimensions: dimensions.toArray(), fitScale };
    this.group.add(fitted);
    this.uploads.push(upload);
    this.shapes.push(...parts);
    this.undoStack.push({ type: 'upload', upload });
    this.select(parts[0]);
    return { filename: file.name, parts: parts.length, dimensions: dimensions.toArray() };
  }

  saveSelectedNotes(notes) {
    if (!this.selected) return false;
    this.selected.userData.presenterNotes = notes.trim();
    if (this.selected.userData.notesKey) {
      try { localStorage.setItem(this.selected.userData.notesKey, this.selected.userData.presenterNotes); } catch { /* keep the notes on the active model */ }
    }
    this.describe(this.selected);
    return true;
  }

  toggleIsolation() {
    if (!this.selected?.userData.isUploadedPart) return false;
    const modelId = this.selected.userData.modelId;
    this.isolatedModelId = this.isolatedModelId === modelId ? null : modelId;
    this.applyIsolation();
    this.onSelection(this.selectionData(this.selected));
    return true;
  }

  applyIsolation() {
    for (const upload of this.uploads) {
      for (const part of upload.parts) {
        part.visible = !this.isolatedModelId || part.userData.modelId !== this.isolatedModelId || part === this.selected;
      }
    }
  }

  showPreview(points) {
    this.removePreview();
    if (points.length < 2) return;
    const geo = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x, p.y, 0.08)));
    this.preview = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: this.color, transparent: true, opacity: 0.85 }));
    this.group.add(this.preview);
  }

  removePreview() {
    if (!this.preview) return;
    this.group.remove(this.preview);
    this.preview.geometry.dispose(); this.preview.material.dispose(); this.preview = null;
  }

  pick(x, y) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    return raycaster.intersectObjects(this.shapes, false)[0]?.object || null;
  }

  select(object) {
    if (this.selected === object) return;
    this.selected = object;
    if (this.isolatedModelId && (!object?.userData.isUploadedPart || object.userData.modelId !== this.isolatedModelId)) this.isolatedModelId = null;
    this.applyIsolation();
    this.onSelection(this.selectionData(object));
  }

  selectionData(object) {
    const parts = this.uploads.flatMap((upload) => upload.parts.map((part) => ({ id: part.uuid, title: `${upload.source} · ${part.userData.partName}` })));
    if (!object) return { title: 'No shape selected', info: 'Draw a profile or upload a model, then select a shape or part to explain it.', depth: 0, notes: '', sourceFile: '', imported: false, id: '', parts };
    const uploaded = object.userData.isUploadedPart;
    const title = uploaded ? (object.userData.partName || object.name || 'Model part') : object.userData.title;
    return {
      title,
      info: this.explanation(object),
      depth: uploaded ? 0 : (object.userData.depth || 0),
      notes: object.userData.presenterNotes || '',
      sourceFile: uploaded ? object.userData.sourceFile : '',
      imported: Boolean(uploaded),
      id: object.uuid,
      parts,
      isolated: Boolean(uploaded && this.isolatedModelId === object.userData.modelId),
    };
  }

  explanation(object) {
    if (object.userData.isUploadedPart) {
      const dims = object.userData.sourceDimensions || [];
      const dimensions = dims.length ? ` Overall source bounds: ${dims.map((v) => Number(v).toPrecision(3)).join(' × ')} source units (the file may not define a real-world unit).` : '';
      const notes = object.userData.presenterNotes?.trim();
      return `Selected mesh “${object.userData.partName || object.name}” from ${object.userData.sourceFile}. The file supplies this geometry and part name; its function is not inferred.${dimensions}${notes ? ` Presenter notes: ${notes}` : ' Add presenter notes below for your accurate explanation.'}`;
    }
    const [title, info] = EXPLANATIONS[object.userData.kind] || EXPLANATIONS.free;
    const dims = object.userData.dimensions || [];
    const measurements = dims.length ? ` Approximate size: ${dims.map((v) => Number(v).toFixed(1)).join(' × ')} units.` : '';
    const notes = object.userData.presenterNotes?.trim();
    return `${info}${measurements}${notes ? ` Presenter notes: ${notes}` : ''}`;
  }

  describe(object) { this.onSelection(this.selectionData(object)); }

  undo() {
    const action = this.undoStack.pop();
    if (!action) return false;
    if (action.type === 'remove') {
      this.group.add(action.object);
      this.shapes.push(action.object);
      this.select(action.object);
      return true;
    }
    if (action.type === 'upload') {
      this.group.remove(action.upload.root);
      this.uploads = this.uploads.filter((item) => item !== action.upload);
      const removed = new Set(action.upload.parts);
      this.shapes = this.shapes.filter((shape) => !removed.has(shape));
      if (action.upload.parts.includes(this.selected)) this.select(null);
      if (this.isolatedModelId === action.upload.root.userData.modelId) this.isolatedModelId = null;
      this.disposeTree(action.upload.root);
      this.onSelection(this.selectionData(this.selected));
      return true;
    }
    if (action.type === 'depth') {
      if (this.shapes.includes(action.object)) {
        const ratio = action.before / (action.object.userData.baseDepth || DEFAULT_DEPTH);
        if (action.object.userData.kind === 'sphere') action.object.scale.setScalar(ratio);
        else action.object.scale.z = ratio;
        action.object.userData.depth = action.before;
        this.select(action.object);
        this.describe(action.object);
      }
      return true;
    }
    if (action.type === 'clear') {
      action.objects.forEach((o) => this.group.add(o));
      this.shapes = [...action.shapes];
      this.uploads = [...action.uploads];
      this.selected = action.selected || null;
      this.isolatedModelId = action.isolatedModelId || null;
      this.applyIsolation();
      this.onSelection(this.selectionData(this.selected));
      return true;
    }
    action.object.parent?.remove(action.object);
    const index = this.shapes.indexOf(action.object);
    if (index >= 0) this.shapes.splice(index, 1);
    if (this.selected === action.object) this.select(null);
    action.object.geometry.dispose(); action.object.material.dispose();
    return true;
  }

  clear() {
    if (!this.group.children.length) return;
    const before = [...this.group.children];
    this.undoStack.push({ type: 'clear', objects: before, shapes: [...this.shapes], uploads: [...this.uploads], selected: this.selected, isolatedModelId: this.isolatedModelId });
    this.shapes = [];
    this.uploads = [];
    this.isolatedModelId = null;
    before.forEach((o) => this.group.remove(o));
    this.select(null);
    this.onSelection(this.selectionData(null));
  }

  disposeTree(root) {
    root.traverse((node) => {
      node.geometry?.dispose();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => material?.dispose());
    });
  }

  resetView() { this.viewYaw = 0; this.viewPitch = 0; this.viewDistance = 13; this.updateCamera(); }
  rotateBy(dx, dy) {
    this.viewYaw += dx;
    this.viewPitch = THREE.MathUtils.clamp(this.viewPitch + dy, -1.15, 1.15);
    this.updateCamera();
  }
  zoomBy(scale) {
    this.viewDistance = THREE.MathUtils.clamp(this.viewDistance * scale, 7, 24);
    this.updateCamera();
  }
  updateCamera() {
    const cp = Math.cos(this.viewPitch);
    this.camera.position.set(this.viewDistance * Math.sin(this.viewYaw) * cp, this.viewDistance * Math.sin(this.viewPitch), this.viewDistance * Math.cos(this.viewYaw) * cp);
    this.camera.lookAt(0, 0, 0);
  }
  render() { this.renderer.render(this.scene, this.camera); }
}
