import * as THREE from 'three';
import type { AstonCar, QCabinTrim, QCaliperFinish, QPaintFinish } from '../data/cars';
import { buildCabin3D, type Cabin3DResult } from './cabinBuilder';
import {
  evaluateLowerCoachwork,
  getBlueprintForCar,
  type Car3DBlueprint,
} from './carProfiles';
import { getCarbonFiberTextures, getFlakeNormalTexture } from './textures';
import { buildWheels3D } from './wheelBuilder';

export interface Car3DInstance {
  root: THREE.Group;
  blueprint: Car3DBlueprint;
  setPaint: (paint: QPaintFinish) => void;
  setCaliper: (caliper: QCaliperFinish) => void;
  setCabinTrim: (trim: QCabinTrim) => void;
  setDoorsOpen: (open: boolean) => void;
  setLightsMode: (nightMode: boolean) => void;
  setXRay: (xray: boolean) => void;
  setActiveAero: (speedKmh: number) => void;
  setBrakeThermal: (tempNorm: number) => void;
  update: (dt: number) => void;
  dispose: () => void;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Evaluates smooth semicircular wheel-well arch height for any Z coordinate
 * so outer fender skirts sweep smoothly up & over every tire with zero crinkles.
 */
function evalWheelArchLift(bp: Car3DBlueprint, z: number): number {
  let archH = 0;
  const cutRF = bp.wheelRadiusF * 1.15;
  const dzF = Math.abs(z - bp.zFrontAxle);
  if (dzF < cutRF) {
    archH = Math.max(
      archH,
      bp.wheelRadiusF * 0.98 + Math.sqrt(Math.max(0, cutRF * cutRF - dzF * dzF)) * 0.92
    );
  }
  const cutRR = bp.wheelRadiusR * 1.15;
  const dzR = Math.abs(z - bp.zRearAxle);
  if (dzR < cutRR) {
    archH = Math.max(
      archH,
      bp.wheelRadiusR * 0.98 + Math.sqrt(Math.max(0, cutRR * cutRR - dzR * dzR)) * 0.92
    );
  }
  return archH;
}

/**
 * Generates a high-density smooth closed lofted automotive surface with seamless G2 curvature
 * and smooth wheel-well arch clearings along outer lower edges.
 */
function buildLoftedSegment(
  bp: Car3DBlueprint,
  uStart: number,
  uEnd: number,
  slices: number,
  cols: number,
  topProfile: (u: number, tNorm: number, envHalfW: number, deckY: number) => [number, number],
  botProfile: (u: number, tNorm: number, envHalfW: number, sillY: number, z: number, deckY: number) => [number, number]
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const ringCols = cols * 2 + 1;

  for (let i = 0; i <= slices; i++) {
    const fu = i / slices;
    const u = uStart + (uEnd - uStart) * fu;
    const env = evaluateLowerCoachwork(bp, u);

    for (let j = 0; j <= cols; j++) {
      const tNorm = (j / cols) * 2 - 1;
      const [px, py] = topProfile(u, tNorm, env.halfW, env.deckY);
      positions.push(px, py, env.z);
      uvs.push(fu, j / cols);
    }
    for (let j = 0; j < cols; j++) {
      const tNorm = 1 - ((j + 1) / cols) * 2;
      const [px, py] = botProfile(u, tNorm, env.halfW, env.sillY, env.z, env.deckY);
      positions.push(px, py, env.z);
      uvs.push(fu, 1 + (j + 1) / cols);
    }
  }

  for (let i = 0; i < slices; i++) {
    for (let j = 0; j < ringCols - 1; j++) {
      const a = i * ringCols + j;
      const b = a + 1;
      const c = (i + 1) * ringCols + j;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
    const a = i * ringCols + (ringCols - 1);
    const b = i * ringCols;
    const c = (i + 1) * ringCols + (ringCols - 1);
    const d = (i + 1) * ringCols;
    indices.push(a, c, b, b, c, d);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates an articulated outer door panel curving flush with the car's exact beltline
 * & side tumblehome along [uDoorFront .. uDoorRear] in local hinge space.
 */
function buildCurvedDoorSkin(
  bp: Car3DBlueprint,
  side: number,
  hingePos: THREE.Vector3,
  uDoorFront: number,
  uDoorRear: number
): THREE.BufferGeometry {
  const slices = 20;
  const rows = 12;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= slices; i++) {
    const fu = i / slices;
    const u = uDoorFront + (uDoorRear - uDoorFront) * fu;
    const env = evaluateLowerCoachwork(bp, u);

    for (let r = 0; r <= rows; r++) {
      const fv = r / rows; // 0 = bottom sill, 1 = top window beltline
      const topX = env.halfW * 0.99;
      const botX = env.halfW * 0.935;
      const bulge = Math.sin(fv * Math.PI) * 0.025;
      const aeroCove =
        (bp.id === 'valhalla' || bp.id === 'valkyrie') && fv < 0.55
          ? -0.048 * Math.sin((fv / 0.55) * Math.PI) * Math.sin(fu * Math.PI)
          : 0;
      const worldX = side * (botX + (topX - botX) * fv + bulge + aeroCove);
      const worldY = bp.doorBottomY + (env.deckY - 0.028 - bp.doorBottomY) * fv;
      const worldZ = env.z;

      positions.push(worldX - hingePos.x, worldY - hingePos.y, worldZ - hingePos.z);
      uvs.push(fu, fv);
    }
  }

  for (let i = 0; i < slices; i++) {
    for (let r = 0; r < rows; r++) {
      const a = i * (rows + 1) + r;
      const b = a + 1;
      const c = (i + 1) * (rows + 1) + r;
      const d = c + 1;
      if (side > 0) {
        indices.push(a, b, c, b, d, c);
      } else {
        indices.push(a, c, b, b, c, d);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds an optical curved glass strip between bottom edge endpoints and top edge endpoints.
 */
function buildCurvedSurfaceQuad(
  botLeft: THREE.Vector3,
  botRight: THREE.Vector3,
  topLeft: THREE.Vector3,
  topRight: THREE.Vector3,
  curveBowZ: number,
  curveBowY: number,
  mat: THREE.Material
): THREE.Mesh {
  const segsU = 16;
  const segsV = 10;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let v = 0; v <= segsV; v++) {
    const fv = v / segsV;
    for (let u = 0; u <= segsU; u++) {
      const fu = u / segsU;
      const b = new THREE.Vector3().lerpVectors(botLeft, botRight, fu);
      const t = new THREE.Vector3().lerpVectors(topLeft, topRight, fu);
      const p = new THREE.Vector3().lerpVectors(b, t, fv);
      const archX = Math.sin(fu * Math.PI);
      const bow = archX * Math.sin(fv * Math.PI);
      p.z += curveBowZ * (0.35 * archX + 0.65 * bow);
      p.y += curveBowY * (0.4 * archX + 0.6 * bow);
      positions.push(p.x, p.y, p.z);
    }
  }

  for (let v = 0; v < segsV; v++) {
    for (let u = 0; u < segsU; u++) {
      const a = v * (segsU + 1) + u;
      const b = a + 1;
      const c = (v + 1) * (segsU + 1) + u;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

/**
 * Builds the complete photorealistic 3D Aston Martin vehicle assembly:
 * fluid wheel-enclosing sculpted coachwork, flush mathematically aligned curved doors,
 * continuous swept A/B/C pillars & domed glasshouse, recessed fender wheels,
 * signature Aston grilles/headlights/light-blades, and full 3D cabin interior.
 */
export function buildAstonCar3D(
  car: AstonCar,
  initialPaint: QPaintFinish,
  initialCaliper: QCaliperFinish,
  initialTrim: QCabinTrim
): Car3DInstance {
  const bp = getBlueprintForCar(car);
  const root = new THREE.Group();

  const { map: carbonMap, bumpMap: carbonBump } = getCarbonFiberTextures();
  const flakeNormal = getFlakeNormalTexture();

  const paintColor = new THREE.Color(initialPaint.isNeutral ? '#b4bbc0' : initialPaint.hex);
  const paintMat = new THREE.MeshPhysicalMaterial({
    color: paintColor,
    metalness: initialPaint.isNeutral ? 0.78 : 0.72,
    roughness: 0.14,
    clearcoat: 1.0,
    clearcoatRoughness: 0.045,
    normalMap: flakeNormal,
    normalScale: new THREE.Vector2(0.03, 0.03),
    reflectivity: 1.0,
    envMapIntensity: 1.9,
    transparent: false,
    opacity: 1.0,
    side: THREE.DoubleSide,
  });

  const carbonMat = new THREE.MeshPhysicalMaterial({
    map: carbonMap,
    bumpMap: carbonBump,
    bumpScale: 0.005,
    roughness: 0.28,
    metalness: 0.35,
    clearcoat: 0.75,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.4,
    side: THREE.DoubleSide,
  });

  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: '#0d100f',
    roughness: 0.76,
    metalness: 0.22,
    side: THREE.DoubleSide,
  });

  const grilleMetalMat = new THREE.MeshStandardMaterial({
    color: '#a3aba8',
    metalness: 0.92,
    roughness: 0.18,
  });

  const exhaustMat = new THREE.MeshStandardMaterial({
    color: '#736c64',
    metalness: 0.94,
    roughness: 0.22,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#0d1311',
    transparent: true,
    opacity: 0.22,
    roughness: 0.04,
    metalness: 0.12,
    reflectivity: 1.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const drlMat = new THREE.MeshStandardMaterial({
    color: '#f2f7fa',
    emissive: new THREE.Color('#dff2ff'),
    emissiveIntensity: 1.85,
    roughness: 0.1,
  });

  const tailBladeMat = new THREE.MeshStandardMaterial({
    color: '#ff1f2d',
    emissive: new THREE.Color('#ff1424'),
    emissiveIntensity: 2.25,
    roughness: 0.12,
  });

  // =========================================================================
  // 1. CONTINUOUS SCULPTED COACHWORK (Aligned seamlessly at uDoorFront & uDoorRear)
  // =========================================================================
  const uDoorFront = (bp.doorFrontZ + bp.L * 0.5) / bp.L;
  const uDoorRear = (bp.doorRearZ + bp.L * 0.5) / bp.L;

  // Front Clamshell & Bonnet ending flush right at uDoorFront
  const frontBodyGeo = buildLoftedSegment(
    bp,
    0.0,
    uDoorFront,
    36,
    22,
    (u, tNorm, halfW, deckY) => {
      const x = tNorm * halfW;
      const absT = Math.abs(tNorm);
      const fenderCrown =
        Math.exp(-Math.pow((absT - 0.72) / 0.22, 2)) * (bp.id === 'valkyrie' ? 0.085 : 0.042);
      const powerDome = Math.exp(-Math.pow(absT / 0.26, 2)) * 0.022;
      const rollOff = Math.pow(absT, 3.2) * 0.032;
      const noseDrop = u < 0.07 ? (0.07 - u) * 0.85 : 0;
      const y = deckY + fenderCrown + powerDome - rollOff - noseDrop;
      return [x, Math.max(0.2, y)];
    },
    (u, tNorm, halfW, sillY, z, deckY) => {
      const absT = Math.abs(tNorm);
      const archLift = evalWheelArchLift(bp, z);
      const archMask = smoothstep(0.7, 0.88, absT);
      const baseUndercut = 1 - 0.06 * Math.pow(absT, 0.5);
      const edgeY = Math.min(deckY - 0.04, Math.max(sillY, archLift * archMask));
      const tunnelLift = bp.id === 'valkyrie' && absT > 0.28 && absT < 0.78 && u > 0.06 ? 0.11 : 0;
      return [tNorm * halfW * baseUndercut, edgeY + tunnelLift];
    }
  );
  root.add(new THREE.Mesh(frontBodyGeo, paintMat));

  // Inner dark Wheelhouse Backing Shields behind front tires (zero floating rings!)
  [-1, 1].forEach((side) => {
    const shieldF = new THREE.Mesh(new THREE.CircleGeometry(bp.wheelRadiusF * 1.12, 28), darkTrimMat);
    shieldF.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    shieldF.position.set(side * (bp.trackFrontHalf - bp.tireWidthF * 0.58), bp.wheelRadiusF, bp.zFrontAxle);
    root.add(shieldF);
  });

  // Lower Rocker Side Skirts & Door Threshold Trim along [doorFrontZ .. doorRearZ]
  [-1, 1].forEach((side) => {
    const sillLen = bp.doorRearZ - bp.doorFrontZ + 0.08;
    const sillZ = (bp.doorFrontZ + bp.doorRearZ) * 0.5;
    const sillEnv = evaluateLowerCoachwork(bp, (sillZ + bp.L * 0.5) / bp.L);
    const rocker = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.085, sillLen), carbonMat);
    rocker.position.set(side * (sillEnv.halfW - 0.1), bp.doorBottomY - 0.035, sillZ);
    root.add(rocker);
  });

  // Rear Quarter Haunches surrounding rear cabin glass [uDoorRear .. uAfterGlass]
  const uRearGlassEnd = (bp.roofRearZ + bp.L * 0.5) / bp.L;
  const uAfterGlass = Math.min(0.92, Math.max(uDoorRear + 0.05, uRearGlassEnd - 0.02));

  [-1, 1].forEach((side) => {
    const flankGeo = buildLoftedSegment(
      bp,
      uDoorRear,
      uAfterGlass,
      18,
      10,
      (_u, tNorm, halfW, deckY) => {
        const outerFrac = (tNorm + 1) * 0.5;
        const innerX = bp.cabinHalfW * 0.86;
        const xAbs = innerX + (halfW - innerX) * outerFrac;
        const haunch = Math.sin(outerFrac * Math.PI) * 0.05;
        const y = deckY + haunch - Math.pow(outerFrac, 3.0) * 0.032;
        return [side * xAbs, y];
      },
      (_u, tNorm, halfW, sillY, z, deckY) => {
        const outerFrac = (tNorm + 1) * 0.5;
        const innerX = bp.cabinHalfW * 0.72;
        const xAbs = innerX + (halfW * 0.94 - innerX) * outerFrac;
        const archLift = evalWheelArchLift(bp, z);
        const archMask = smoothstep(0.65, 0.88, outerFrac);
        const y = Math.min(deckY - 0.04, Math.max(sillY, archLift * archMask));
        return [side * xAbs, y];
      }
    );
    root.add(new THREE.Mesh(flankGeo, paintMat));

    const shieldR = new THREE.Mesh(new THREE.CircleGeometry(bp.wheelRadiusR * 1.12, 28), darkTrimMat);
    shieldR.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    shieldR.position.set(side * (bp.trackRearHalf - bp.tireWidthR * 0.58), bp.wheelRadiusR, bp.zRearAxle);
    root.add(shieldR);
  });

  // Full-width sculpted rear tail transom & diffuser shell [uAfterGlass .. 1.0]
  const rearTailGeo = buildLoftedSegment(
    bp,
    uAfterGlass - 0.015,
    1.0,
    20,
    20,
    (u, tNorm, halfW, deckY) => {
      const absT = Math.abs(tNorm);
      const x = tNorm * halfW;
      const haunch = Math.exp(-Math.pow((absT - 0.74) / 0.22, 2)) * 0.05;
      const tailLip = u > 0.94 ? (u - 0.94) * 0.52 : 0;
      const y = deckY + haunch + tailLip - Math.pow(absT, 3.0) * 0.036;
      return [x, y];
    },
    (u, tNorm, halfW, sillY, z, deckY) => {
      const absT = Math.abs(tNorm);
      const archLift = evalWheelArchLift(bp, z);
      const archMask = smoothstep(0.68, 0.88, absT);
      const diffuserLift = bp.id === 'valkyrie' ? Math.exp(-Math.pow(absT / 0.58, 2)) * 0.11 : 0;
      const edgeY = Math.min(deckY - 0.04, Math.max(sillY, archLift * archMask));
      return [tNorm * halfW * 0.94, edgeY + diffuserLift * (u > 0.9 ? 1 : 0.4)];
    }
  );
  root.add(new THREE.Mesh(rearTailGeo, paintMat));

  // =========================================================================
  // 2. EXPOSED CARBON AERO PACKAGE (Splitter, Louvers, Diffuser, Active Wing)
  // =========================================================================
  const noseZ = -bp.L * 0.5;
  const tailZ = bp.L * 0.5;

  const splitter = new THREE.Mesh(
    new THREE.BoxGeometry(bp.W * 0.92, 0.02, 0.4),
    carbonMat
  );
  splitter.position.set(0, bp.id === 'valkyrie' ? 0.072 : 0.095, noseZ + 0.16);
  root.add(splitter);

  [-1, 1].forEach((side) => {
    const winglet = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.085, 0.22), carbonMat);
    winglet.position.set(side * bp.W * 0.455, 0.125, noseZ + 0.2);
    root.add(winglet);
  });

  const underTray = new THREE.Mesh(
    new THREE.BoxGeometry(bp.W * 0.72, 0.02, bp.L * 0.84),
    carbonMat
  );
  underTray.position.set(0, 0.068, 0.02);
  root.add(underTray);

  const diffuserBase = new THREE.Mesh(
    new THREE.BoxGeometry(bp.W * 0.84, 0.075, 0.46),
    carbonMat
  );
  diffuserBase.position.set(0, 0.18, tailZ - 0.18);
  diffuserBase.rotation.x = -0.22;
  root.add(diffuserBase);

  const strakeCount = bp.id === 'valkyrie' ? 7 : 5;
  for (let s = 0; s < strakeCount; s++) {
    const sx = ((s / (strakeCount - 1)) - 0.5) * bp.W * 0.72;
    const strake = new THREE.Mesh(
      new THREE.BoxGeometry(0.014, bp.id === 'valkyrie' ? 0.26 : 0.15, 0.34),
      carbonMat
    );
    strake.position.set(sx, bp.id === 'valkyrie' ? 0.19 : 0.135, tailZ - 0.1);
    strake.rotation.x = -0.18;
    root.add(strake);
  }

  // Sculpted Bonnet Louvres (Vanquish exposed twin thermos-louvres / DB12 vents)
  if (bp.id === 'vanquish' || bp.id === 'db12') {
    [-1, 1].forEach((side) => {
      const ventZ = bp.dashZ - 0.68;
      const ventY = evaluateLowerCoachwork(bp, (ventZ + bp.L * 0.5) / bp.L).deckY + 0.012;
      const louverFrame = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.01, 0.38), carbonMat);
      louverFrame.position.set(side * 0.34, ventY, ventZ);
      louverFrame.rotation.x = -0.09;
      louverFrame.rotation.y = side * 0.1;
      root.add(louverFrame);

      if (bp.id === 'vanquish') {
        for (let lv = 0; lv < 5; lv++) {
          const slat = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.012, 0.016), darkTrimMat);
          slat.position.set(side * 0.34, ventY + 0.006 - lv * 0.004, ventZ - 0.13 + lv * 0.065);
          slat.rotation.x = -0.45;
          slat.rotation.y = side * 0.1;
          root.add(slat);
        }
      }
    });
  }

  // Hydraulic / Swan-Neck Active Rear Wing (Valkyrie & Valhalla ONLY)
  const wingGroup = new THREE.Group();
  wingGroup.visible = bp.hasActiveWing;
  if (bp.hasActiveWing) {
    const mainPlane = new THREE.Mesh(
      new THREE.BoxGeometry(bp.W * 0.86, 0.02, bp.id === 'valkyrie' ? 0.25 : 0.2),
      carbonMat
    );
    const flapPlane = new THREE.Mesh(
      new THREE.BoxGeometry(bp.W * 0.84, 0.012, 0.085),
      paintMat
    );
    flapPlane.position.set(0, 0.022, 0.1);
    flapPlane.rotation.x = 0.24;
    wingGroup.add(mainPlane, flapPlane);

    [-1, 1].forEach((side) => {
      const endPlate = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.11, 0.28), carbonMat);
      endPlate.position.set(side * bp.W * 0.43, -0.02, 0.02);
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.24, 0.11), carbonMat);
      pylon.position.set(side * bp.W * 0.22, -0.11, -0.02);
      pylon.rotation.x = -0.18;
      wingGroup.add(endPlate, pylon);
    });
    wingGroup.position.set(0, bp.rearWingY, bp.rearWingZ);
  }
  root.add(wingGroup);

  // =========================================================================
  // 3. FRONT GRILLES, SCULPTED FLUSH HEADLAMPS, TAILLIGHTS & EXHAUSTS
  // =========================================================================
  if (bp.grilleStyle === 'vaned-gt') {
    const gShape = new THREE.Shape();
    const gw = bp.W * 0.27;
    gShape.moveTo(-gw * 0.85, -0.09);
    gShape.lineTo(gw * 0.85, -0.09);
    gShape.bezierCurveTo(gw * 1.02, -0.02, gw * 0.9, 0.1, gw * 0.58, 0.1);
    gShape.bezierCurveTo(gw * 0.2, 0.11, 0, 0.07, 0, 0.07);
    gShape.bezierCurveTo(0, 0.07, -gw * 0.2, 0.11, -gw * 0.58, 0.1);
    gShape.bezierCurveTo(-gw * 0.9, 0.1, -gw * 1.02, -0.02, -gw * 0.85, -0.09);
    const grilleGeo = new THREE.ExtrudeGeometry(gShape, {
      depth: 0.08,
      bevelEnabled: true,
      bevelSize: 0.01,
      bevelThickness: 0.01,
    });
    grilleGeo.center();
    const aperture = new THREE.Mesh(grilleGeo, darkTrimMat);
    aperture.position.set(0, 0.245, noseZ + 0.09);
    root.add(aperture);

    for (let v = 0; v < 5; v++) {
      const vane = new THREE.Mesh(
        new THREE.BoxGeometry(bp.W * 0.5 - v * 0.03, 0.008, 0.095),
        grilleMetalMat
      );
      vane.position.set(0, 0.185 + v * 0.032, noseZ + 0.082);
      root.add(vane);
    }
  } else if (bp.grilleStyle === 'valhalla-mouth') {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(bp.W * 0.56, 0.14, 0.1), darkTrimMat);
    intake.position.set(0, 0.21, noseZ + 0.09);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(bp.W * 0.54, 0.014, 0.11), carbonMat);
    bar.position.set(0, 0.21, noseZ + 0.08);
    root.add(intake, bar);
  } else {
    [-0.18, 0.18].forEach((px) => {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.21, 0.34), carbonMat);
      pylon.position.set(px, 0.16, noseZ + 0.22);
      root.add(pylon);
    });
  }

  // Nose Emblem Wings Badge
  const noseWings = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.014, 0.012), grilleMetalMat);
  noseWings.position.set(0, bp.id === 'valkyrie' ? 0.32 : 0.41, noseZ + 0.095);
  noseWings.rotation.x = -0.35;
  root.add(noseWings);

  // Flush Contoured Tear-Drop / Matrix LED Headlight Pods
  [-1, 1].forEach((side) => {
    const hlGroup = new THREE.Group();
    const hlZ = noseZ + (bp.id === 'valkyrie' ? 0.52 : 0.32);
    const hlU = (hlZ + bp.L * 0.5) / bp.L;
    const hlY = evaluateLowerCoachwork(bp, hlU).deckY - 0.035;
    hlGroup.position.set(side * (bp.W * 0.335), hlY, hlZ);
    hlGroup.rotation.y = -side * 0.38;
    hlGroup.rotation.x = 0.32;

    const bucketGeo = new THREE.SphereGeometry(0.105, 20, 14);
    bucketGeo.scale(1.05, 0.32, 1.32);
    const bucket = new THREE.Mesh(bucketGeo, darkTrimMat);
    hlGroup.add(bucket);

    const drlCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-side * 0.09, -0.01, -0.105),
      new THREE.Vector3(0, -0.016, -0.135),
      new THREE.Vector3(side * 0.085, 0.008, -0.075),
    ]);
    hlGroup.add(new THREE.Mesh(new THREE.TubeGeometry(drlCurve, 18, 0.007, 8, false), drlMat));

    for (let p = 0; p < 3; p++) {
      const proj = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.018, 12), drlMat);
      proj.rotation.x = Math.PI / 2;
      proj.position.set((p - 1) * 0.042, 0.004, -0.1);
      hlGroup.add(proj);
    }
    root.add(hlGroup);
  });

  // Signature Taillight Architecture
  const rearEndEnv = evaluateLowerCoachwork(bp, 0.99);
  if (bp.tailStyle === 'kamm-7-blades') {
    const shield = new THREE.Mesh(
      new THREE.BoxGeometry(bp.W * 0.66, 0.28, 0.04),
      new THREE.MeshPhysicalMaterial({ color: '#080a09', roughness: 0.08, metalness: 0.3, clearcoat: 1 })
    );
    shield.position.set(0, rearEndEnv.deckY - 0.145, tailZ - 0.032);
    root.add(shield);

    [-1, 1].forEach((side) => {
      for (let b = 0; b < 7; b++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16 - b * 0.008, 0.01, 0.022), tailBladeMat);
        blade.position.set(side * (bp.W * 0.265), rearEndEnv.deckY - 0.05 - b * 0.024, tailZ - 0.012);
        blade.rotation.y = side * 0.18;
        root.add(blade);
      }
    });
  } else if (bp.tailStyle === 'c-clamp') {
    [-1, 1].forEach((side) => {
      const cCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * (bp.W * 0.16), rearEndEnv.deckY - 0.05, tailZ - 0.01),
        new THREE.Vector3(side * (bp.W * 0.4), rearEndEnv.deckY - 0.055, tailZ - 0.045),
        new THREE.Vector3(side * (bp.W * 0.42), rearEndEnv.deckY - 0.125, tailZ - 0.05),
        new THREE.Vector3(side * (bp.W * 0.19), rearEndEnv.deckY - 0.135, tailZ - 0.012),
      ]);
      root.add(new THREE.Mesh(new THREE.TubeGeometry(cCurve, 22, 0.009, 8, false), tailBladeMat));
    });
  } else {
    const lightCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-bp.W * 0.36, rearEndEnv.deckY - 0.055, tailZ - 0.05),
      new THREE.Vector3(0, rearEndEnv.deckY - 0.032, tailZ - 0.005),
      new THREE.Vector3(bp.W * 0.36, rearEndEnv.deckY - 0.055, tailZ - 0.05),
    ]);
    root.add(new THREE.Mesh(new THREE.TubeGeometry(lightCurve, 28, 0.009, 8, false), tailBladeMat));
    const rainLight = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.068, 0.022), tailBladeMat);
    rainLight.position.set(0, 0.24, tailZ - 0.015);
    root.add(rainLight);
  }

  // Burnt Titanium Exhaust Tips
  if (bp.exhaustStyle === 'top-twin' || bp.exhaustStyle === 'top-quad') {
    const xs = bp.exhaustStyle === 'top-twin' ? [-0.14, 0.14] : [-0.2, -0.07, 0.07, 0.2];
    xs.forEach((ex) => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.05, 0.16, 18), exhaustMat);
      pipe.rotation.x = Math.PI * 0.38;
      pipe.position.set(ex, rearEndEnv.deckY + 0.04, bp.zRearAxle - 0.12);
      root.add(pipe);
    });
  } else {
    const xs = bp.exhaustStyle === 'lower-quad' ? [-0.56, -0.43, 0.43, 0.56] : [-0.48, 0.48];
    const rPipe = bp.exhaustStyle === 'lower-dual' ? 0.056 : 0.042;
    xs.forEach((ex) => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(rPipe, rPipe, 0.14, 20), exhaustMat);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(ex, 0.24, tailZ - 0.03);
      root.add(pipe);
    });
  }

  // =========================================================================
  // 4. SWEPT GREENHOUSE ARCHES, DOMED ROOF CANOPY & CLEAR OPTICAL WINDSCREEN
  // =========================================================================
  const roofHalfW = bp.cabinHalfW * 0.85;
  const botL = new THREE.Vector3(-bp.cabinHalfW * 1.04, bp.windscreenBottomY, bp.windscreenBottomZ);
  const botR = new THREE.Vector3(bp.cabinHalfW * 1.04, bp.windscreenBottomY, bp.windscreenBottomZ);
  const topL = new THREE.Vector3(-roofHalfW, bp.windscreenTopY, bp.windscreenTopZ);
  const topR = new THREE.Vector3(roofHalfW, bp.windscreenTopY, bp.windscreenTopZ);
  const rearL = new THREE.Vector3(-roofHalfW * 0.9, bp.roofRearY, bp.roofRearZ);
  const rearR = new THREE.Vector3(roofHalfW * 0.9, bp.roofRearY, bp.roofRearZ);
  const cBotL = new THREE.Vector3(-bp.cabinHalfW * 0.88, bp.doorBeltY, bp.zRearAxle + 0.06);
  const cBotR = new THREE.Vector3(bp.cabinHalfW * 0.88, bp.doorBeltY, bp.zRearAxle + 0.06);

  // Continuous swept TubeGeometry rails (A-pillar -> Cantrail -> C-pillar seam-free arch!)
  const pillarMat = bp.id === 'valkyrie' ? carbonMat : darkTrimMat;
  [-1, 1].forEach((side) => {
    const archCurve = new THREE.CatmullRomCurve3([
      side < 0 ? botL : botR,
      side < 0 ? topL : topR,
      new THREE.Vector3(
        side * roofHalfW * 0.96,
        (bp.windscreenTopY + bp.roofRearY) * 0.5 + 0.015,
        (bp.windscreenTopZ + bp.roofRearZ) * 0.5
      ),
      side < 0 ? rearL : rearR,
      side < 0 ? cBotL : cBotR,
    ]);
    root.add(new THREE.Mesh(new THREE.TubeGeometry(archCurve, 44, 0.026, 10, false), pillarMat));
  });

  // Curved arched windshield header & rear header bars
  const fHeaderCurve = new THREE.CatmullRomCurve3([
    topL,
    new THREE.Vector3(0, bp.windscreenTopY + 0.022, bp.windscreenTopZ - 0.03),
    topR,
  ]);
  const rHeaderCurve = new THREE.CatmullRomCurve3([
    rearL,
    new THREE.Vector3(0, bp.roofRearY + 0.02, bp.roofRearZ + 0.02),
    rearR,
  ]);
  root.add(new THREE.Mesh(new THREE.TubeGeometry(fHeaderCurve, 18, 0.024, 10, false), pillarMat));
  root.add(new THREE.Mesh(new THREE.TubeGeometry(rHeaderCurve, 18, 0.024, 10, false), pillarMat));

  // Cambered Double-Curved Roof Surface (Panoramic Glass, Carbon Scoop, or Painted Alloy)
  const roofMatChoice =
    bp.roofStyle === 'panoramic-glass'
      ? glassMat
      : bp.roofStyle === 'teardrop-scoop'
        ? carbonMat
        : paintMat;
  root.add(buildCurvedSurfaceQuad(topL, topR, rearL, rearR, 0.0, 0.028, roofMatChoice));

  if (bp.roofStyle === 'teardrop-scoop' || bp.roofStyle === 'snorkel-buttress') {
    const roofMidZ = (bp.windscreenTopZ + bp.roofRearZ) * 0.5;
    const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.088, 0.5), carbonMat);
    scoop.position.set(0, bp.windscreenTopY + 0.032, roofMidZ + 0.16);
    const dorsalFin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.8), carbonMat);
    dorsalFin.position.set(0, bp.roofRearY + 0.01, bp.roofRearZ + 0.36);
    dorsalFin.rotation.x = -0.14;
    root.add(scoop, dorsalFin);

    if (bp.roofStyle === 'snorkel-buttress') {
      [-1, 1].forEach((side) => {
        const bCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * roofHalfW * 0.82, bp.roofRearY - 0.01, bp.roofRearZ),
          new THREE.Vector3(side * (bp.W * 0.34), rearEndEnv.deckY + 0.03, bp.zRearAxle + 0.34),
        ]);
        root.add(new THREE.Mesh(new THREE.TubeGeometry(bCurve, 16, 0.045, 8, false), paintMat));
      });
    }
  }

  // Wrap-Around Optical Front Windscreen & Rear Fastback Glass
  root.add(buildCurvedSurfaceQuad(botL, botR, topL, topR, -0.075, 0.022, glassMat));
  root.add(buildCurvedSurfaceQuad(cBotL, cBotR, rearL, rearR, 0.06, 0.018, glassMat));

  // =========================================================================
  // 5. SEAMLESS CURVED ARTICULATED SWAN-WING / DIHEDRAL DOORS
  // =========================================================================
  const doorPivots: Array<{ pivot: THREE.Group; side: number }> = [];
  const doorLen = bp.doorRearZ - bp.doorFrontZ;
  const doorHeight = bp.doorBeltY - bp.doorBottomY;
  const frontEnvAtDoor = evaluateLowerCoachwork(bp, uDoorFront);

  [-1, 1].forEach((side) => {
    const hingePos = new THREE.Vector3(
      side * frontEnvAtDoor.halfW * 0.94,
      bp.doorBottomY,
      bp.doorFrontZ
    );
    const pivot = new THREE.Group();
    pivot.position.copy(hingePos);

    // Sculpted Curved Exterior Door Skin matching adjacent front fender & rear haunch identically!
    const doorSkinGeo = buildCurvedDoorSkin(bp, side, hingePos, uDoorFront, uDoorRear);
    pivot.add(new THREE.Mesh(doorSkinGeo, paintMat));

    // Signature Side Air Curtain Blade / Titanium Spear Strake hugging outer contour
    const strakeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.03, doorHeight * 0.72, 0.08),
      new THREE.Vector3(side * 0.04, doorHeight * 0.66, doorLen * 0.55),
      new THREE.Vector3(side * 0.02, doorHeight * 0.62, doorLen * 0.92),
    ]);
    pivot.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(strakeCurve, 18, 0.011, 8, false),
        bp.id === 'vanquish' || bp.id === 'db12' ? grilleMetalMat : carbonMat
      )
    );

    // Contoured Inner Quilted Door Card & Satin Door Pull (visible from Cockpit & Door Sill POVs!)
    const doorCard = new THREE.Mesh(
      new THREE.BoxGeometry(0.032, doorHeight * 0.84, doorLen * 0.86),
      darkTrimMat
    );
    doorCard.position.set(-side * 0.09, doorHeight * 0.48, doorLen * 0.5);
    const doorArmrest = new THREE.Mesh(
      new THREE.BoxGeometry(0.048, 0.045, doorLen * 0.52),
      carbonMat
    );
    doorArmrest.position.set(-side * 0.11, doorHeight * 0.38, doorLen * 0.46);
    const doorPull = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.015, 0.13), grilleMetalMat);
    doorPull.position.set(-side * 0.115, doorHeight * 0.56, doorLen * 0.34);
    pivot.add(doorCard, doorArmrest, doorPull);

    // Swept Frameless Side Window Glass curving cleanly to match cantrail
    const winH = bp.windscreenTopY - bp.doorBeltY - 0.04;
    const winBotF = new THREE.Vector3(-side * 0.16, doorHeight - 0.02, 0.12);
    const winBotR = new THREE.Vector3(-side * 0.16, doorHeight - 0.02, doorLen * 0.9);
    const winTopF = new THREE.Vector3(-side * 0.28, doorHeight + winH, 0.46);
    const winTopR = new THREE.Vector3(-side * 0.28, doorHeight + winH * 0.92, doorLen * 0.88);
    pivot.add(buildCurvedSurfaceQuad(winBotF, winBotR, winTopF, winTopR, 0.0, 0.0, glassMat));

    // Sculpted Aero Wing Mirror Pod
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.018, 0.038), carbonMat);
    stalk.position.set(side * 0.02, doorHeight + 0.025, 0.18);
    stalk.rotation.z = side * 0.22;
    const housingGeo = new THREE.SphereGeometry(0.055, 16, 12);
    housingGeo.scale(1.4, 0.65, 0.95);
    const housing = new THREE.Mesh(housingGeo, paintMat);
    housing.position.set(side * 0.095, doorHeight + 0.05, 0.18);
    const mGlass = new THREE.Mesh(
      new THREE.CircleGeometry(0.038, 16),
      new THREE.MeshStandardMaterial({ color: '#9ab0aa', metalness: 0.96, roughness: 0.04 })
    );
    mGlass.scale.set(1.5, 0.72, 1);
    mGlass.position.set(side * 0.095, doorHeight + 0.05, 0.232);
    pivot.add(stalk, housing, mGlass);

    root.add(pivot);
    doorPivots.push({ pivot, side });
  });

  // =========================================================================
  // 6. FULL 3D CABIN INTERIOR + FORGED WHEELS + CHASSIS X-RAY SPINE
  // =========================================================================
  const cabinResult: Cabin3DResult = buildCabin3D(car, bp, initialTrim);
  root.add(cabinResult.group);

  const wheelsResult = buildWheels3D(bp, initialCaliper.hex);
  root.add(wheelsResult.group);

  const xRayGroup = new THREE.Group();
  xRayGroup.visible = false;
  const spineGeo = new THREE.BufferGeometry();
  const sx = bp.cabinHalfW * 0.72;
  const pts = [
    -sx, 0.24, bp.zFrontAxle, sx, 0.24, bp.zFrontAxle,
    -sx, 0.24, bp.zFrontAxle, -sx, 0.24, bp.zRearAxle,
    sx, 0.24, bp.zFrontAxle, sx, 0.24, bp.zRearAxle,
    -sx, 0.24, bp.zRearAxle, sx, 0.24, bp.zRearAxle,
    -sx, 0.24, bp.zFrontAxle, -bp.trackFrontHalf, bp.wheelRadiusF, bp.zFrontAxle,
    sx, 0.24, bp.zFrontAxle, bp.trackFrontHalf, bp.wheelRadiusF, bp.zFrontAxle,
    -sx, 0.24, bp.zRearAxle, -bp.trackRearHalf, bp.wheelRadiusR, bp.zRearAxle,
    sx, 0.24, bp.zRearAxle, bp.trackRearHalf, bp.wheelRadiusR, bp.zRearAxle,
  ];
  spineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  xRayGroup.add(
    new THREE.LineSegments(
      spineGeo,
      new THREE.LineBasicMaterial({ color: '#c4d600', transparent: true, opacity: 0.92 })
    )
  );
  root.add(xRayGroup);

  let doorTarget = 0;
  let doorCurrent = 0;
  let brakeHeatTarget = 0;
  let brakeHeatCurrent = 0;
  let aeroSpeed = 0;

  return {
    root,
    blueprint: bp,
    setPaint: (paint: QPaintFinish) => {
      paintMat.color.set(paint.isNeutral ? '#b4bbc0' : paint.hex);
      paintMat.metalness = paint.isNeutral ? 0.78 : 0.72;
      paintMat.roughness = paint.isNeutral ? 0.15 : 0.14;
      paintMat.needsUpdate = true;
    },
    setCaliper: (caliper: QCaliperFinish) => {
      wheelsResult.caliperMats.forEach((m) => {
        m.color.set(caliper.hex);
        m.needsUpdate = true;
      });
    },
    setCabinTrim: (trim: QCabinTrim) => {
      cabinResult.updateTrim(trim);
    },
    setDoorsOpen: (open: boolean) => {
      doorTarget = open ? 1 : 0;
    },
    setLightsMode: (nightMode: boolean) => {
      drlMat.emissiveIntensity = nightMode ? 4.4 : 1.85;
      tailBladeMat.emissiveIntensity = nightMode ? 4.8 : 2.25;
      cabinResult.setLightsMode(nightMode);
    },
    setXRay: (xray: boolean) => {
      paintMat.transparent = xray;
      paintMat.opacity = xray ? 0.22 : 1.0;
      paintMat.depthWrite = !xray;
      paintMat.needsUpdate = true;
      xRayGroup.visible = xray;
    },
    setActiveAero: (speedKmh: number) => {
      aeroSpeed = speedKmh;
      if (bp.hasActiveWing) {
        const deploy = Math.max(0, (speedKmh - 90) / 220);
        wingGroup.position.y = bp.rearWingY + deploy * 0.14;
        wingGroup.rotation.x = THREE.MathUtils.degToRad(car.aero.rearWingAngleDeg * (0.35 + deploy * 0.75));
      }
    },
    setBrakeThermal: (tempNorm: number) => {
      brakeHeatTarget = Math.max(0, Math.min(2.2, tempNorm));
    },
    update: (dt: number) => {
      doorCurrent += (doorTarget - doorCurrent) * Math.min(1, dt * 6.5);
      doorPivots.forEach(({ pivot, side }) => {
        if (bp.doorStyle === 'gull-canopy' || bp.doorStyle === 'dihedral') {
          pivot.rotation.x = -doorCurrent * 0.34;
          pivot.rotation.y = side * doorCurrent * 0.72;
          pivot.rotation.z = -side * doorCurrent * 0.24;
        } else {
          pivot.rotation.x = -doorCurrent * 0.2;
          pivot.rotation.y = side * doorCurrent * 0.86;
          pivot.rotation.z = -side * doorCurrent * 0.08;
        }
      });

      brakeHeatCurrent += (brakeHeatTarget - brakeHeatCurrent) * Math.min(1, dt * 5.0);
      wheelsResult.rotorMats.forEach((m) => {
        m.emissiveIntensity = brakeHeatCurrent;
      });

      if (aeroSpeed > 1) {
        const angular = (aeroSpeed / 3.6) * dt;
        wheelsResult.spinGroups.forEach((sg, idx) => {
          const r = idx < 2 ? bp.wheelRadiusF : bp.wheelRadiusR;
          sg.rotation.x -= angular / r;
        });
      }
    },
    dispose: () => {
      cabinResult.dispose();
      root.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    },
  };
}
