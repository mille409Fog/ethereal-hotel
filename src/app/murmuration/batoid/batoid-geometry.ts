import * as THREE from 'three';
/**  creates the geometry for the cauldron of bats, the individual function provides the topological information for a singular bat which is
 * then copied via an instanced mesh to create the cauldron as a whole.
 */
export function createBatoidGeometry(): THREE.BufferGeometry {
  // we create the 'classic' bat shape which comes from a series of lines and quadratic curves
  const half = new THREE.Path()
    .moveTo(0, 0.12)
    .lineTo(0.05, 0.14)
    .lineTo(0.07, 0.24)
    .lineTo(0.09, 0.12)
    .lineTo(0.18, 0.1)
    .lineTo(0.45, 0.18)
    .lineTo(0.62, 0.28)
    .quadraticCurveTo(0.48, 0.16, 0.5, 0.02)
    .quadraticCurveTo(0.4, 0.08, 0.32, -0.04)
    .quadraticCurveTo(0.2, 0.02, 0.12, -0.1)
    .lineTo(0.04, -0.16)
    .lineTo(0, -0.24);

  const right = half.getPoints(6);
  const left = right
    .slice(1, -1)
    .reverse()
    .map((p) => new THREE.Vector2(-p.x, p.y));

  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape([...right, ...left]), {
    depth: 0.03,
    bevelEnabled: false,
  });
  geometry.center();
  geometry.rotateX(Math.PI / 2);

  return geometry;
}
