import * as THREE from 'three';

const LATERAL = new THREE.Vector3(1, 0, 0);
const MIN_CORRECTION = THREE.MathUtils.degToRad(0.5);

/**
 * Some GLBs are exported in a showroom pose with the front wheels steered (the Valkyrie ships at
 * ~36° of lock), which reads as crooked wheels from every angle. This yaws `wheel` about the
 * vertical axis through its tyre's centre until the axle lines up with the car's lateral (X) axis.
 * Camber (the axle's tilt) is preserved.
 *
 * The axle is the tyre mesh's thinnest bounding-box axis. Works in `root`'s own frame (Y up, car
 * lateral along X), so call it before the model is rotated or scaled. Returns the correction in
 * radians (0 when the wheel was already straight).
 */
export function straightenSteering(root: THREE.Object3D, wheel: THREE.Object3D, tyre: THREE.Mesh): number {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const tyreInRoot = new THREE.Matrix4().multiplyMatrices(toRoot, tyre.matrixWorld);

  const geometry = tyre.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = box.getSize(new THREE.Vector3());
  const axis = size.x <= size.y && size.x <= size.z ? 0 : size.y <= size.z ? 1 : 2;
  const axle = new THREE.Vector3().setComponent(axis, 1).transformDirection(tyreInRoot);

  const flat = new THREE.Vector3(axle.x, 0, axle.z);
  if (flat.lengthSq() < 1e-8) return 0;
  flat.normalize();
  if (flat.x < 0) flat.negate();

  // Both vectors are horizontal, so this is a pure yaw about +Y.
  const fix = new THREE.Quaternion().setFromUnitVectors(flat, LATERAL);
  const angle = 2 * Math.acos(Math.min(1, Math.abs(fix.w)));
  if (angle < MIN_CORRECTION || !wheel.parent) return 0;

  const centre = box.getCenter(new THREE.Vector3()).applyMatrix4(tyreInRoot);
  const pivot = new THREE.Matrix4()
    .makeTranslation(centre.x, centre.y, centre.z)
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(fix))
    .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z));
  const wheelInRoot = new THREE.Matrix4().multiplyMatrices(toRoot, wheel.matrixWorld);
  const parentInRoot = new THREE.Matrix4().multiplyMatrices(toRoot, wheel.parent.matrixWorld);
  const local = parentInRoot.invert().multiply(pivot.multiply(wheelInRoot));
  local.decompose(wheel.position, wheel.quaternion, wheel.scale);
  wheel.updateMatrixWorld(true);
  return angle;
}
