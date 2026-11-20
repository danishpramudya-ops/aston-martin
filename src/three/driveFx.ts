/**
 * Tyre FX for the Proving Ground: rubber smoke / grass dust particles and skid marks laid on the
 * asphalt. Both live in track space (inside the circuit group) so they stay where they were made
 * while the floating-origin world slides under the car.
 */
import * as THREE from 'three';

const SMOKE_VERT = /* glsl */ `
  attribute float aAlpha;
  attribute float aSize;
  attribute float aTint;
  uniform float uScale;
  varying float vAlpha;
  varying float vTint;
  void main() {
    vAlpha = aAlpha;
    vTint = aTint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.5, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const SMOKE_FRAG = /* glsl */ `
  uniform vec3 uSmoke;
  uniform vec3 uDust;
  varying float vAlpha;
  varying float vTint;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c);
    float a = smoothstep(0.5, 0.05, r) * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(mix(uSmoke, uDust, vTint), a);
  }
`;

const SKID_VERT = /* glsl */ `
  attribute float aAlpha;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKID_FRAG = /* glsl */ `
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(0.012, 0.012, 0.013, vAlpha * 0.62);
  }
`;

export interface DriveFx {
  group: THREE.Group;
  /** Emits smoke (tint 0) or dust (tint 1) at a track-space point. */
  emit: (x: number, y: number, z: number, vx: number, vz: number, amount: number, tint: number) => void;
  /** Lays rubber for wheel `wheel` (0 = rear left, 1 = rear right) at (x, z); strength 0 lifts it. */
  skid: (wheel: number, x: number, z: number, strength: number) => void;
  update: (dt: number, pixelScale: number) => void;
  setNight: (night01: number) => void;
  clear: () => void;
  dispose: () => void;
}

export function createDriveFx(): DriveFx {
  const group = new THREE.Group();
  group.name = 'drive_fx';

  // ---- smoke / dust particles ----
  const MAX = 220;
  const pos = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3);
  const alpha = new Float32Array(MAX);
  const size = new Float32Array(MAX);
  const tint = new Float32Array(MAX);
  const life = new Float32Array(MAX);
  const maxLife = new Float32Array(MAX);
  const peak = new Float32Array(MAX);
  let cursor = 0;

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const alphaAttr = new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage);
  const sizeAttr = new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage);
  const tintAttr = new THREE.BufferAttribute(tint, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('aAlpha', alphaAttr);
  geo.setAttribute('aSize', sizeAttr);
  geo.setAttribute('aTint', tintAttr);
  const smokeMat = new THREE.ShaderMaterial({
    uniforms: {
      uScale: { value: 600 },
      uSmoke: { value: new THREE.Color(0.78, 0.78, 0.8) },
      uDust: { value: new THREE.Color(0.32, 0.27, 0.19) },
    },
    vertexShader: SMOKE_VERT,
    fragmentShader: SMOKE_FRAG,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, smokeMat);
  points.frustumCulled = false;
  points.renderOrder = 3;
  group.add(points);

  // ---- skid marks: ring buffer of quads ----
  const QUADS = 1600;
  const sPos = new Float32Array(QUADS * 4 * 3);
  const sAlpha = new Float32Array(QUADS * 4);
  const sIdx = new Uint32Array(QUADS * 6);
  for (let q = 0; q < QUADS; q++) {
    const v = q * 4;
    sIdx.set([v, v + 2, v + 1, v + 1, v + 2, v + 3], q * 6);
  }
  const skidGeo = new THREE.BufferGeometry();
  const sPosAttr = new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage);
  const sAlphaAttr = new THREE.BufferAttribute(sAlpha, 1).setUsage(THREE.DynamicDrawUsage);
  skidGeo.setAttribute('position', sPosAttr);
  skidGeo.setAttribute('aAlpha', sAlphaAttr);
  skidGeo.setIndex(new THREE.BufferAttribute(sIdx, 1));
  const skidMat = new THREE.ShaderMaterial({
    vertexShader: SKID_VERT,
    fragmentShader: SKID_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide, // quad winding depends on travel direction
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -8,
  });
  const skidMesh = new THREE.Mesh(skidGeo, skidMat);
  skidMesh.frustumCulled = false;
  skidMesh.renderOrder = 2;
  group.add(skidMesh);
  let skidCursor = 0;
  let skidCount = 0;
  const last: ({ x: number; z: number; a: number } | null)[] = [null, null];
  let skidDirty = false;

  const emit = (x: number, y: number, z: number, vx: number, vz: number, amount: number, t: number) => {
    const i = cursor;
    cursor = (cursor + 1) % MAX;
    pos[i * 3] = x + (Math.random() - 0.5) * 0.3;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.3;
    vel[i * 3] = vx * 0.25 + (Math.random() - 0.5) * 1.6;
    vel[i * 3 + 1] = 0.5 + Math.random() * 0.9;
    vel[i * 3 + 2] = vz * 0.25 + (Math.random() - 0.5) * 1.6;
    maxLife[i] = 1.2 + Math.random() * 1.3;
    life[i] = maxLife[i];
    peak[i] = Math.min(1, amount) * (t > 0.5 ? 0.6 : 0.78);
    size[i] = 1.3 + Math.random() * 0.7;
    tint[i] = t;
  };

  const skid = (wheel: number, x: number, z: number, strength: number) => {
    const prev = last[wheel];
    if (strength <= 0.05) {
      last[wheel] = null;
      return;
    }
    if (!prev) {
      last[wheel] = { x, z, a: strength };
      return;
    }
    const dx = x - prev.x;
    const dz = z - prev.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.35) return;
    if (len > 4) {
      last[wheel] = { x, z, a: strength };
      return;
    }
    const nx = (-dz / len) * 0.15;
    const nz = (dx / len) * 0.15;
    const q = skidCursor;
    skidCursor = (skidCursor + 1) % QUADS;
    skidCount = Math.min(QUADS, skidCount + 1);
    const o = q * 12;
    const y = 0.045;
    sPos.set([prev.x - nx, y, prev.z - nz, prev.x + nx, y, prev.z + nz, x - nx, y, z - nz, x + nx, y, z + nz], o);
    const a0 = Math.min(1, prev.a);
    const a1 = Math.min(1, strength);
    sAlpha.set([a0, a0, a1, a1], q * 4);
    last[wheel] = { x, z, a: strength };
    skidDirty = true;
  };

  const update = (dt: number, pixelScale: number) => {
    smokeMat.uniforms.uScale.value = pixelScale;
    let any = false;
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) {
        if (alpha[i] !== 0) {
          alpha[i] = 0;
          any = true;
        }
        continue;
      }
      any = true;
      life[i] -= dt;
      const t = 1 - life[i] / maxLife[i];
      vel[i * 3] *= 1 - dt * 1.4;
      vel[i * 3 + 2] *= 1 - dt * 1.4;
      vel[i * 3 + 1] *= 1 - dt * 0.6;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      size[i] += dt * (tint[i] > 0.5 ? 2.4 : 4.2);
      alpha[i] = peak[i] * Math.sin(Math.min(1, t) * Math.PI) * (1 - t * 0.4);
    }
    if (any) {
      posAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;
      tintAttr.needsUpdate = true;
    }
    if (skidDirty) {
      sPosAttr.needsUpdate = true;
      sAlphaAttr.needsUpdate = true;
      skidDirty = false;
    }
    skidGeo.setDrawRange(0, skidCount * 6);
  };

  return {
    group,
    emit,
    skid,
    update,
    setNight: (n: number) => {
      smokeMat.uniforms.uSmoke.value.setRGB(0.78, 0.78, 0.8).multiplyScalar(1 - 0.8 * n);
      smokeMat.uniforms.uDust.value.setRGB(0.32, 0.27, 0.19).multiplyScalar(1 - 0.8 * n);
    },
    clear: () => {
      life.fill(0);
      alpha.fill(0);
      alphaAttr.needsUpdate = true;
      skidCount = 0;
      skidCursor = 0;
      last[0] = last[1] = null;
      skidGeo.setDrawRange(0, 0);
    },
    dispose: () => {
      geo.dispose();
      smokeMat.dispose();
      skidGeo.dispose();
      skidMat.dispose();
    },
  };
}
