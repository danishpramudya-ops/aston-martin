import * as THREE from 'three';
import type { AstonCar, QCabinTrim } from '../data/cars';
import { evaluateLowerCoachwork, type Car3DBlueprint } from './carProfiles';
import { createClusterTexture, createLeatherTextures, getCarbonFiberTextures } from './textures';

export interface Cabin3DResult {
  group: THREE.Group;
  updateTrim: (trim: QCabinTrim) => void;
  setLightsMode: (nightMode: boolean) => void;
  setCockpitSurroundVisible: (visible: boolean) => void;
  dispose: () => void;
}

function createInfotainmentTexture(car: AstonCar, stitchHex: string): THREE.CanvasTexture {
  const w = 512;
  const h = 384;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#050807';
  ctx.fillRect(0, 0, w, h);

  // Subtle radial glow
  const g = ctx.createRadialGradient(w * 0.5, h * 0.45, 20, w * 0.5, h * 0.45, 260);
  g.addColorStop(0, 'rgba(0, 82, 48, 0.34)');
  g.addColorStop(1, 'rgba(5, 8, 7, 0.98)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(200, 169, 110, 0.52)';
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, w - 12, h - 12);

  // Top Header Bar
  ctx.fillStyle = '#c8a96e';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('ASTON MARTIN // GAYDON HMI 2.4', 24, 38);
  ctx.fillStyle = '#c4d600';
  ctx.textAlign = 'right';
  ctx.fillText('5G // GPS LOCK', w - 24, 38);
  ctx.textAlign = 'left';

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(20, 52);
  ctx.lineTo(w - 20, 52);
  ctx.stroke();

  // Navigation / Telemetry Circuit Map Panel
  ctx.fillStyle = 'rgba(10, 18, 15, 0.85)';
  ctx.fillRect(24, 66, w - 48, 168);
  ctx.strokeStyle = 'rgba(200, 169, 110, 0.25)';
  ctx.strokeRect(24, 66, w - 48, 168);

  // Grid lines inside map
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  for (let gx = 64; gx < w - 30; gx += 48) {
    ctx.beginPath();
    ctx.moveTo(gx, 66);
    ctx.lineTo(gx, 234);
    ctx.stroke();
  }
  for (let gy = 96; gy < 234; gy += 36) {
    ctx.beginPath();
    ctx.moveTo(24, gy);
    ctx.lineTo(w - 24, gy);
    ctx.stroke();
  }

  // Silverstone / Gaydon Proving Ground circuit trace
  ctx.strokeStyle = '#005a36';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(64, 198);
  ctx.bezierCurveTo(110, 92, 240, 84, 310, 152);
  ctx.bezierCurveTo(365, 206, 435, 134, 442, 102);
  ctx.stroke();

  ctx.strokeStyle = stitchHex;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Position beacon
  ctx.fillStyle = '#c4d600';
  ctx.beginPath();
  ctx.arc(310, 152, 7, 0, Math.PI * 2);
  ctx.fill();

  // Bottom Telemetry & Bowers & Wilkins / Climate Bar
  ctx.fillStyle = '#f4f2ec';
  ctx.font = 'bold 26px monospace';
  ctx.fillText(`${car.specs.powerPS} PS`, 26, 276);
  ctx.fillStyle = '#c8a96e';
  ctx.font = 'bold 20px monospace';
  ctx.fillText(`AERO ${car.aero.maxDownforceKg} KG`, 190, 276);
  ctx.fillStyle = '#c4d600';
  ctx.fillText(`${car.specs.torqueNm} NM`, 375, 276);

  // Dual-zone climate & B&W Audio strip
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(24, 298, w - 48, 62);
  ctx.fillStyle = '#f4f2ec';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('20.5°C', 42, 336);
  ctx.fillStyle = '#c8a96e';
  ctx.font = '16px monospace';
  ctx.fillText('BOWERS & WILKINS // STUDIO', 142, 335);
  ctx.fillStyle = '#f4f2ec';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('21.0°C', w - 114, 336);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createSideCameraMirrorTexture(isLeft: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  const g = ctx.createLinearGradient(0, 0, 0, 192);
  g.addColorStop(0, '#0d1614');
  g.addColorStop(0.52, '#1d2b28');
  g.addColorStop(0.55, '#111615');
  g.addColorStop(1, '#070908');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 192);

  // Horizon perspective lines
  ctx.strokeStyle = 'rgba(200, 169, 110, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(isLeft ? 220 : 36, 102);
  ctx.lineTo(isLeft ? 20 : 236, 178);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(196, 214, 0, 0.65)';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 248, 184);

  ctx.fillStyle = '#c4d600';
  ctx.font = 'bold 16px monospace';
  ctx.fillText(isLeft ? 'CAM L // REAR CLEAR' : 'CAM R // REAR CLEAR', 18, 30);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds an ergonomic extruded contoured seat shell with beveled cushion,
 * curved lumbar backrest, integrated headrest, and quilted Bridge of Weir insert.
 */
/**
 * Lofts the front bonnet from the windscreen base to the nose. Height follows the car's own
 * `evaluateLowerCoachwork` deck line (blended into the windscreen base so it meets the cowl),
 * and each cross-section raises fender pods near the flanks over a softly dished centre.
 */
function buildBonnetSurface(bp: Car3DBlueprint, zNose: number): THREE.BufferGeometry {
  const segZ = 30;
  const segX = 40;
  const zStart = bp.windscreenBottomZ - 0.03;
  const zEnd = zNose * 0.9;
  const positions: number[] = [];
  const indices: number[] = [];
  const smooth = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };

  for (let iz = 0; iz <= segZ; iz++) {
    const f = iz / segZ;
    const z = zStart + (zEnd - zStart) * f;
    const prof = evaluateLowerCoachwork(bp, (z + bp.L * 0.5) / bp.L);
    const baseY = THREE.MathUtils.lerp(bp.windscreenBottomY - 0.05, prof.deckY, smooth(0.0, 0.35, f));
    const halfW = Math.min(prof.halfW, bp.W * 0.5) * 0.97;
    for (let ix = 0; ix <= segX; ix++) {
      const t = (ix / segX) * 2 - 1;
      const a = Math.abs(t);
      const pod = Math.exp(-Math.pow((a - 0.7) / 0.2, 2));
      const valley = Math.exp(-Math.pow(t / 0.36, 2));
      const shoulderDrop = Math.pow(Math.max(0, a - 0.88) / 0.12, 2) * 0.16;
      const y = baseY + pod * 0.065 - valley * 0.045 * smooth(0.15, 0.6, f) - shoulderDrop;
      positions.push(t * halfW, y, z);
    }
  }
  const row = segX + 1;
  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iz * row + ix;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildSculptedSeat(
  bp: Car3DBlueprint,
  seatW: number,
  leatherMat: THREE.Material,
  leatherSmoothMat: THREE.Material,
  carbonMat: THREE.Material,
  stitchMat: THREE.Material,
  alcantaraMat: THREE.Material
): THREE.Group {
  const sg = new THREE.Group();
  const isF1 = bp.id === 'valkyrie' || bp.id === 'valhalla';
  const backH = isF1 ? 0.56 : 0.64;

  // Sculpted side-profile of seat extruded along X (then centered on X=0)
  const profile = new THREE.Shape();
  profile.moveTo(-0.36, 0.08); // front thigh nose
  profile.bezierCurveTo(-0.22, 0.11, -0.08, 0.04, 0.04, 0.06); // seat bucket dip
  profile.bezierCurveTo(0.11, 0.07, 0.16, 0.25, 0.22, backH * 0.68); // lumbar/shoulder curve
  profile.bezierCurveTo(0.25, backH + 0.02, 0.24, backH + 0.16, 0.17, backH + 0.17); // headrest top
  profile.bezierCurveTo(0.12, backH + 0.17, 0.11, backH + 0.02, 0.09, backH * 0.65); // front chest pad
  profile.bezierCurveTo(0.05, 0.26, 0.01, 0.14, -0.05, 0.12); // seat pan inside
  profile.bezierCurveTo(-0.18, 0.11, -0.28, 0.14, -0.36, 0.08);
  profile.closePath();

  const shellGeo = new THREE.ExtrudeGeometry(profile, {
    depth: seatW * 0.86,
    bevelEnabled: true,
    bevelSegments: 4,
    steps: 1,
    bevelSize: 0.024,
    bevelThickness: 0.026,
  });
  shellGeo.center();
  // Rotate so 2D profile (X_2d = front/back, Y_2d = up) maps to (+Z rear, +Y up, depth along X)
  shellGeo.rotateY(-Math.PI / 2);

  // Wait: profile goes x = -0.36 (front, should be -Z) -> +0.25 (rear headrest, should be +Z).
  // rotateY(-PI/2) maps +X -> +Z, +Y -> +Y, +Z -> -X! Exact match!
  const shellMesh = new THREE.Mesh(shellGeo, isF1 ? carbonMat : leatherSmoothMat);
  shellMesh.position.set(0, backH * 0.5 + 0.04, -0.05);
  sg.add(shellMesh);

  // Diamond-quilted Bridge of Weir center insert resting smoothly on backrest & seat pan
  const quiltPan = new THREE.Mesh(new THREE.BoxGeometry(seatW * 0.52, 0.036, 0.34), leatherMat);
  quiltPan.position.set(0, 0.11, -0.14);
  quiltPan.rotation.x = isF1 ? -0.22 : -0.1;
  sg.add(quiltPan);

  const quiltBack = new THREE.Mesh(
    new THREE.BoxGeometry(seatW * 0.5, backH * 0.72, 0.036),
    leatherMat
  );
  quiltBack.position.set(0, backH * 0.44 + 0.08, 0.085);
  quiltBack.rotation.x = isF1 ? 0.36 : 0.24;
  sg.add(quiltBack);

  // Lateral Contoured Thigh & Torso Bolsters
  [-1, 1].forEach((bSide) => {
    const bolsterGeo = new THREE.CapsuleGeometry(0.036, 0.34, 6, 12);
    bolsterGeo.rotateX(Math.PI / 2 - 0.1);
    const thighBolster = new THREE.Mesh(bolsterGeo, leatherSmoothMat);
    thighBolster.position.set(bSide * (seatW * 0.36), 0.13, -0.14);
    sg.add(thighBolster);

    const torsoGeo = new THREE.CapsuleGeometry(0.038, backH * 0.56, 6, 12);
    const torsoBolster = new THREE.Mesh(torsoGeo, leatherSmoothMat);
    torsoBolster.position.set(bSide * (seatW * 0.35), backH * 0.44 + 0.1, 0.06);
    torsoBolster.rotation.x = isF1 ? 0.36 : 0.24;
    torsoBolster.rotation.z = -bSide * 0.1;
    sg.add(torsoBolster);
  });

  // Contrasting Welt Piping Trim along Headrest
  const welt = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.008, 8, 20), stitchMat);
  welt.position.set(0, backH + 0.09, 0.13);
  sg.add(welt);

  // Racing Harness / GT Shoulder Belt
  if (isF1) {
    [-0.075, 0.075].forEach((hx) => {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.038, backH * 0.78, 0.015), alcantaraMat);
      strap.position.set(hx, backH * 0.48 + 0.08, 0.068);
      strap.rotation.x = isF1 ? 0.36 : 0.24;
      sg.add(strap);
    });
  }

  return sg;
}

/**
 * Builds the complete interactive 3D cabin interior:
 * full closed firewall/footwell bulkhead (no open holes!), beveled sculpted Bridge of Weir seats,
 * organic contoured dashboard cowl with round air-vent bezels, stitched D-rim/F1 steering wheel,
 * backlit OLED instrument binnacle, S-curved waterfall console, knurled rotary dials & crystal start button.
 */
export function buildCabin3D(
  car: AstonCar,
  bp: Car3DBlueprint,
  initialTrim: QCabinTrim,
  paintMat?: THREE.Material,
  glassMat?: THREE.Material
): Cabin3DResult {
  const group = new THREE.Group();
  const surroundGroup = new THREE.Group();
  surroundGroup.visible = false;
  group.add(surroundGroup);
  const { map: carbonMap, bumpMap: carbonBump } = getCarbonFiberTextures();
  const texturesToDispose: THREE.Texture[] = [];

  const carbonMat = new THREE.MeshStandardMaterial({
    map: carbonMap,
    bumpMap: carbonBump,
    bumpScale: 0.004,
    roughness: 0.32,
    metalness: 0.34,
  });

  const alcantaraMat = new THREE.MeshStandardMaterial({
    color: '#111413',
    roughness: 0.9,
    metalness: 0.05,
  });

  const metalMat = new THREE.MeshStandardMaterial({
    color: '#a8b0ac',
    metalness: 0.9,
    roughness: 0.2,
  });

  const darkChromeMat = new THREE.MeshStandardMaterial({
    color: '#212624',
    metalness: 0.86,
    roughness: 0.26,
  });

  let leatherTextures = createLeatherTextures(initialTrim.primaryHex, initialTrim.stitchHex);
  const leatherMat = new THREE.MeshStandardMaterial({
    map: leatherTextures.map,
    bumpMap: leatherTextures.bumpMap,
    bumpScale: 0.007,
    roughness: 0.58,
    metalness: 0.07,
  });

  const leatherSmoothMat = new THREE.MeshStandardMaterial({
    color: initialTrim.primaryHex,
    roughness: 0.52,
    metalness: 0.08,
  });

  const accentStitchMat = new THREE.MeshStandardMaterial({
    color: initialTrim.stitchHex,
    emissive: new THREE.Color(initialTrim.stitchHex),
    emissiveIntensity: 0.16,
    roughness: 0.42,
  });

  const ambientLightMat = new THREE.MeshStandardMaterial({
    color: '#c8a96e',
    emissive: new THREE.Color('#c8a96e'),
    emissiveIntensity: 0.55,
  });

  const crystalStartMat = new THREE.MeshPhysicalMaterial({
    color: '#eef6f2',
    emissive: new THREE.Color('#c4d600'),
    emissiveIntensity: 0.72,
    roughness: 0.08,
    metalness: 0.1,
    transmission: 0.38,
    clearcoat: 1,
  });

  // Balanced interior lighting so sculpted gauges, stitching & console pop cleanly
  const cabinLight = new THREE.PointLight('#fff2da', 1.15, 2.5, 1.4);
  cabinLight.position.set(0, bp.windscreenTopY - 0.1, bp.eyeZ - 0.12);
  group.add(cabinLight);

  // 1. Sealed Tub Floor, Solid Front Firewall Bulkhead & Rear Bulkhead (Zero exterior-leak gaps!)
  const floorZ = (bp.dashZ + bp.seatBackZ) * 0.5;
  const tubLen = bp.seatBackZ - bp.dashZ + 0.65;
  const floorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(bp.cabinHalfW * 2.04, 0.04, tubLen),
    alcantaraMat
  );
  floorMesh.position.set(0, bp.cabinFloorY - 0.02, floorZ - 0.06);
  group.add(floorMesh);

  // Closed Front Firewall Bulkhead & Inner Footwell Closeouts (prevents floor light leaks in Cockpit POVs!)
  const fwHeight = bp.windscreenBottomY - bp.cabinFloorY + 0.08;
  const frontFirewall = new THREE.Mesh(
    new THREE.BoxGeometry(bp.W * 0.92, fwHeight, 0.09),
    alcantaraMat
  );
  frontFirewall.position.set(0, bp.cabinFloorY + fwHeight * 0.5 - 0.04, bp.windscreenBottomZ + 0.03);
  group.add(frontFirewall);

  [-1, 1].forEach((side) => {
    const kickPanel = new THREE.Mesh(new THREE.BoxGeometry(0.05, fwHeight, 0.36), alcantaraMat);
    kickPanel.position.set(side * (bp.cabinHalfW + 0.04), bp.cabinFloorY + fwHeight * 0.5 - 0.03, bp.dashZ);
    group.add(kickPanel);
  });

  // Brushed Aluminum Pedals inside driver footwell
  [-0.08, 0.04].forEach((px) => {
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.11, 0.014), metalMat);
    pedal.position.set(bp.driverX + px, bp.cabinFloorY + 0.12, bp.dashZ - 0.1);
    pedal.rotation.x = -0.38;
    group.add(pedal);
  });

  // Illuminated Aston Martin Sill Kickplates along left & right entry sills
  [-1, 1].forEach((side) => {
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.036, tubLen * 0.68), darkChromeMat);
    sill.position.set(side * (bp.cabinHalfW + 0.015), bp.cabinFloorY + 0.028, floorZ + 0.02);
    group.add(sill);

    const sillStripe = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.006, tubLen * 0.54), ambientLightMat);
    sillStripe.position.set(side * (bp.cabinHalfW + 0.03), bp.cabinFloorY + 0.048, floorZ + 0.02);
    group.add(sillStripe);
  });

  // Sculpted Rear Cabin Bulkhead behind seats
  const bulkheadHeight = bp.roofRearY - bp.cabinFloorY - 0.06;
  const bulkhead = new THREE.Mesh(
    new THREE.BoxGeometry(bp.cabinHalfW * 1.92, bulkheadHeight, 0.06),
    bp.id === 'valkyrie' ? carbonMat : leatherMat
  );
  bulkhead.position.set(0, bp.cabinFloorY + bulkheadHeight * 0.5, bp.seatBackZ + 0.22);
  group.add(bulkhead);

  const bulkheadTrim = new THREE.Mesh(
    new THREE.BoxGeometry(bp.cabinHalfW * 1.66, 0.018, 0.068),
    accentStitchMat
  );
  bulkheadTrim.position.set(0, bp.cabinFloorY + bulkheadHeight * 0.62, bp.seatBackZ + 0.218);
  group.add(bulkheadTrim);

  // 2. Sculpted Dual Contoured Seats
  const seatW = bp.id === 'valkyrie' ? 0.36 : 0.44;
  [-1, 1].forEach((side) => {
    const seat = buildSculptedSeat(
      bp,
      seatW,
      leatherMat,
      leatherSmoothMat,
      carbonMat,
      accentStitchMat,
      alcantaraMat
    );
    seat.position.set(side === -1 ? bp.driverX : -bp.driverX, bp.cabinFloorY + 0.01, bp.eyeZ + 0.06);
    group.add(seat);
  });

  // 3. Sculpted Swept Dashboard Cowl & Round Turbine Air Vents
  const dashTopY = bp.windscreenBottomY + 0.015;
  const dashSpanW = bp.cabinHalfW * 1.96;

  // Curved extruded cross-section for sculpted Aston Martin Wing Dashboard
  const dashProfile = new THREE.Shape();
  dashProfile.moveTo(-0.24, -0.08);
  dashProfile.bezierCurveTo(-0.22, 0.03, -0.08, 0.052, 0.07, 0.032);
  dashProfile.bezierCurveTo(0.14, 0.02, 0.16, -0.03, 0.12, -0.1);
  dashProfile.bezierCurveTo(0.04, -0.14, -0.14, -0.13, -0.24, -0.08);
  dashProfile.closePath();

  const dashGeo = new THREE.ExtrudeGeometry(dashProfile, {
    depth: dashSpanW,
    curveSegments: 32,
    bevelEnabled: true,
    bevelSegments: 5,
    bevelSize: 0.016,
    bevelThickness: 0.016,
  });
  dashGeo.center();
  dashGeo.rotateY(-Math.PI / 2);
  const dashMesh = new THREE.Mesh(
    dashGeo,
    bp.id === 'valkyrie' || bp.id === 'valhalla' ? carbonMat : leatherSmoothMat
  );
  dashMesh.position.set(0, dashTopY - 0.045, bp.dashZ - 0.04);
  group.add(dashMesh);

  // Subtle horizontal ambient cabin glow strip along lower dash fascia
  const dashGlowBar = new THREE.Mesh(new THREE.BoxGeometry(dashSpanW * 0.88, 0.006, 0.012), ambientLightMat);
  dashGlowBar.position.set(0, dashTopY - 0.095, bp.dashZ + 0.118);
  group.add(dashGlowBar);

  // Machined Metallic Turbine Climate Vents
  [-0.58, -0.14, 0.14, 0.58].forEach((vxFrac) => {
    const ventGroup = new THREE.Group();
    ventGroup.position.set(bp.cabinHalfW * vxFrac, dashTopY - 0.055, bp.dashZ + 0.128);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0045, 8, 22), metalMat);
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.023, 0.023, 0.012, 16),
      darkChromeMat
    );
    core.rotation.x = Math.PI / 2;
    ventGroup.add(ring, core);
    group.add(ventGroup);
  });

  // 4. Illuminated Digital Driver Binnacle Screen (cleanly visible right through Steering Wheel!)
  const clusterTex = createClusterTexture(car, false);
  texturesToDispose.push(clusterTex);
  const clusterMat = new THREE.MeshBasicMaterial({ map: clusterTex });
  const binnacleFrame = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.118, 0.018), darkChromeMat);
  binnacleFrame.position.set(bp.driverX, bp.wheelY + 0.048, bp.dashZ + 0.145);
  binnacleFrame.rotation.x = -0.16;
  const clusterMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.102), clusterMat);
  clusterMesh.position.set(bp.driverX, bp.wheelY + 0.048, bp.dashZ + 0.156);
  clusterMesh.rotation.x = -0.16;
  group.add(binnacleFrame, clusterMesh);

  // Valkyrie Signature Digital Side-Camera Screens on A-pillars
  if (bp.id === 'valkyrie') {
    [-1, 1].forEach((side) => {
      const camTex = createSideCameraMirrorTexture(side === -1);
      texturesToDispose.push(camTex);
      const pod = new THREE.Group();
      pod.position.set(side * (bp.cabinHalfW - 0.075), dashTopY + 0.085, bp.dashZ + 0.02);
      pod.rotation.y = -side * 0.48;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.072, 0.016), carbonMat);
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(0.098, 0.062),
        new THREE.MeshBasicMaterial({ map: camTex })
      );
      screen.position.z = 0.01;
      pod.add(frame, screen);
      group.add(pod);
    });
  }

  // 5. Sculpted Organic Steering Wheel & Column Paddles
  const steeringPivot = new THREE.Group();
  steeringPivot.position.set(bp.driverX, bp.wheelY, bp.wheelZ);
  steeringPivot.rotation.x = -0.26;

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.24, 16), alcantaraMat);
  column.rotation.x = Math.PI / 2;
  column.position.z = -0.12;
  steeringPivot.add(column);

  // Shift Paddles
  [-1, 1].forEach((pSide) => {
    const paddle = new THREE.Mesh(
      new THREE.BoxGeometry(0.024, 0.105, 0.006),
      bp.id === 'valkyrie' ? carbonMat : metalMat
    );
    paddle.position.set(pSide * 0.102, 0.015, -0.028);
    paddle.rotation.z = -pSide * 0.14;
    steeringPivot.add(paddle);
  });

  if (bp.id === 'valkyrie' || bp.id === 'valhalla') {
    // Smooth Closed Tube Carbon Motorsport Yoke
    const curve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(-0.125, 0.062, 0),
        new THREE.Vector3(0, 0.072, 0),
        new THREE.Vector3(0.125, 0.062, 0),
        new THREE.Vector3(0.138, 0, 0.005),
        new THREE.Vector3(0.12, -0.065, 0),
        new THREE.Vector3(0, -0.072, 0),
        new THREE.Vector3(-0.12, -0.065, 0),
        new THREE.Vector3(-0.138, 0, 0.005),
      ],
      true
    );
    const rimMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 44, 0.015, 12, true), carbonMat);
    steeringPivot.add(rimMesh);

    const hubPlate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.022), carbonMat);
    steeringPivot.add(hubPlate);

    if (bp.id === 'valkyrie') {
      const wheelScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.046), clusterMat);
      wheelScreen.position.set(0, 0.012, 0.013);
      steeringPivot.add(wheelScreen);

      ['#22c55e', '#22c55e', '#c4d600', '#ef4444', '#3b82f6'].forEach((c, idx) => {
        const led = new THREE.Mesh(
          new THREE.BoxGeometry(0.012, 0.005, 0.006),
          new THREE.MeshBasicMaterial({ color: c })
        );
        led.position.set((idx - 2) * 0.018, 0.042, 0.013);
        steeringPivot.add(led);
      });
    } else {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.008), metalMat);
      wing.position.z = 0.015;
      steeringPivot.add(wing);
    }
  } else {
    // Contoured D-Rim Leather GT Steering Wheel with TubeGeometry
    const dCurve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(0, 0.145, 0),
        new THREE.Vector3(0.105, 0.105, 0),
        new THREE.Vector3(0.146, 0, 0),
        new THREE.Vector3(0.115, -0.102, 0),
        new THREE.Vector3(0, -0.122, 0),
        new THREE.Vector3(-0.115, -0.102, 0),
        new THREE.Vector3(-0.146, 0, 0),
        new THREE.Vector3(-0.105, 0.105, 0),
      ],
      true
    );
    steeringPivot.add(new THREE.Mesh(new THREE.TubeGeometry(dCurve, 48, 0.0165, 12, true), leatherSmoothMat));

    const spokeL = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.022, 0.014), metalMat);
    spokeL.position.set(-0.072, -0.008, -0.004);
    const spokeR = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.022, 0.014), metalMat);
    spokeR.position.set(0.072, -0.008, -0.004);
    const spokeB = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.1, 0.014), metalMat);
    spokeB.position.set(0, -0.065, -0.004);
    steeringPivot.add(spokeL, spokeR, spokeB);

    const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.052, 0.024, 24), leatherSmoothMat);
    boss.rotation.x = Math.PI / 2;
    steeringPivot.add(boss);

    const emblem = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.011, 0.006), metalMat);
    emblem.position.z = 0.015;
    steeringPivot.add(emblem);
  }
  group.add(steeringPivot);

  // 6. Sculpted S-Curved Waterfall Center Console + HMI + Knurled Dials + Crystal Ignition
  const consoleLen = bp.seatBackZ - bp.dashZ + 0.16;
  const consoleCenterZ = (bp.dashZ + bp.seatBackZ) * 0.5 + 0.05;
  const tunnelShape = new THREE.Shape();
  tunnelShape.moveTo(-consoleLen * 0.5, -0.08);
  tunnelShape.lineTo(consoleLen * 0.5, -0.08);
  tunnelShape.lineTo(consoleLen * 0.5, 0.11);
  tunnelShape.bezierCurveTo(consoleLen * 0.2, 0.11, -consoleLen * 0.1, 0.09, -consoleLen * 0.28, 0.1);
  tunnelShape.bezierCurveTo(-consoleLen * 0.42, 0.1, -consoleLen * 0.48, 0.16, -consoleLen * 0.51, 0.21);
  tunnelShape.closePath();

  const tunnelGeo = new THREE.ExtrudeGeometry(tunnelShape, {
    depth: 0.23,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.016,
    bevelThickness: 0.016,
  });
  tunnelGeo.center();
  tunnelGeo.rotateY(-Math.PI / 2);
  const tunnelMesh = new THREE.Mesh(tunnelGeo, bp.id === 'valkyrie' ? carbonMat : leatherMat);
  tunnelMesh.position.set(0, bp.cabinFloorY + 0.14, consoleCenterZ);
  group.add(tunnelMesh);

  // Satin Metallic Console Perimeter Trim Spears
  [-0.122, 0.122].forEach((sx) => {
    const spear = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.018, consoleLen * 0.8), metalMat);
    spear.position.set(sx, bp.cabinFloorY + 0.21, consoleCenterZ + 0.04);
    group.add(spear);
  });

  // Angled 10.25" Pure Black Infotainment Touchscreen
  const bridgeGroup = new THREE.Group();
  bridgeGroup.position.set(0, bp.cabinFloorY + 0.295, bp.dashZ + 0.22);
  bridgeGroup.rotation.x = -0.66;

  const hmiPlate = new THREE.Mesh(new THREE.BoxGeometry(0.205, 0.155, 0.02), darkChromeMat);
  bridgeGroup.add(hmiPlate);

  const hmiTex = createInfotainmentTexture(car, initialTrim.stitchHex);
  texturesToDispose.push(hmiTex);
  const hmiMat = new THREE.MeshBasicMaterial({ map: hmiTex });
  const hmiScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.185, 0.135), hmiMat);
  hmiScreen.position.z = 0.012;
  bridgeGroup.add(hmiScreen);
  group.add(bridgeGroup);

  // Machined Chrome Collar & Illuminated Crystal Glass Start/Stop Button
  const startCollar = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 8, 22), metalMat);
  startCollar.rotation.x = Math.PI / 2;
  startCollar.position.set(0, bp.cabinFloorY + 0.244, bp.dashZ + 0.36);
  const startBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.019, 0.018, 24), crystalStartMat);
  startBtn.position.set(0, bp.cabinFloorY + 0.246, bp.dashZ + 0.36);
  group.add(startCollar, startBtn);

  // Left & Right knurled rotary climate dials
  [-0.064, 0.064].forEach((dx) => {
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.016, 18), metalMat);
    dial.position.set(dx, bp.cabinFloorY + 0.244, bp.dashZ + 0.42);
    group.add(dial);
  });

  // 7. Interior Rear-View Mirror suspended from windscreen header
  const mirrorStem = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.055, 8), darkChromeMat);
  mirrorStem.position.set(0, bp.windscreenTopY - 0.045, bp.windscreenTopZ + 0.03);
  const mirrorHead = new THREE.Mesh(
    new THREE.BoxGeometry(0.175, 0.044, 0.016),
    new THREE.MeshStandardMaterial({ color: '#0c100f', metalness: 0.92, roughness: 0.08 })
  );
  mirrorHead.position.set(0, bp.windscreenTopY - 0.075, bp.windscreenTopZ + 0.045);
  group.add(mirrorStem, mirrorHead);

  // 8. Close-Up Cockpit Surround Architecture (A-Pillars, Windscreen Header, Door Cards & Painted Front Hood/Fenders)
  const extPaintMat = paintMat ?? leatherSmoothMat;
  const extGlassMat =
    glassMat ??
    new THREE.MeshPhysicalMaterial({
      color: '#0d1311',
      transparent: true,
      opacity: 0.18,
      roughness: 0.04,
      clearcoat: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

  // Left & Right Sculpted Alcantara A-Pillars
  const roofHalfW = bp.cabinHalfW * 0.88;
  const roofPeakY = bp.H;
  const zNose = -bp.L * 0.5;
  [-1, 1].forEach((side) => {
    const pStart = new THREE.Vector3(
      side * (bp.cabinHalfW - 0.01),
      bp.windscreenBottomY - 0.01,
      bp.windscreenBottomZ + 0.02
    );
    const pMid = new THREE.Vector3(
      side * (bp.cabinHalfW * 0.93),
      (bp.windscreenBottomY + bp.windscreenTopY) * 0.52,
      (bp.windscreenBottomZ + bp.windscreenTopZ) * 0.5 - 0.02
    );
    const pEnd = new THREE.Vector3(
      side * (roofHalfW - 0.01),
      bp.windscreenTopY + 0.01,
      bp.windscreenTopZ + 0.02
    );
    const aCurve = new THREE.CatmullRomCurve3([pStart, pMid, pEnd]);
    const aGeo = new THREE.TubeGeometry(aCurve, 18, 0.032, 10, false);
    const aMesh = new THREE.Mesh(aGeo, alcantaraMat);
    surroundGroup.add(aMesh);

    // Side roof cantrail sweeping back from top of A-pillar
    const cantRail = new THREE.CatmullRomCurve3([
      pEnd,
      new THREE.Vector3(side * (roofHalfW - 0.01), roofPeakY, (bp.windscreenTopZ + bp.roofRearZ) * 0.5),
      new THREE.Vector3(side * (roofHalfW * 0.94), bp.roofRearY, bp.roofRearZ),
    ]);
    const cantMesh = new THREE.Mesh(new THREE.TubeGeometry(cantRail, 14, 0.028, 8, false), alcantaraMat);
    surroundGroup.add(cantMesh);

    // Sculpted Inner Door Card with Quilted Leather, Armrest, B&W Speaker & Ambient Light Blade
    const doorLen = bp.seatBackZ - bp.dashZ + 0.28;
    const doorHeight = bp.windscreenBottomY - bp.cabinFloorY - 0.02;
    const doorZ = (bp.dashZ + bp.seatBackZ) * 0.5 + 0.04;
    const doorX = side * (bp.cabinHalfW + 0.048);

    const doorPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, doorHeight, doorLen),
      leatherMat
    );
    doorPanel.position.set(doorX, bp.cabinFloorY + doorHeight * 0.5, doorZ);
    surroundGroup.add(doorPanel);

    // Upper carbon door waist rail
    const waistRail = new THREE.Mesh(
      new THREE.BoxGeometry(0.068, 0.055, doorLen * 0.96),
      carbonMat
    );
    waistRail.position.set(doorX - side * 0.006, bp.windscreenBottomY - 0.025, doorZ);
    surroundGroup.add(waistRail);

    // Ambient LED door blade
    const doorLed = new THREE.Mesh(
      new THREE.BoxGeometry(0.008, 0.006, doorLen * 0.78),
      ambientLightMat
    );
    doorLed.position.set(doorX - side * 0.032, bp.windscreenBottomY - 0.065, doorZ);
    surroundGroup.add(doorLed);

    // Contoured leather door armrest + brushed alloy pull handle
    const armrest = new THREE.Mesh(
      new THREE.BoxGeometry(0.085, 0.042, doorLen * 0.52),
      leatherSmoothMat
    );
    armrest.position.set(doorX - side * 0.036, bp.cabinFloorY + doorHeight * 0.52, doorZ + 0.04);
    surroundGroup.add(armrest);

    const doorPull = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, 0.024, 0.14),
      metalMat
    );
    doorPull.position.set(doorX - side * 0.042, bp.windscreenBottomY - 0.11, bp.dashZ + 0.26);
    surroundGroup.add(doorPull);

    // Bowers & Wilkins stainless circular speaker grille in lower front door
    const bwSpeaker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.012, 24),
      metalMat
    );
    bwSpeaker.rotation.z = Math.PI / 2;
    bwSpeaker.position.set(doorX - side * 0.028, bp.cabinFloorY + 0.18, bp.dashZ + 0.18);
    surroundGroup.add(bwSpeaker);

    // Exterior Aerodynamic Wing Mirror visible outside the side window
    const mirrorArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.022, 0.035), carbonMat);
    mirrorArm.position.set(
      side * (bp.cabinHalfW + 0.11),
      bp.windscreenBottomY + 0.03,
      bp.windscreenBottomZ + 0.18
    );
    // Teardrop housing (scaled sphere, tapered toward the tail) instead of a hard-edged block
    const wingMirrorCap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 18), extPaintMat);
    wingMirrorCap.scale.set(0.16, 0.078, 0.11);
    wingMirrorCap.rotation.y = side * 0.12;
    wingMirrorCap.position.set(
      side * (bp.cabinHalfW + 0.19),
      bp.windscreenBottomY + 0.055,
      bp.windscreenBottomZ + 0.18
    );
    surroundGroup.add(mirrorArm, wingMirrorCap);
  });

  // Windscreen Top Header Bar & Sunvisors
  const headerBar = new THREE.Mesh(
    new THREE.BoxGeometry(roofHalfW * 1.98, 0.048, 0.11),
    alcantaraMat
  );
  headerBar.position.set(0, bp.windscreenTopY + 0.008, bp.windscreenTopZ + 0.03);
  surroundGroup.add(headerBar);

  [-0.27, 0.27].forEach((vx) => {
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.014, 0.11),
      alcantaraMat
    );
    visor.position.set(vx, bp.windscreenTopY - 0.016, bp.windscreenTopZ + 0.06);
    visor.rotation.x = 0.18;
    surroundGroup.add(visor);
  });

  // Acoustic Windscreen Glass Panel
  const wsHeight = Math.hypot(
    bp.windscreenTopY - bp.windscreenBottomY,
    bp.windscreenTopZ - bp.windscreenBottomZ
  );
  const wsAngle = Math.atan2(
    bp.windscreenTopZ - bp.windscreenBottomZ,
    bp.windscreenTopY - bp.windscreenBottomY
  );
  const wsGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(bp.cabinHalfW * 1.9, wsHeight),
    extGlassMat
  );
  wsGlass.position.set(
    0,
    (bp.windscreenBottomY + bp.windscreenTopY) * 0.5,
    (bp.windscreenBottomZ + bp.windscreenTopZ) * 0.5
  );
  wsGlass.rotation.x = wsAngle;
  surroundGroup.add(wsGlass);

  // Sculpted painted bonnet seen through the windscreen: one smooth surface lofted from the car's
  // coachwork profile – twin fender pods either side of a lower centre valley – instead of boxes.
  const bonnet = new THREE.Mesh(buildBonnetSurface(bp, zNose), extPaintMat);
  surroundGroup.add(bonnet);

  // Windscreen base wiper cowl in satin carbon
  const wiperCowl = new THREE.Mesh(
    new THREE.BoxGeometry(bp.cabinHalfW * 1.96, 0.036, 0.14),
    carbonMat
  );
  wiperCowl.position.set(0, bp.windscreenBottomY - 0.015, bp.windscreenBottomZ - 0.04);
  surroundGroup.add(wiperCowl);

  return {
    group,
    updateTrim: (trim: QCabinTrim) => {
      const nextTex = createLeatherTextures(trim.primaryHex, trim.stitchHex);
      leatherTextures.map.dispose();
      leatherTextures.bumpMap.dispose();
      leatherTextures = nextTex;
      leatherMat.map = nextTex.map;
      leatherMat.bumpMap = nextTex.bumpMap;
      leatherMat.needsUpdate = true;

      leatherSmoothMat.color.set(trim.primaryHex);
      accentStitchMat.color.set(trim.stitchHex);
      accentStitchMat.emissive.set(trim.stitchHex);
    },
    setLightsMode: (nightMode: boolean) => {
      cabinLight.intensity = nightMode ? 1.75 : 1.1;
      ambientLightMat.emissiveIntensity = nightMode ? 1.55 : 0.55;
      crystalStartMat.emissiveIntensity = nightMode ? 1.85 : 0.72;
      accentStitchMat.emissiveIntensity = nightMode ? 0.34 : 0.16;
    },
    setCockpitSurroundVisible: (visible: boolean) => {
      surroundGroup.visible = visible;
    },
    dispose: () => {
      leatherTextures.map.dispose();
      leatherTextures.bumpMap.dispose();
      texturesToDispose.forEach((t) => t.dispose());
    },
  };
}
