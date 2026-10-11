import { P, I, merge, fibonacciSphere, tube } from './shapes.js';

export function buildHeart() {
  const parts = [];
  const leftVentricle = fibonacciSphere(0.48, 0.77, 0.47, 2800).rotate(0, 0, -0.25).move(0.27, -0.34, 0);
  const rightVentricle = fibonacciSphere(0.45, 0.69, 0.44, 2500).rotate(0, 0, 0.25).move(-0.29, -0.3, 0.02);
  parts.push(P('Left ventricle', 'The strongest chamber pumps oxygen-rich blood to the body.', '#e54867', [I(leftVentricle, [0.7, -0.65, 0])]));
  parts.push(P('Right ventricle', 'Pumps oxygen-poor blood to the lungs to pick up oxygen.', '#f27680', [I(rightVentricle, [-0.7, -0.65, 0])]));

  const leftAtrium = fibonacciSphere(0.34, 0.34, 0.36, 1300).move(0.31, 0.48, 0.02);
  const rightAtrium = fibonacciSphere(0.34, 0.34, 0.36, 1300).move(-0.31, 0.48, 0.02);
  parts.push(P('Left atrium', 'Receives oxygen-rich blood from the lungs and passes it to the left ventricle.', '#f2a0aa', [I(leftAtrium, [0.55, 0.75, 0])]));
  parts.push(P('Right atrium', 'Receives oxygen-poor blood returning from the body.', '#ef8994', [I(rightAtrium, [-0.55, 0.75, 0])]));

  const aorta = tube([[0.05, 0.65, 0], [0.03, 0.95, 0], [0.1, 1.32, 0], [0.32, 1.55, 0], [0.62, 1.47, 0], [0.72, 1.18, 0]], 0.13, 2200, { taper: (t) => 0.8 + 0.2 * Math.sin(Math.PI * t) });
  const branches = merge(
    tube([[0.27, 1.45, 0], [0.26, 1.78, 0], [0.22, 2.0, 0]], 0.07, 520),
    tube([[0.46, 1.49, 0], [0.51, 1.82, 0], [0.57, 2.0, 0]], 0.07, 520),
    tube([[0.62, 1.42, 0], [0.8, 1.68, 0], [0.91, 1.86, 0]], 0.07, 520),
  );
  parts.push(P('Aorta', 'The main artery carries oxygen-rich blood from the heart to the body.', '#ff5364', [I(aorta, [0.9, 0.25, 0])]));
  parts.push(P('Aortic branches', 'Branches from the aorta carry blood toward the head and arms.', '#ff7c84', [I(branches, [0.8, 0.9, 0])]));

  const venaCava = merge(
    tube([[-0.56, 1.5, 0], [-0.52, 1.12, 0], [-0.45, 0.82, 0]], 0.095, 900),
    tube([[-0.68, -1.95, 0], [-0.66, -1.25, 0], [-0.52, -0.78, 0]], 0.11, 1100),
  );
  const pulmonary = merge(
    tube([[-0.1, 0.6, 0], [-0.52, 0.83, 0], [-0.9, 0.88, 0], [-1.1, 0.72, 0]], 0.08, 900),
    tube([[0.04, 0.67, 0], [0.48, 0.84, 0], [0.84, 0.8, 0], [1.02, 0.63, 0]], 0.08, 900),
  );
  parts.push(P('Vena cava', 'The large veins return blood from the body to the right atrium.', '#6289ff', [I(venaCava, [-0.95, 0.15, 0])]));
  parts.push(P('Pulmonary vessels', 'Pulmonary arteries and veins connect the heart with the lungs.', '#8ba5ff', [I(pulmonary, [0, 1.2, 0])]));
  return parts;
}
