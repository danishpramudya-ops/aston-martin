import type { AstonCar } from '../data/cars';

export type GrilleStyle = 'venturi-gaping' | 'valhalla-mouth' | 'vaned-gt';
export type TailStyle = 'valkyrie-blade' | 'valhalla-blade' | 'kamm-7-blades' | 'c-clamp';
export type ExhaustStyle = 'top-twin' | 'top-quad' | 'lower-quad' | 'lower-dual';
export type WheelStyle = 'turbofan-aero' | 'motorsport-y' | 'forged-multi';
export type DoorStyle = 'gull-canopy' | 'dihedral' | 'swan-wing';
export type RoofStyle = 'teardrop-scoop' | 'snorkel-buttress' | 'panoramic-glass' | 'coupe-metal';

export interface Car3DBlueprint {
  id: string;
  L: number;
  W: number;
  H: number;
  WB: number;
  zFrontAxle: number;
  zRearAxle: number;
  trackFrontHalf: number;
  trackRearHalf: number;
  wheelRadiusF: number;
  wheelRadiusR: number;
  tireWidthF: number;
  tireWidthR: number;
  // Cabin interior geometry anchors (world meters, y=0 ground, -Z nose, +Z tail)
  driverX: number;
  eyeY: number;
  eyeZ: number;
  dashZ: number;
  wheelZ: number;
  wheelY: number;
  seatBackZ: number;
  cabinFloorY: number;
  // Greenhouse glass bounds
  windscreenBottomZ: number;
  windscreenBottomY: number;
  windscreenTopZ: number;
  windscreenTopY: number;
  roofRearZ: number;
  roofRearY: number;
  cabinHalfW: number;
  // Door hinges cleanly at A-pillar edge
  doorFrontZ: number;
  doorRearZ: number;
  doorBottomY: number;
  doorBeltY: number;
  // Signatures
  grilleStyle: GrilleStyle;
  tailStyle: TailStyle;
  exhaustStyle: ExhaustStyle;
  wheelStyle: WheelStyle;
  doorStyle: DoorStyle;
  roofStyle: RoofStyle;
  hasActiveWing: boolean;
  rearWingY: number;
  rearWingZ: number;
}

export const CAR_3D_BLUEPRINTS: Record<string, Car3DBlueprint> = {
  valkyrie: {
    id: 'valkyrie',
    L: 4.5,
    W: 1.98,
    H: 1.07,
    WB: 2.77,
    zFrontAxle: -1.32,
    zRearAxle: 1.45,
    trackFrontHalf: 0.79,
    trackRearHalf: 0.805,
    wheelRadiusF: 0.34,
    wheelRadiusR: 0.365,
    tireWidthF: 0.24,
    tireWidthR: 0.29,
    driverX: -0.22,
    eyeY: 0.75,
    eyeZ: -0.02,
    dashZ: -0.64,
    wheelZ: -0.44,
    wheelY: 0.62,
    seatBackZ: 0.28,
    cabinFloorY: 0.14,
    windscreenBottomZ: -0.9,
    windscreenBottomY: 0.57,
    windscreenTopZ: -0.22,
    windscreenTopY: 1.03,
    roofRearZ: 0.54,
    roofRearY: 0.96,
    cabinHalfW: 0.52,
    doorFrontZ: -0.88,
    doorRearZ: 0.48,
    doorBottomY: 0.24,
    doorBeltY: 0.68,
    grilleStyle: 'venturi-gaping',
    tailStyle: 'valkyrie-blade',
    exhaustStyle: 'top-twin',
    wheelStyle: 'turbofan-aero',
    doorStyle: 'gull-canopy',
    roofStyle: 'teardrop-scoop',
    hasActiveWing: true,
    rearWingY: 0.86,
    rearWingZ: 1.98,
  },
  valhalla: {
    id: 'valhalla',
    L: 4.63,
    W: 2.02,
    H: 1.16,
    WB: 2.76,
    zFrontAxle: -1.36,
    zRearAxle: 1.4,
    trackFrontHalf: 0.825,
    trackRearHalf: 0.835,
    wheelRadiusF: 0.348,
    wheelRadiusR: 0.368,
    tireWidthF: 0.245,
    tireWidthR: 0.295,
    driverX: -0.32,
    eyeY: 0.84,
    eyeZ: 0.06,
    dashZ: -0.58,
    wheelZ: -0.36,
    wheelY: 0.69,
    seatBackZ: 0.36,
    cabinFloorY: 0.14,
    windscreenBottomZ: -0.88,
    windscreenBottomY: 0.63,
    windscreenTopZ: -0.16,
    windscreenTopY: 1.13,
    roofRearZ: 0.58,
    roofRearY: 1.08,
    cabinHalfW: 0.62,
    doorFrontZ: -0.86,
    doorRearZ: 0.56,
    doorBottomY: 0.16,
    doorBeltY: 0.72,
    grilleStyle: 'valhalla-mouth',
    tailStyle: 'valhalla-blade',
    exhaustStyle: 'top-quad',
    wheelStyle: 'motorsport-y',
    doorStyle: 'dihedral',
    roofStyle: 'snorkel-buttress',
    hasActiveWing: true,
    rearWingY: 0.91,
    rearWingZ: 2.04,
  },
  vanquish: {
    id: 'vanquish',
    L: 4.85,
    W: 2.02,
    H: 1.29,
    WB: 2.885,
    zFrontAxle: -1.48,
    zRearAxle: 1.405,
    trackFrontHalf: 0.82,
    trackRearHalf: 0.83,
    wheelRadiusF: 0.36,
    wheelRadiusR: 0.37,
    tireWidthF: 0.245,
    tireWidthR: 0.295,
    driverX: -0.35,
    eyeY: 0.97,
    eyeZ: 0.44,
    dashZ: -0.2,
    wheelZ: 0.02,
    wheelY: 0.8,
    seatBackZ: 0.76,
    cabinFloorY: 0.16,
    windscreenBottomZ: -0.58,
    windscreenBottomY: 0.77,
    windscreenTopZ: 0.18,
    windscreenTopY: 1.27,
    roofRearZ: 1.12,
    roofRearY: 1.2,
    cabinHalfW: 0.68,
    doorFrontZ: -0.56,
    doorRearZ: 0.66,
    doorBottomY: 0.16,
    doorBeltY: 0.82,
    grilleStyle: 'vaned-gt',
    tailStyle: 'kamm-7-blades',
    exhaustStyle: 'lower-quad',
    wheelStyle: 'forged-multi',
    doorStyle: 'swan-wing',
    roofStyle: 'panoramic-glass',
    hasActiveWing: false,
    rearWingY: 0,
    rearWingZ: 0,
  },
  db12: {
    id: 'db12',
    L: 4.725,
    W: 2.0,
    H: 1.295,
    WB: 2.805,
    zFrontAxle: -1.4,
    zRearAxle: 1.405,
    trackFrontHalf: 0.815,
    trackRearHalf: 0.825,
    wheelRadiusF: 0.355,
    wheelRadiusR: 0.365,
    tireWidthF: 0.245,
    tireWidthR: 0.29,
    driverX: -0.35,
    eyeY: 0.98,
    eyeZ: 0.4,
    dashZ: -0.24,
    wheelZ: -0.02,
    wheelY: 0.81,
    seatBackZ: 0.72,
    cabinFloorY: 0.16,
    windscreenBottomZ: -0.62,
    windscreenBottomY: 0.77,
    windscreenTopZ: 0.14,
    windscreenTopY: 1.28,
    roofRearZ: 1.08,
    roofRearY: 1.2,
    cabinHalfW: 0.69,
    doorFrontZ: -0.6,
    doorRearZ: 0.62,
    doorBottomY: 0.16,
    doorBeltY: 0.82,
    grilleStyle: 'vaned-gt',
    tailStyle: 'c-clamp',
    exhaustStyle: 'lower-dual',
    wheelStyle: 'forged-multi',
    doorStyle: 'swan-wing',
    roofStyle: 'coupe-metal',
    hasActiveWing: false,
    rearWingY: 0,
    rearWingZ: 0,
  },
};

export function getBlueprintForCar(car: AstonCar): Car3DBlueprint {
  return CAR_3D_BLUEPRINTS[car.id] || CAR_3D_BLUEPRINTS.valkyrie;
}

export interface CrossSectionSample {
  z: number;
  halfW: number;
  deckY: number;
  sillY: number;
  waistFlare: number;
  crownDrop: number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Evaluates sculpted automotive beltline / fender height & flush wheel-enclosing planform width
 * along u in [0, 1] (-Z front nose to +Z rear diffuser).
 */
export function evaluateLowerCoachwork(bp: Car3DBlueprint, u: number): CrossSectionSample {
  const z = (u - 0.5) * bp.L;
  const frontU = (bp.zFrontAxle + bp.L * 0.5) / bp.L;
  const rearU = (bp.zRearAxle + bp.L * 0.5) / bp.L;

  const frontFenderBulge = Math.exp(-Math.pow((u - frontU) / 0.115, 2));
  const rearHaunchBulge = Math.exp(-Math.pow((u - rearU) / 0.135, 2));

  if (bp.id === 'valkyrie') {
    const noseTaper = smoothstep(0.0, 0.14, u);
    const tailTaper = 1 - 0.1 * smoothstep(0.86, 1.0, u);
    const deckY =
      0.24 +
      noseTaper * 0.24 +
      frontFenderBulge * 0.26 +
      rearHaunchBulge * 0.22 +
      smoothstep(0.66, 0.96, u) * 0.18;
    const sillY =
      u < 0.16
        ? 0.24 - smoothstep(0.06, 0.2, u) * 0.13
        : u > 0.74
          ? 0.11 + smoothstep(0.74, 1.0, u) * 0.24
          : 0.11;
    // Wide muscular pods enclosing tracks (0.955F / 0.99R) cleanly!
    const halfW =
      (bp.W * 0.5) *
      tailTaper *
      (0.72 + 0.19 * noseTaper + 0.085 * frontFenderBulge + 0.105 * rearHaunchBulge);
    return { z, halfW, deckY, sillY, waistFlare: 0.06, crownDrop: 0.03 };
  }

  if (bp.id === 'valhalla') {
    const noseRise = Math.pow(smoothstep(0.0, 0.25, u), 0.72);
    const engineDeck = smoothstep(0.56, 0.92, u) * 0.13;
    const deckY =
      0.22 +
      noseRise * 0.4 +
      frontFenderBulge * 0.13 +
      rearHaunchBulge * 0.15 +
      engineDeck -
      smoothstep(0.93, 1.0, u) * 0.07;
    const sillY = u > 0.8 ? 0.11 + smoothstep(0.8, 1.0, u) * 0.2 : 0.105;
    const waistCinched = 1 - 0.045 * Math.exp(-Math.pow((u - 0.5) / 0.16, 2));
    const tailTaper = 1 - 0.08 * smoothstep(0.88, 1.0, u);
    const halfW =
      (bp.W * 0.5) *
      waistCinched *
      tailTaper *
      (0.84 + 0.12 * noseRise + 0.04 * frontFenderBulge + 0.065 * rearHaunchBulge);
    return { z, halfW, deckY, sillY, waistFlare: 0.045, crownDrop: 0.025 };
  }

  // Vanquish & DB12: Flush wide-stance fenders enclosing front & rear axles cleanly
  const noseRise = Math.pow(smoothstep(0.0, 0.32, u), 0.75);
  const tailSlope = 1 - 0.1 * smoothstep(0.88, 1.0, u);
  const deckY =
    (0.25 +
      noseRise * 0.51 +
      frontFenderBulge * 0.06 +
      rearHaunchBulge * 0.12 +
      (bp.id === 'vanquish' ? 0.03 * smoothstep(0.7, 0.95, u) : 0)) *
    tailSlope;
  const sillY = u > 0.82 ? 0.115 + smoothstep(0.82, 1.0, u) * 0.19 : 0.11;
  const nosePlan = 0.84 + 0.14 * Math.pow(smoothstep(0.0, 0.2, u), 0.65);
  const haunchWide = 0.045 * rearHaunchBulge + 0.025 * frontFenderBulge;
  const halfW = (bp.W * 0.5) * Math.min(1.03, nosePlan + haunchWide) * (1 - 0.09 * smoothstep(0.91, 1.0, u));
  return { z, halfW, deckY, sillY, waistFlare: 0.04, crownDrop: 0.028 };
}
