import { Cloud, P, I, fibonacciSphere, ring } from './shapes.js';

const planet = (rx, ry, rz, count, x, color, name, desc) =>
  P(name, desc, color, [I(fibonacciSphere(rx, ry, rz, count).move(x, 0, 0), [x * 0.18, 0.45, 0])]);

export function buildSolarSystem() {
  const parts = [];
  const orbits = new Cloud();
  const paths = [1.12, 1.48, 1.88, 2.28, 2.92, 3.56, 4.12, 4.62];
  paths.forEach((r) => orbits.merge(ring(r, 0, 520)));
  parts.push(P('Orbital paths', 'Eight paths show each planet’s orbit around the Sun.', '#62708f', [I(orbits)]));
  parts.push(P('Sun', 'The star at the centre. Its gravity holds the planets in orbit.', '#ffd454', [I(fibonacciSphere(0.78, 0.78, 0.78, 3600))]));
  parts.push(planet(0.11, 0.11, 0.11, 700, 1.12, '#b8b8c6', 'Mercury', 'The smallest planet, orbiting closest to the Sun.'));
  parts.push(planet(0.17, 0.17, 0.17, 900, 1.48, '#f2b36c', 'Venus', 'A rocky planet with a dense, heat-trapping atmosphere.'));
  parts.push(planet(0.19, 0.19, 0.19, 1100, 1.88, '#55a9ff', 'Earth', 'Our ocean-covered home, with one natural moon.'));
  parts.push(planet(0.15, 0.15, 0.15, 850, 2.28, '#ee7658', 'Mars', 'A cold desert world with a thin atmosphere.'));
  parts.push(planet(0.39, 0.39, 0.39, 1800, 2.92, '#e6b879', 'Jupiter', 'The largest planet, with bands of clouds and giant storms.'));
  parts.push(planet(0.32, 0.32, 0.32, 1700, 3.56, '#f1d59b', 'Saturn', 'A gas giant surrounded by broad rings of ice and rock.'));
  const rings = ring(0.48, 0, 1500).scale(1.55, 0.1, 1.55).rotate(0.34, 0, 0.16).move(3.56, 0, 0);
  parts.push(P('Saturn’s rings', 'Countless small pieces of ice and rock orbit Saturn.', '#f2d7a6', [I(rings, [0, 0.4, 0.5])]));
  parts.push(planet(0.24, 0.24, 0.24, 1300, 4.12, '#7cdbdf', 'Uranus', 'An ice giant that spins almost on its side.'));
  parts.push(planet(0.24, 0.24, 0.24, 1300, 4.62, '#568cff', 'Neptune', 'A distant ice giant with very fast winds.'));
  return parts;
}
