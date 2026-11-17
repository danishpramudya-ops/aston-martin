import * as THREE from 'three';
import type { Car3DBlueprint } from './carProfiles';
import { getCarbonFiberTextures, getRotorTextures } from './textures';

export interface WheelAssemblyResult {
  group: THREE.Group;
  caliperMats: THREE.MeshPhysicalMaterial[];
  rotorMats: THREE.MeshStandardMaterial[];
  spinGroups: THREE.Group[];
}

/**
 * Builds an individual sculpted wheel, tire carcass, forged rim spokes (or Valkyrie
 * carbon aero turbofan cover), cross-drilled CCM-R rotor, and curved 6-piston caliper.
 */
function buildSingleWheel(
  radius: number,
  tireWidth: number,
  isLeft: boolean,
  isFront: boolean,
  bp: Car3DBlueprint,
  caliperMat: THREE.MeshPhysicalMaterial,
  rotorMat: THREE.MeshStandardMaterial,
  carbonMat: THREE.MeshStandardMaterial,
  rimMat: THREE.MeshStandardMaterial
): { wheelRoot: THREE.Group; spinGroup: THREE.Group } {
  const wheelRoot = new THREE.Group();
  const spinGroup = new THREE.Group();
  wheelRoot.add(spinGroup);

  const rimRadius = radius * 0.74;
  const halfW = tireWidth * 0.5;
  const sideSign = isLeft ? -1 : 1; // outer face points toward negative X for left (-X) wheels

  // 1. Contoured Tire Carcass via LatheGeometry around Y, then rotated so axle = X
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(rimRadius, -halfW * 0.88),
    new THREE.Vector2(rimRadius + (radius - rimRadius) * 0.45, -halfW * 1.01),
    new THREE.Vector2(radius * 0.985, -halfW * 0.94),
    new THREE.Vector2(radius, -halfW * 0.58),
    new THREE.Vector2(radius, halfW * 0.58),
    new THREE.Vector2(radius * 0.985, halfW * 0.94),
    new THREE.Vector2(rimRadius + (radius - rimRadius) * 0.45, halfW * 1.01),
    new THREE.Vector2(rimRadius, halfW * 0.88),
  ];
  const tireGeo = new THREE.LatheGeometry(profile, 44);
  tireGeo.rotateZ(-Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({
    color: '#101211',
    roughness: 0.84,
    metalness: 0.08,
  });
  const tireMesh = new THREE.Mesh(tireGeo, tireMat);
  spinGroup.add(tireMesh);

  // Subtle rim lip ring
  const barrelGeo = new THREE.CylinderGeometry(rimRadius, rimRadius, tireWidth * 0.84, 36, 1, true);
  barrelGeo.rotateZ(Math.PI / 2);
  const barrelMat = new THREE.MeshStandardMaterial({
    color: '#161918',
    roughness: 0.36,
    metalness: 0.78,
    side: THREE.DoubleSide,
  });
  spinGroup.add(new THREE.Mesh(barrelGeo, barrelMat));

  // Outer forged wheel face positioned on outboard side
  const faceX = sideSign * (halfW * 0.66);

  // Center Hub Bell
  const hubGeo = new THREE.CylinderGeometry(rimRadius * 0.25, rimRadius * 0.29, 0.05, 24);
  hubGeo.rotateZ(Math.PI / 2);
  const hubMesh = new THREE.Mesh(hubGeo, rimMat);
  hubMesh.position.x = faceX * 0.88;
  spinGroup.add(hubMesh);

  // Center-Lock Hex / Center Cap Accent
  const lockColor = bp.id === 'valkyrie' ? '#c8a96e' : '#181c1a';
  const lockGeo = new THREE.CylinderGeometry(rimRadius * 0.12, rimRadius * 0.135, 0.062, 6);
  lockGeo.rotateZ(Math.PI / 2);
  const lockMesh = new THREE.Mesh(
    lockGeo,
    new THREE.MeshStandardMaterial({ color: lockColor, metalness: 0.88, roughness: 0.22 })
  );
  lockMesh.position.x = faceX * 0.96;
  spinGroup.add(lockMesh);

  // Rim Outer Flange
  const flangeGeo = new THREE.TorusGeometry(rimRadius * 0.97, 0.013, 10, 44);
  flangeGeo.rotateY(Math.PI / 2);
  const flangeMesh = new THREE.Mesh(flangeGeo, rimMat);
  flangeMesh.position.x = faceX * 1.04;
  spinGroup.add(flangeMesh);

  if (bp.wheelStyle === 'turbofan-aero') {
    // Valkyrie sculpted carbon aerodynamic wheel disc with angled cooling turbine fins
    const discGeo = new THREE.CylinderGeometry(rimRadius * 0.96, rimRadius * 0.96, 0.014, 40);
    discGeo.rotateZ(Math.PI / 2);
    const discMesh = new THREE.Mesh(discGeo, carbonMat);
    discMesh.position.x = faceX * 0.98;
    spinGroup.add(discMesh);

    const bladeGeo = new THREE.BoxGeometry(0.016, rimRadius * 0.64, 0.032);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const bladePivot = new THREE.Group();
      bladePivot.position.x = faceX * 1.02;
      bladePivot.rotation.x = a;
      const blade = new THREE.Mesh(bladeGeo, rimMat);
      blade.position.y = rimRadius * 0.54;
      blade.rotation.y = 0.26 * sideSign;
      bladePivot.add(blade);
      spinGroup.add(bladePivot);
    }
  } else {
    // Sculpted Forged Multi-Spoke / Split Y-Spokes (Valhalla, Vanquish, DB12)
    const pairCount = bp.wheelStyle === 'motorsport-y' ? 5 : 5;
    const armLen = rimRadius * 0.72;
    const armGeo = new THREE.BoxGeometry(0.018, armLen, 0.016);
    for (let i = 0; i < pairCount; i++) {
      const baseA = (i / pairCount) * Math.PI * 2;
      [-0.18, 0.18].forEach((spread) => {
        const spokeGroup = new THREE.Group();
        spokeGroup.position.x = faceX * 0.92;
        spokeGroup.rotation.x = baseA + spread;
        const spoke = new THREE.Mesh(armGeo, rimMat);
        spoke.position.y = rimRadius * 0.56;
        spoke.rotation.z = sideSign * -0.09; // subtle concave dish toward hub
        spokeGroup.add(spoke);
        spinGroup.add(spokeGroup);
      });

      if (bp.wheelStyle === 'forged-multi') {
        // Y-stem bridge joining each pair at the hub
        const stemGeo = new THREE.BoxGeometry(0.02, rimRadius * 0.34, 0.022);
        const stemGroup = new THREE.Group();
        stemGroup.position.x = faceX * 0.9;
        stemGroup.rotation.x = baseA;
        const stem = new THREE.Mesh(stemGeo, rimMat);
        stem.position.y = rimRadius * 0.26;
        stemGroup.add(stem);
        spinGroup.add(stemGroup);
      }
    }
  }

  // 2. Cross-Drilled Carbon-Ceramic Brake Rotor
  const rotorR = radius * 0.62;
  const rotorGeo = new THREE.CylinderGeometry(rotorR, rotorR, 0.028, 36);
  rotorGeo.rotateZ(Math.PI / 2);
  const rotorMesh = new THREE.Mesh(rotorGeo, rotorMat);
  rotorMesh.position.x = -sideSign * 0.01;
  spinGroup.add(rotorMesh);

  // 3. Curved 6-Piston Anodized Brake Caliper (stationary relative to suspension!)
  const arcShape = new THREE.Shape();
  const rInner = rotorR * 0.68;
  const rOuter = rotorR * 1.07;
  const span = 0.85; // ~49 degrees
  arcShape.absarc(0, 0, rOuter, -span / 2, span / 2, false);
  arcShape.absarc(0, 0, rInner, span / 2, -span / 2, true);
  arcShape.closePath();

  const caliperGeo = new THREE.ExtrudeGeometry(arcShape, {
    depth: 0.068,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.006,
    bevelSegments: 2,
  });
  caliperGeo.center();
  caliperGeo.rotateY(Math.PI / 2);

  const caliperMesh = new THREE.Mesh(caliperGeo, caliperMat);
  // Orient front calipers rear-ward of hub (+Z bias), rear calipers forward of hub (-Z bias)
  const angleCenter = isFront ? 0.28 : Math.PI - 0.28;
  const midR = (rInner + rOuter) * 0.5;
  caliperMesh.position.set(
    sideSign * 0.004,
    Math.sin(angleCenter) * midR,
    Math.cos(angleCenter) * midR
  );
  caliperMesh.rotation.x = isFront ? -0.28 : Math.PI + 0.28;
  wheelRoot.add(caliperMesh);

  return { wheelRoot, spinGroup };
}

/**
 * Builds all 4 wheel & brake assemblies calibrated to front/rear track & staggered diameters.
 */
export function buildWheels3D(bp: Car3DBlueprint, caliperHex: string): WheelAssemblyResult {
  const group = new THREE.Group();
  const { map: carbonMap, bumpMap: carbonBump } = getCarbonFiberTextures();
  const { map: rotorMap, bumpMap: rotorBump } = getRotorTextures();

  const carbonMat = new THREE.MeshStandardMaterial({
    map: carbonMap,
    bumpMap: carbonBump,
    bumpScale: 0.004,
    roughness: 0.34,
    metalness: 0.35,
  });

  const rimColor =
    bp.id === 'valkyrie' ? '#252927' : bp.id === 'valhalla' ? '#8c7d65' : '#9c8c72';
  const rimMat = new THREE.MeshStandardMaterial({
    color: rimColor,
    metalness: 0.88,
    roughness: 0.24,
  });

  const caliperMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(caliperHex),
    metalness: 0.42,
    roughness: 0.26,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
  });

  const rotorMat = new THREE.MeshStandardMaterial({
    map: rotorMap,
    bumpMap: rotorBump,
    bumpScale: 0.006,
    color: '#323634',
    emissive: new THREE.Color('#ff4400'),
    emissiveIntensity: 0.0,
    metalness: 0.65,
    roughness: 0.44,
  });

  const specs: Array<{ x: number; y: number; z: number; r: number; w: number; left: boolean; front: boolean }> = [
    {
      x: -bp.trackFrontHalf,
      y: bp.wheelRadiusF,
      z: bp.zFrontAxle,
      r: bp.wheelRadiusF,
      w: bp.tireWidthF,
      left: true,
      front: true,
    },
    {
      x: bp.trackFrontHalf,
      y: bp.wheelRadiusF,
      z: bp.zFrontAxle,
      r: bp.wheelRadiusF,
      w: bp.tireWidthF,
      left: false,
      front: true,
    },
    {
      x: -bp.trackRearHalf,
      y: bp.wheelRadiusR,
      z: bp.zRearAxle,
      r: bp.wheelRadiusR,
      w: bp.tireWidthR,
      left: true,
      front: false,
    },
    {
      x: bp.trackRearHalf,
      y: bp.wheelRadiusR,
      z: bp.zRearAxle,
      r: bp.wheelRadiusR,
      w: bp.tireWidthR,
      left: false,
      front: false,
    },
  ];

  const spinGroups: THREE.Group[] = [];
  specs.forEach((s) => {
    const { wheelRoot, spinGroup } = buildSingleWheel(
      s.r,
      s.w,
      s.left,
      s.front,
      bp,
      caliperMat,
      rotorMat,
      carbonMat,
      rimMat
    );
    wheelRoot.position.set(s.x, s.y, s.z);
    group.add(wheelRoot);
    spinGroups.push(spinGroup);
  });

  return {
    group,
    caliperMats: [caliperMat],
    rotorMats: [rotorMat],
    spinGroups,
  };
}
