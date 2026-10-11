import * as THREE from 'three';
import { Cloud, P, I, rod, tube } from './shapes.js';

const TWO_PI = Math.PI * 2;
const helixPoint = (side, t) => [side * 0.72 * Math.cos(t), -2.35 + 4.7 * t / TWO_PI / 5, side * 0.72 * Math.sin(t)];

export function buildDna() {
  const steps = 220;
  const paths = [new Cloud(), new Cloud()];
  for (let i = 0; i <= steps; i++) {
    const t = TWO_PI * 5 * i / steps;
    for (let side = 0; side < 2; side++) {
      const p = helixPoint(side ? -1 : 1, t);
      paths[side].add(...p);
    }
  }
  const backbones = paths.map((path) => {
    const points = [];
    for (let i = 0; i < path.p.length; i += 3) points.push(new THREE.Vector3(path.p[i], path.p[i + 1], path.p[i + 2]));
    return tube(points, 0.085, 1700);
  });
  const parts = [P('Sugar-phosphate backbones', 'Two twisting molecular rails hold the DNA strand together.', '#55d9ee', [I(backbones[0], [-0.75, 0, 0]), I(backbones[1], [0.75, 0, 0])])];
  const at = new Cloud(), cg = new Cloud();
  const rungs = 36;
  for (let i = 0; i < rungs; i++) {
    const t = TWO_PI * 5 * (i + 0.5) / rungs;
    const a = helixPoint(1, t), b = helixPoint(-1, t);
    (i % 2 ? cg : at).merge(rod(a, b, 0.026, 70));
  }
  parts.push(P('Adenine–thymine pairs', 'Adenine pairs with thymine across the middle of the DNA ladder.', '#f2c94c', [I(at, [0, 0.25, 0])]));
  parts.push(P('Cytosine–guanine pairs', 'Cytosine pairs with guanine to encode genetic instructions.', '#ff74a8', [I(cg, [0, -0.25, 0])]));
  return parts;
}
