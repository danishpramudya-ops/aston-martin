import * as THREE from 'three';

export interface DrivingTrack {
  group: THREE.Group;
  setVisible: (visible: boolean) => void;
  update: (dt: number, speedKmh: number, steerNorm: number, laneOffsetX: number, nightMode: boolean) => void;
  dispose: () => void;
}

const ROAD_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const ROAD_FRAG = /* glsl */ `
  uniform float uTravel;
  uniform float uCurve;
  uniform float uLaneX;
  uniform float uSpeedNorm;
  uniform float uNight;
  varying vec2 vUv;
  varying vec3 vWorld;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    // Car faces -Z; distance ahead is -vWorld.z
    float ahead = -vWorld.z;
    float curveShift = uCurve * ahead * ahead * 0.0022;
    float roadX = vWorld.x + uLaneX - curveShift;
    float roadZ = vWorld.z - uTravel;

    // Fine asphalt micro-grain
    float grain = hash21(floor(vec2(roadX * 14.0, roadZ * 14.0))) * 0.032;
    float coarse = hash21(floor(vec2(roadX * 3.0, roadZ * 3.0))) * 0.022;

    float roadHalfW = 5.8;
    float absX = abs(roadX);
    float onRoad = 1.0 - smoothstep(roadHalfW - 0.12, roadHalfW + 0.12, absX);

    // Asphalt base vs dark proving-ground runoff
    vec3 asphalt = vec3(0.032, 0.036, 0.035) + vec3(grain + coarse);
    vec3 runoff = vec3(0.012, 0.017, 0.015) + vec3(grain * 0.45);
    vec3 col = mix(runoff, asphalt, onRoad);

    // Racing kerbs at ±5.8m (British Racing Green & Champagne alternating blocks)
    float kerbBand = smoothstep(roadHalfW - 0.36, roadHalfW - 0.24, absX) * (1.0 - smoothstep(roadHalfW + 0.18, roadHalfW + 0.3, absX));
    float kerbStripe = step(0.5, fract(roadZ * 0.28));
    vec3 kerbCol = mix(vec3(0.02, 0.24, 0.14), vec3(0.58, 0.49, 0.32), kerbStripe);
    col = mix(col, kerbCol, kerbBand * 0.85);

    // Crisp shoulder edge lines
    float edgeLine = smoothstep(roadHalfW - 0.62, roadHalfW - 0.56, absX) * (1.0 - smoothstep(roadHalfW - 0.48, roadHalfW - 0.42, absX));
    col = mix(col, vec3(0.74, 0.76, 0.72), edgeLine * 0.55);

    // Dashed center telemetry guide line
    float centerLine = (1.0 - smoothstep(0.055, 0.085, absX)) * step(0.42, fract(roadZ * 0.14));
    col = mix(col, vec3(0.77, 0.84, 0.08), centerLine * 0.52);

    // Subtle twilight specular reflection strip down road center
    float sheen = exp(-roadX * roadX * 0.12) * (0.04 + 0.05 * uSpeedNorm);
    col += vec3(0.18, 0.22, 0.20) * sheen * onRoad;

    // Dual LED headlamp beam pools cast forward onto scrolling tarmac
    float f = max(0.0, ahead - 1.8);
    float spread = 0.28 + f * 0.19;
    float beamL = exp(-pow((vWorld.x + 0.72) / spread, 2.0));
    float beamR = exp(-pow((vWorld.x - 0.72) / spread, 2.0));
    float beamReach = smoothstep(0.0, 2.2, f) * exp(-f * 0.042);
    float beamPower = mix(0.28, 0.72, uNight);
    col += vec3(0.82, 0.91, 1.0) * (beamL + beamR) * beamReach * beamPower;

    // Rear crimson tail-light reflection glow on tarmac behind car
    float behind = max(0.0, vWorld.z - 2.0);
    float tailPool = exp(-vWorld.x * vWorld.x * 0.9) * exp(-behind * 0.45);
    col += vec3(0.85, 0.08, 0.1) * tailPool * (0.28 + 0.35 * uNight);

    // Planted soft shadow directly beneath chassis
    float underCar = exp(-pow(vWorld.x / 1.05, 2.0) - pow(vWorld.z / 2.25, 2.0));
    col *= 1.0 - underCar * 0.84;

    // Smooth atmospheric twilight distance fade into void
    float dist = length(vWorld.xz * vec2(1.0, 0.32));
    float fog = smoothstep(14.0, 42.0, dist);
    vec3 voidCol = mix(vec3(0.016, 0.022, 0.020), vec3(0.008, 0.010, 0.012), uNight);
    col = mix(col, voidCol, fog);

    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * Builds the twilight Gaydon Proving Ground 3D circuit environment for the interactive driving
 * simulator: infinite speed-scrolling asphalt shader, steering-reactive track curvature,
 * illuminated overhead architectural light gantries, and high-speed peripheral aero streaks.
 */
export function buildDrivingTrack(): DrivingTrack {
  const group = new THREE.Group();
  group.name = 'gaydon_proving_ground';
  group.visible = false;

  const roadUniforms = {
    uTravel: { value: 0 },
    uCurve: { value: 0 },
    uLaneX: { value: 0 },
    uSpeedNorm: { value: 0 },
    uNight: { value: 0 },
  };

  const roadMat = new THREE.ShaderMaterial({
    uniforms: roadUniforms,
    vertexShader: ROAD_VERT,
    fragmentShader: ROAD_FRAG,
    depthWrite: true,
  });

  const roadGeo = new THREE.PlaneGeometry(36, 170, 1, 1);
  roadGeo.rotateX(-Math.PI / 2);
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.position.set(0, -0.004, -36);
  group.add(roadMesh);

  // Architectural Gaydon Proving Ground Light Gantries rushing past overhead
  const gantryCount = 9;
  const gantrySpacing = 18;
  const gantries: THREE.Group[] = [];
  const pillarMat = new THREE.MeshStandardMaterial({
    color: '#111614',
    metalness: 0.72,
    roughness: 0.36,
  });
  const stripMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.9, 1.72, 1.32), // Warm champagne HDR glow for clamped bloom
  });
  const beaconMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.45, 1.65, 0.08), // AMR Lime trackside distance beacons
  });

  const pillarGeo = new THREE.BoxGeometry(0.24, 5.2, 0.36);
  const beamGeo = new THREE.BoxGeometry(13.6, 0.22, 0.36);
  const stripGeo = new THREE.BoxGeometry(10.8, 0.07, 0.14);
  const beaconGeo = new THREE.BoxGeometry(0.1, 0.95, 0.12);

  for (let i = 0; i < gantryCount; i++) {
    const g = new THREE.Group();
    const leftP = new THREE.Mesh(pillarGeo, pillarMat);
    leftP.position.set(-6.7, 2.6, 0);
    const rightP = new THREE.Mesh(pillarGeo, pillarMat);
    rightP.position.set(6.7, 2.6, 0);
    const topBeam = new THREE.Mesh(beamGeo, pillarMat);
    topBeam.position.set(0, 5.2, 0);
    const lightStrip = new THREE.Mesh(stripGeo, stripMat);
    lightStrip.position.set(0, 5.06, 0);
    const beaconL = new THREE.Mesh(beaconGeo, beaconMat);
    beaconL.position.set(-6.54, 1.1, 0);
    const beaconR = new THREE.Mesh(beaconGeo, beaconMat);
    beaconR.position.set(6.54, 1.1, 0);

    g.add(leftP, rightP, topBeam, lightStrip, beaconL, beaconR);
    g.position.set(0, 0, 18 - i * gantrySpacing);
    group.add(g);
    gantries.push(g);
  }

  // High-speed peripheral aero velocity streaks (>140 km/h)
  const streakCount = 48;
  const streakPos = new Float32Array(streakCount * 6);
  const streakSeed = Array.from({ length: streakCount }, (_, i) => ({
    x: (i % 2 === 0 ? -1 : 1) * (2.6 + Math.random() * 4.4),
    y: 0.35 + Math.random() * 2.8,
    z: -Math.random() * 75,
  }));
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
  const streakMat = new THREE.LineBasicMaterial({
    color: '#d9e8df',
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const streakLines = new THREE.LineSegments(streakGeo, streakMat);
  group.add(streakLines);

  let travelMeters = 0;
  let curveSmooth = 0;

  return {
    group,
    setVisible: (visible: boolean) => {
      group.visible = visible;
    },
    update: (dt: number, speedKmh: number, steerNorm: number, laneOffsetX: number, nightMode: boolean) => {
      if (!group.visible) return;
      const mps = speedKmh / 3.6;
      const speedNorm = Math.min(1, speedKmh / 350);
      travelMeters += mps * dt;
      curveSmooth += (steerNorm * 1.45 - curveSmooth) * Math.min(1, dt * 4.5);

      roadUniforms.uTravel.value = travelMeters;
      roadUniforms.uCurve.value = curveSmooth;
      roadUniforms.uLaneX.value = laneOffsetX;
      roadUniforms.uSpeedNorm.value = speedNorm;
      roadUniforms.uNight.value = nightMode ? 1 : 0;

      // Scroll overhead gantries smoothly past car and bend along active road curvature
      const totalSpan = gantryCount * gantrySpacing;
      for (let i = 0; i < gantryCount; i++) {
        const g = gantries[i];
        const rawZ = ((travelMeters + i * gantrySpacing) % totalSpan) - (totalSpan - 22);
        const ahead = -rawZ;
        const curveX = curveSmooth * ahead * ahead * 0.0022;
        g.position.set(curveX - laneOffsetX, 0, rawZ);
        g.rotation.y = -curveSmooth * ahead * 0.003;
      }

      // Speed-warp peripheral streaks above 120 km/h
      const streakAlpha = THREE.MathUtils.clamp((speedKmh - 110) / 210, 0, 0.42);
      streakMat.opacity = streakAlpha;
      streakLines.visible = streakAlpha > 0.01;
      if (streakLines.visible) {
        const arr = streakGeo.attributes.position.array as Float32Array;
        const streakLen = 1.4 + speedNorm * 5.8;
        for (let i = 0; i < streakCount; i++) {
          const s = streakSeed[i];
          s.z += mps * dt * 1.25;
          if (s.z > 10) s.z -= 82;
          const idx = i * 6;
          arr[idx] = s.x;
          arr[idx + 1] = s.y;
          arr[idx + 2] = s.z;
          arr[idx + 3] = s.x;
          arr[idx + 4] = s.y;
          arr[idx + 5] = s.z + streakLen;
        }
        streakGeo.attributes.position.needsUpdate = true;
      }
    },
    dispose: () => {
      roadGeo.dispose();
      roadMat.dispose();
      pillarGeo.dispose();
      beamGeo.dispose();
      stripGeo.dispose();
      beaconGeo.dispose();
      pillarMat.dispose();
      stripMat.dispose();
      beaconMat.dispose();
      streakGeo.dispose();
      streakMat.dispose();
    },
  };
}
