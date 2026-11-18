import * as THREE from 'three';
import type { Car3DBlueprint } from './carProfiles';

export type CameraPovId =
  | 'hero-34'
  | 'front-aero'
  | 'side-profile'
  | 'rear-blades'
  | 'door-threshold'
  | 'driver-eye'
  | 'center-console'
  | 'cabin-panorama';

export interface CameraPovSpec {
  id: CameraPovId;
  code: string;
  label: string;
  zone: 'exterior' | 'threshold' | 'interior';
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  rotateSpeed: number;
  autoOpenDoors?: boolean;
}

/**
 * Helper to place OrbitControls target strictly at a short look-vector distance (0.24m)
 * inside cockpit POVs so OrbitControls distance clamping never pulls the camera off the driver seat.
 */
function buildCockpitTarget(pos: THREE.Vector3, lookAtPoint: THREE.Vector3, radius = 0.24): THREE.Vector3 {
  const dir = new THREE.Vector3().subVectors(lookAtPoint, pos).normalize();
  return pos.clone().addScaledVector(dir, radius);
}

/**
 * Computes 8 seamless camera POVs calibrated directly to the active vehicle's dimensions
 * so both exterior 360° orbits and inside-the-cockpit look-around POVs frame cleanly.
 */
export function getCameraPovsForCar(bp: Car3DBlueprint): CameraPovSpec[] {
  const noseZ = -bp.L * 0.5;
  const tailZ = bp.L * 0.5;

  const native = bp.nativeCockpit;
  const v = (t: [number, number, number]) => new THREE.Vector3(t[0], t[1], t[2]);

  const driverPos = native ? v(native.driver.pos) : new THREE.Vector3(bp.driverX, bp.eyeY + 0.03, bp.eyeZ + 0.05);
  const driverAim = native
    ? v(native.driver.aim)
    : new THREE.Vector3(bp.driverX * 0.72, bp.wheelY - 0.04, bp.dashZ - 0.35);

  const consolePos = native ? v(native.console.pos) : new THREE.Vector3(0.03, bp.eyeY - 0.02, bp.seatBackZ - 0.28);
  const consoleAim = native
    ? v(native.console.aim)
    : new THREE.Vector3(0.0, bp.cabinFloorY + 0.26, bp.dashZ + 0.22);

  const panoramaPos = native
    ? v(native.panorama.pos)
    : new THREE.Vector3(-bp.driverX * 0.72, bp.eyeY + 0.04, bp.seatBackZ - 0.14);
  const panoramaAim = native
    ? v(native.panorama.aim)
    : new THREE.Vector3(bp.driverX * 0.55, bp.wheelY - 0.02, bp.dashZ - 0.18);

  return [
    {
      id: 'hero-34',
      code: '01',
      label: 'Hero 3/4',
      zone: 'exterior',
      position: new THREE.Vector3(-3.85, 1.38, -3.95),
      target: new THREE.Vector3(0, bp.H * 0.42, 0.08),
      fov: 35,
      minDistance: 2.1,
      maxDistance: 9.2,
      minPolarAngle: 0.12,
      maxPolarAngle: Math.PI * 0.492,
      rotateSpeed: 0.68,
    },
    {
      id: 'front-aero',
      code: '02',
      label: 'Front Nose',
      zone: 'exterior',
      position: new THREE.Vector3(0.38, 0.85, noseZ - 2.65),
      target: new THREE.Vector3(0, 0.45, noseZ + 0.55),
      fov: 33,
      minDistance: 1.7,
      maxDistance: 8.5,
      minPolarAngle: 0.12,
      maxPolarAngle: Math.PI * 0.492,
      rotateSpeed: 0.65,
    },
    {
      id: 'side-profile',
      code: '03',
      label: 'Silhouette',
      zone: 'exterior',
      position: new THREE.Vector3(-5.65, 0.82, 0.0),
      target: new THREE.Vector3(0, bp.H * 0.44, 0.0),
      fov: 30,
      minDistance: 2.3,
      maxDistance: 9.5,
      minPolarAngle: 0.12,
      maxPolarAngle: Math.PI * 0.492,
      rotateSpeed: 0.65,
    },
    {
      id: 'rear-blades',
      code: '04',
      label: 'Rear Deck',
      zone: 'exterior',
      position: new THREE.Vector3(3.35, 1.22, tailZ + 2.85),
      target: new THREE.Vector3(0, 0.52, tailZ - 0.55),
      fov: 35,
      minDistance: 1.9,
      maxDistance: 9.0,
      minPolarAngle: 0.12,
      maxPolarAngle: Math.PI * 0.492,
      rotateSpeed: 0.65,
    },
    {
      id: 'door-threshold',
      code: '05',
      label: 'Door Sill',
      zone: 'threshold',
      position: new THREE.Vector3(-2.15, bp.eyeY + 0.18, bp.eyeZ + 0.46),
      target: new THREE.Vector3(bp.driverX * 0.22, bp.eyeY - 0.14, bp.dashZ + 0.18),
      fov: 46,
      minDistance: 1.15,
      maxDistance: 6.5,
      minPolarAngle: 0.16,
      maxPolarAngle: Math.PI * 0.52,
      rotateSpeed: 0.55,
      autoOpenDoors: true,
    },
    {
      id: 'driver-eye',
      code: '06',
      label: 'Driver POV',
      zone: 'interior',
      position: driverPos,
      target: buildCockpitTarget(driverPos, driverAim, 0.24),
      fov: 62,
      minDistance: 0.14,
      maxDistance: 0.34,
      minPolarAngle: 0.38,
      maxPolarAngle: Math.PI * 0.76,
      rotateSpeed: -0.45,
    },
    {
      id: 'center-console',
      code: '07',
      label: 'HMI Console',
      zone: 'interior',
      position: consolePos,
      target: buildCockpitTarget(consolePos, consoleAim, 0.22),
      fov: 54,
      minDistance: 0.14,
      maxDistance: 0.34,
      minPolarAngle: 0.4,
      maxPolarAngle: Math.PI * 0.76,
      rotateSpeed: -0.42,
    },
    {
      id: 'cabin-panorama',
      code: '08',
      label: 'Cabin Sweep',
      zone: 'interior',
      position: panoramaPos,
      target: buildCockpitTarget(panoramaPos, panoramaAim, 0.24),
      fov: 58,
      minDistance: 0.14,
      maxDistance: 0.34,
      minPolarAngle: 0.38,
      maxPolarAngle: Math.PI * 0.78,
      rotateSpeed: -0.45,
    },
  ];
}
