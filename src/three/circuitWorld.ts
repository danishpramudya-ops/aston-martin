/**
 * The Gaydon Proving Ground as a three.js world, built once from TrackData.
 *
 * Floating origin: the car never leaves the scene origin (so the studio's lights, contact shadow,
 * cockpit rig and camera POVs keep working untouched); instead this whole group is moved by the
 * inverse of the car's pose every frame. Everything here lives in track space inside `group`.
 *
 * No new lights and no scene.fog: either would change the program cache key of every material on
 * the car and recompile them mid-session. Ground shaders light and fog themselves, standard
 * materials get a uniform-driven fog patch instead.
 */
import * as THREE from 'three';
import type { TrackData } from '../game/trackLayout';

export interface CircuitWorld {
  group: THREE.Group;
  /** Places the world so the car at (x, z, heading) in track space sits at the scene origin. */
  setCarPose: (x: number, z: number, heading: number) => void;
  /** Sun direction in scene space (rotates with the car's heading). */
  sunDirScene: THREE.Vector3;
  setNight: (night01: number) => void;
  setStartLights: (lit: number) => void;
  setContactShadow: (texture: THREE.Texture | null, rect: THREE.Vector4) => void;
  setLamps: (halfSpacing: number, noseZ: number, tailZ: number) => void;
  update: (dt: number) => void;
  /** Track-space sun direction (constant). */
  sunDirTrack: THREE.Vector3;
  dispose: () => void;
}

/* ------------------------------------------------------------------------------------------------
 * Shared lighting / fog GLSL
 * ---------------------------------------------------------------------------------------------- */

const SHARED_PARS = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyAmb;
  uniform vec3 uGroundAmb;
  uniform float uNight;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform sampler2D uShadowTex;
  uniform vec4 uShadowRect;
  uniform float uShadowOpacity;
  uniform vec3 uLamps;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  vec3 lightSurface(vec3 albedo, vec3 N, vec3 world, float specAmt, float shininess) {
    vec3 V = normalize(cameraPosition - world);
    float ndl = max(dot(N, uSunDir), 0.0);
    vec3 amb = mix(uGroundAmb, uSkyAmb, N.y * 0.5 + 0.5);
    vec3 col = albedo * (amb + uSunColor * ndl);
    vec3 H = normalize(uSunDir + V);
    col += uSunColor * pow(max(dot(N, H), 0.0), shininess) * specAmt * ndl;
    return col;
  }
  float contactShadow(vec3 world) {
    vec2 suv = (world.xz - uShadowRect.xy) / uShadowRect.zw;
    float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
    return clamp(texture2D(uShadowTex, suv).a * inside * uShadowOpacity, 0.0, 0.96);
  }
  // Headlamp throw and tail-light wash in car-local (= scene) space: the car sits at the origin
  // facing −Z, so world-space fragment positions are already relative to the lamps.
  vec3 carLamps(vec3 world) {
    float f = uLamps.y - world.z;
    float beams = 0.0;
    for (int k = 0; k < 2; k++) {
      float lx = (k == 0 ? -uLamps.x : uLamps.x);
      float l = world.x - lx;
      float spread = 0.4 + max(f, 0.0) * 0.3;
      beams += exp(-(l * l) / (spread * spread)) * smoothstep(0.4, 3.0, f) * exp(-max(f, 0.0) * 0.06);
    }
    vec3 col = vec3(1.0, 0.95, 0.86) * beams * (0.1 + 0.62 * uNight);
    float behind = max(world.z - uLamps.z, 0.0);
    col += vec3(1.0, 0.04, 0.05) * exp(-behind * 0.9) * exp(-world.x * world.x * 1.6) * smoothstep(uLamps.z - 0.2, uLamps.z + 0.2, world.z) * (0.05 + 0.45 * uNight);
    return col;
  }
  vec3 applyFog(vec3 col, vec3 world) {
    float d = length(world - cameraPosition);
    return mix(col, uFogColor, smoothstep(uFogNear, uFogFar, d));
  }
`;

const WORLD_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const ROAD_FRAG = /* glsl */ `
  ${SHARED_PARS}
  uniform float uLength;
  uniform float uHalfWidth;
  uniform float uGridS;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    float u = vUv.x;
    float s = vUv.y;
    float au = abs(u);
    float g1 = hash21(floor(vec2(u, s) * 11.0));
    float g2 = vnoise(vec2(u, s) * 0.45);
    float g3 = vnoise(vec2(u * 0.11, s * 0.018));
    vec3 col = vec3(0.064, 0.066, 0.07) * (0.82 + 0.2 * g2 + 0.22 * g3) + (g1 - 0.5) * 0.016;
    // rubbered-in racing groove and a lighter, dusty margin off-line
    col *= 1.0 - 0.2 * exp(-u * u / 7.0) * (0.7 + 0.3 * g3);
    col *= 1.0 + 0.12 * smoothstep(uHalfWidth - 2.5, uHalfWidth - 0.6, au);
    // white edge lines
    float line = smoothstep(uHalfWidth - 0.37, uHalfWidth - 0.34, au) * (1.0 - smoothstep(uHalfWidth - 0.14, uHalfWidth - 0.11, au));
    col = mix(col, vec3(0.74, 0.75, 0.72) * (0.9 + 0.1 * g1), line);
    // chequered start / finish line
    float onLane = 1.0 - step(uHalfWidth - 0.4, au);
    if (s < 1.8 && onLane > 0.5) {
      float c = mod(floor(u / 0.6) + floor(s / 0.6), 2.0);
      col = mix(vec3(0.02), vec3(0.82), c);
    }
    // staggered grid boxes behind the line
    for (int k = 0; k < 6; k++) {
      float slot = uGridS - float(k) * 9.0;
      float side = mod(float(k), 2.0) < 0.5 ? -3.2 : 3.2;
      float ds = s - slot;
      float du = abs(u - side);
      float front = step(-2.85, ds) * step(ds, -2.6) * step(du, 1.35);
      float legs = step(du, 1.35) * step(1.2, du) * step(-2.85, ds) * step(ds, -0.9);
      col = mix(col, vec3(0.78), clamp(front + legs, 0.0, 1.0) * 0.9);
    }
    vec3 N = vec3(0.0, 1.0, 0.0);
    vec3 lit = lightSurface(col, N, vWorld, 0.55, 22.0);
    lit *= 1.0 - contactShadow(vWorld);
    lit += col * carLamps(vWorld) * 7.0;
    gl_FragColor = vec4(applyFog(lit, vWorld), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const KERB_FRAG = /* glsl */ `
  ${SHARED_PARS}
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    float s = vUv.y;
    float across = vUv.x;
    float stripe = step(0.5, fract(s / 3.0));
    vec3 red = vec3(0.6, 0.035, 0.03);
    vec3 white = vec3(0.82, 0.82, 0.8);
    vec3 col = mix(red, white, stripe);
    col *= 0.9 + 0.1 * hash21(floor(vec2(across * 6.0, s * 5.0)));
    // painted inner lip
    col = mix(col, vec3(0.86), (1.0 - smoothstep(0.03, 0.06, across)) * 0.6);
    vec3 lit = lightSurface(col, normalize(vNormalW), vWorld, 0.35, 30.0);
    lit *= 1.0 - contactShadow(vWorld);
    lit += col * carLamps(vWorld) * 6.0;
    gl_FragColor = vec4(applyFog(lit, vWorld), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const BARRIER_FRAG = /* glsl */ `
  ${SHARED_PARS}
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vCorner;
  void main() {
    float s = vUv.y;
    float h = vUv.x; // 0 bottom … 1 top
    // Armco on the straights: corrugated galvanised steel with posts every 4 m
    float corr = 0.55 + 0.45 * sin(h * 6.2831 * 2.0);
    vec3 steel = vec3(0.32, 0.34, 0.35) * (0.6 + 0.5 * corr);
    steel *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.08, abs(fract(s / 4.0) - 0.5) - 0.42));
    vec3 lime = vec3(0.6, 0.68, 0.02);
    steel = mix(steel, lime, step(0.9, h));
    // Tecpro blocks in the corners: alternating red / white
    float block = step(0.5, fract(s / 3.0));
    vec3 tec = mix(vec3(0.55, 0.05, 0.05), vec3(0.8, 0.8, 0.78), block) * (0.85 + 0.15 * smoothstep(0.0, 0.2, h));
    tec *= 1.0 - 0.25 * smoothstep(0.42, 0.5, abs(fract(s / 1.5) - 0.5));
    vec3 col = mix(steel, tec, vCorner);
    vec3 N = normalize(vNormalW);
    vec3 lit = lightSurface(col, N, vWorld, mix(0.6, 0.15, vCorner), 18.0);
    lit += col * carLamps(vWorld) * 4.0;
    gl_FragColor = vec4(applyFog(lit, vWorld), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const BARRIER_VERT = /* glsl */ `
  attribute float corner;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vCorner;
  void main() {
    vUv = uv;
    vCorner = corner;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const GROUND_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec2 vTrack;
  void main() {
    vTrack = position.xz;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const GROUND_FRAG = /* glsl */ `
  ${SHARED_PARS}
  uniform sampler2D uField;
  uniform vec4 uFieldRect; // minX, minZ, sizeX, sizeZ
  uniform float uHalfWidth;
  uniform float uKerbOuter;
  varying vec3 vWorld;
  varying vec2 vTrack;
  void main() {
    vec2 fuv = (vTrack - uFieldRect.xy) / uFieldRect.zw;
    float inField = step(0.0, fuv.x) * step(fuv.x, 1.0) * step(0.0, fuv.y) * step(fuv.y, 1.0);
    vec4 fld = texture2D(uField, clamp(fuv, 0.0, 1.0));
    float d = mix(80.0, fld.r * 80.0, inField);
    float outside = fld.g * inField;

    float n1 = vnoise(vTrack * 0.06);
    float n2 = vnoise(vTrack * 0.6);
    float n3 = hash21(floor(vTrack * 3.0));
    vec3 grassA = vec3(0.058, 0.108, 0.04);
    vec3 grassB = vec3(0.092, 0.145, 0.052);
    vec3 col = mix(grassA, grassB, n1) * (0.85 + 0.25 * n2) + (n3 - 0.5) * 0.008;
    // mown stripes running parallel to the circuit, fading out into rough grass
    float stripe = step(0.5, fract(d / 7.0));
    col *= mix(1.0, mix(0.86, 1.12, stripe), 1.0 - smoothstep(40.0, 70.0, d));
    // worn verge right next to the asphalt
    col = mix(col, vec3(0.085, 0.09, 0.06), (1.0 - smoothstep(uHalfWidth + 0.4, uHalfWidth + 2.4, d)) * 0.7);
    // gravel traps on the outside of the tighter bends
    float trap = smoothstep(0.35, 0.6, outside) * smoothstep(uKerbOuter + 0.3, uKerbOuter + 1.2, d) * (1.0 - smoothstep(14.5, 15.5, d));
    vec3 gravel = vec3(0.36, 0.31, 0.22) * (0.75 + 0.3 * hash21(floor(vTrack * 9.0)) + 0.15 * n2);
    col = mix(col, gravel, trap);
    // far field darkens into the dusk
    col *= 1.0 - 0.35 * smoothstep(120.0, 900.0, length(vWorld.xz));

    vec3 lit = lightSurface(col, vec3(0.0, 1.0, 0.0), vWorld, trap * 0.2, 12.0);
    lit *= 1.0 - contactShadow(vWorld);
    lit += col * carLamps(vWorld) * 6.0;
    gl_FragColor = vec4(applyFog(lit, vWorld), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww; // pinned to the far plane
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uSunDirTrack;
  uniform float uNight;
  uniform vec3 uFogColor;
  varying vec3 vDir;
  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    float sunAmt = max(dot(d, uSunDirTrack), 0.0);
    vec3 zenithDay = vec3(0.014, 0.04, 0.13);
    vec3 horizonDay = vec3(0.42, 0.33, 0.37);
    vec3 zenithNight = vec3(0.004, 0.007, 0.018);
    vec3 horizonNight = vec3(0.03, 0.045, 0.07);
    vec3 zenith = mix(zenithDay, zenithNight, uNight);
    vec3 horizon = mix(horizonDay, horizonNight, uNight);
    vec3 col = mix(horizon, zenith, pow(smoothstep(-0.02, 0.6, h), 0.5));
    float day = 1.0 - uNight;
    // sun side: a warm amber band hugging the horizon
    float toward = pow(sunAmt, 4.0);
    col += vec3(1.0, 0.46, 0.16) * toward * 0.85 * day * (1.0 - smoothstep(0.0, 0.32, h));
    col += vec3(1.0, 0.72, 0.45) * pow(sunAmt, 40.0) * 1.3 * day;
    // anti-sun side: rosy 'belt of Venus' over the bluish shadow of the earth
    float away = pow(max(dot(d, -uSunDirTrack), 0.0), 1.5);
    float belt = smoothstep(0.02, 0.09, h) * (1.0 - smoothstep(0.1, 0.28, h));
    col = mix(col, vec3(0.66, 0.38, 0.46), belt * away * 0.5 * day);
    col = mix(col, vec3(0.2, 0.24, 0.36), (1.0 - smoothstep(0.0, 0.05, h)) * away * 0.45 * day);
    col += vec3(2.4, 1.8, 1.2) * smoothstep(0.99935, 0.99965, sunAmt) * 6.0 * (1.0 - uNight);
    // stars
    if (uNight > 0.01 && h > 0.0) {
      vec3 cell = floor(d * 280.0);
      float star = step(0.9975, hash31(cell));
      col += vec3(0.9, 0.95, 1.0) * star * uNight * smoothstep(0.02, 0.25, h) * 1.4;
    }
    col = mix(col, uFogColor, smoothstep(0.03, -0.04, h));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const HILLS_FRAG = /* glsl */ `
  uniform vec3 uFogColor;
  uniform float uNight;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vec3 base = mix(vec3(0.05, 0.07, 0.07), vec3(0.01, 0.014, 0.02), uNight);
    float layer = vUv.x; // 0 near ring … 1 far ring
    vec3 col = mix(base, uFogColor, 0.35 + 0.4 * layer);
    col = mix(col, uFogColor, smoothstep(0.65, 1.0, vUv.y) * 0.25);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/* ------------------------------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------------------------------- */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface FogUniforms {
  uFogColor: { value: THREE.Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
}

/** Uniform-driven distance fog for built-in materials (scene.fog would recompile the car). */
function withDriveFog<T extends THREE.Material>(mat: T, fog: FogUniforms): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFogColor = fog.uFogColor;
    shader.uniforms.uFogNear = fog.uFogNear;
    shader.uniforms.uFogFar = fog.uFogFar;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFogColor;\nuniform float uFogNear;\nuniform float uFogFar;')
      .replace(
        '#include <fog_fragment>',
        'gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogColor, smoothstep(uFogNear, uFogFar, length(vViewPosition)));'
      );
  };
  mat.customProgramCacheKey = () => 'drive-fog';
  return mat;
}

interface TrackField {
  data: Uint8Array;
  res: number;
  rect: THREE.Vector4;
  texture: THREE.DataTexture;
  distanceAt: (x: number, z: number) => number;
}

/** Distance-to-centre-line field (R) + "outside of a bend" mask (G) baked on the CPU. */
function buildTrackField(track: TrackData, res = 384, margin = 170): TrackField {
  const { minX, maxX, minZ, maxZ } = track.bounds;
  const x0 = minX - margin;
  const z0 = minZ - margin;
  const sx = maxX - minX + margin * 2;
  const sz = maxZ - minZ + margin * 2;
  const cell = 24;
  const gw = Math.ceil(sx / cell);
  const gh = Math.ceil(sz / cell);
  const buckets: number[][] = Array.from({ length: gw * gh }, () => []);
  for (let i = 0; i < track.count; i++) {
    const cx = Math.floor((track.px[i] - x0) / cell);
    const cz = Math.floor((track.pz[i] - z0) / cell);
    buckets[cz * gw + cx].push(i);
  }
  const data = new Uint8Array(res * res * 4);
  const R = 3;
  for (let tz = 0; tz < res; tz++) {
    const wz = z0 + ((tz + 0.5) / res) * sz;
    const cz = Math.floor((wz - z0) / cell);
    for (let tx = 0; tx < res; tx++) {
      const wx = x0 + ((tx + 0.5) / res) * sx;
      const cx = Math.floor((wx - x0) / cell);
      let best = Infinity;
      let bi = -1;
      for (let oz = -R; oz <= R; oz++) {
        const z = cz + oz;
        if (z < 0 || z >= gh) continue;
        for (let ox = -R; ox <= R; ox++) {
          const x = cx + ox;
          if (x < 0 || x >= gw) continue;
          const b = buckets[z * gw + x];
          for (let k = 0; k < b.length; k++) {
            const i = b[k];
            const d = (track.px[i] - wx) ** 2 + (track.pz[i] - wz) ** 2;
            if (d < best) {
              best = d;
              bi = i;
            }
          }
        }
      }
      const o = (tz * res + tx) * 4;
      if (bi < 0) {
        data[o] = 255;
        data[o + 3] = 255;
        continue;
      }
      const lateral = (wx - track.px[bi]) * -track.tz[bi] + (wz - track.pz[bi]) * track.tx[bi];
      const dist = Math.abs(lateral);
      const k = track.curvature[bi];
      const outside = lateral * k < 0 ? Math.min(1, Math.max(0, Math.abs(k) * 260 - 0.6)) : 0;
      data[o] = Math.min(255, Math.round((dist / 80) * 255));
      data[o + 1] = Math.round(outside * 255);
      data[o + 2] = lateral >= 0 ? 255 : 0;
      data[o + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, res, res, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  const rect = new THREE.Vector4(x0, z0, sx, sz);
  const distanceAt = (x: number, z: number) => {
    const fx = Math.floor(((x - x0) / sx) * res);
    const fz = Math.floor(((z - z0) / sz) * res);
    if (fx < 0 || fz < 0 || fx >= res || fz >= res) return 999;
    return (data[(fz * res + fx) * 4] / 255) * 80;
  };
  return { data, res, rect, texture, distanceAt };
}

/** Ribbon following the centre line between two lateral offsets (per-sample functions). */
function ribbon(
  track: TrackData,
  from: (i: number) => number,
  to: (i: number) => number,
  y: (i: number, edge: 0 | 1) => number,
  uvAcross: (edge: 0 | 1) => number,
  include: (i: number) => boolean = () => true
): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const n = track.count;
  let prevRow = -1;
  for (let k = 0; k <= n; k++) {
    const i = k % n;
    const on = include(i) || (k > 0 && include((k - 1) % n));
    if (!on) {
      prevRow = -1;
      continue;
    }
    const rx = -track.tz[i];
    const rz = track.tx[i];
    const s = k === n ? track.length : track.s[i];
    const a = from(i);
    const b = to(i);
    const base = pos.length / 3;
    pos.push(track.px[i] + rx * a, y(i, 0), track.pz[i] + rz * a);
    pos.push(track.px[i] + rx * b, y(i, 1), track.pz[i] + rz * b);
    uv.push(uvAcross(0), s, uvAcross(1), s);
    nor.push(0, 1, 0, 0, 1, 0);
    if (prevRow >= 0) {
      // a = prev inner, b = prev outer, c = inner, d = outer
      const pa = prevRow;
      const pb = prevRow + 1;
      const ca = base;
      const cb = base + 1;
      idx.push(pa, cb, pb, pa, ca, cb);
    }
    prevRow = base;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Ensures every triangle faces +Y (ribbons built with either winding). */
function faceUp(g: THREE.BufferGeometry) {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const index = g.getIndex()!;
  const arr = index.array as Uint16Array | Uint32Array;
  for (let t = 0; t < arr.length; t += 3) {
    const a = arr[t];
    const b = arr[t + 1];
    const c = arr[t + 2];
    const abx = p.getX(b) - p.getX(a);
    const abz = p.getZ(b) - p.getZ(a);
    const acx = p.getX(c) - p.getX(a);
    const acz = p.getZ(c) - p.getZ(a);
    // y-component of (ab × ac) must be positive for an upward normal
    if (abz * acx - abx * acz < 0) {
      arr[t + 1] = c;
      arr[t + 2] = b;
    }
  }
  index.needsUpdate = true;
}

function barrierGeometry(track: TrackData, side: 1 | -1, height: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  const corner: number[] = [];
  const idx: number[] = [];
  const n = track.count;
  const offs = side > 0 ? track.barrierRight : track.barrierLeft;
  for (let k = 0; k <= n; k++) {
    const i = k % n;
    const rx = -track.tz[i] * side;
    const rz = track.tx[i] * side;
    const o = offs[i];
    const x = track.px[i] + rx * o;
    const z = track.pz[i] + rz * o;
    const s = k === n ? track.length : track.s[i];
    pos.push(x, 0, z, x, height, z);
    uv.push(0, s, 1, s);
    // faces the track (inward)
    nor.push(-rx, 0, -rz, -rx, 0, -rz);
    const c = track.kerb[i] > 0 || Math.abs(track.curvature[i]) > 1 / 300 ? 1 : 0;
    corner.push(c, c);
    if (k > 0) {
      const b = k * 2;
      const a = b - 2;
      if (side > 0) idx.push(a, a + 1, b, b, a + 1, b + 1);
      else idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('corner', new THREE.Float32BufferAttribute(corner, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function boardTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ['300', '200', '100'].forEach((label, i) => {
    const x = i * 128;
    ctx.fillStyle = '#f2f3f0';
    ctx.fillRect(x, 0, 128, 128);
    ctx.fillStyle = '#0b0d0c';
    ctx.fillRect(x + 6, 6, 116, 116);
    ctx.fillStyle = '#f2f3f0';
    ctx.font = 'bold 52px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 64, 68);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function facadeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1a1f1d';
  ctx.fillRect(0, 0, 1024, 128);
  for (let i = 0; i < 16; i++) {
    const x = i * 64 + 6;
    const g = ctx.createLinearGradient(0, 30, 0, 128);
    g.addColorStop(0, '#2b332f');
    g.addColorStop(1, '#0a0c0b');
    ctx.fillStyle = g;
    ctx.fillRect(x, 34, 52, 94);
    ctx.fillStyle = 'rgba(196,214,0,0.85)';
    ctx.fillRect(x, 30, 52, 3);
  }
  ctx.fillStyle = '#c8a96e';
  ctx.fillRect(0, 10, 1024, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/* ------------------------------------------------------------------------------------------------
 * World builder
 * ---------------------------------------------------------------------------------------------- */

export function buildCircuitWorld(track: TrackData): CircuitWorld {
  const group = new THREE.Group();
  group.name = 'gaydon_proving_ground_circuit';
  group.visible = false;

  const sunDirTrack = new THREE.Vector3(-0.62, 0.3, 0.72).normalize();
  const sunDirScene = sunDirTrack.clone();

  const shared = {
    uSunDir: { value: sunDirScene },
    uSunColor: { value: new THREE.Color(1.55, 1.12, 0.78) },
    uSkyAmb: { value: new THREE.Color(0.42, 0.45, 0.6) },
    uGroundAmb: { value: new THREE.Color(0.14, 0.13, 0.11) },
    uNight: { value: 0 },
    uFogColor: { value: new THREE.Color(0.34, 0.28, 0.32) },
    uFogNear: { value: 220 },
    uFogFar: { value: 2100 },
    uShadowTex: { value: null as THREE.Texture | null },
    uShadowRect: { value: new THREE.Vector4(-2, -3, 4, 6) },
    uShadowOpacity: { value: 0.9 },
    uLamps: { value: new THREE.Vector3(0.68, -2.2, 2.2) },
  };
  const fogU: FogUniforms = { uFogColor: shared.uFogColor, uFogNear: shared.uFogNear, uFogFar: shared.uFogFar };

  const disposables: { dispose: () => void }[] = [];
  const kerbOuter = track.halfWidth + track.kerbWidth;

  // ---- ground (grass, mown stripes, gravel traps) ----
  const field = buildTrackField(track);
  disposables.push(field.texture);
  const cx = (track.bounds.minX + track.bounds.maxX) / 2;
  const cz = (track.bounds.minZ + track.bounds.maxZ) / 2;
  const groundGeo = new THREE.PlaneGeometry(5200, 5200, 1, 1);
  groundGeo.rotateX(-Math.PI / 2);
  groundGeo.translate(cx, 0, cz);
  const groundMat = new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uField: { value: field.texture },
      uFieldRect: { value: field.rect },
      uHalfWidth: { value: track.halfWidth },
      uKerbOuter: { value: kerbOuter },
    },
    vertexShader: GROUND_VERT,
    fragmentShader: GROUND_FRAG,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.frustumCulled = false;
  ground.renderOrder = -2;
  group.add(ground);
  disposables.push(groundGeo, groundMat);

  // ---- asphalt ----
  const roadEdge = track.halfWidth + 0.55;
  const roadGeo = ribbon(
    track,
    () => -roadEdge,
    () => roadEdge,
    () => 0.02,
    (e) => (e === 0 ? -roadEdge : roadEdge)
  );
  faceUp(roadGeo);
  const roadMat = new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uLength: { value: track.length },
      uHalfWidth: { value: track.halfWidth },
      uGridS: { value: track.length - track.gridBack },
    },
    vertexShader: WORLD_VERT,
    fragmentShader: ROAD_FRAG,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.frustumCulled = false;
  group.add(road);
  disposables.push(roadGeo, roadMat);

  // ---- kerbs (raised, red / white) ----
  const kerbMat = new THREE.ShaderMaterial({
    uniforms: shared,
    vertexShader: WORLD_VERT,
    fragmentShader: KERB_FRAG,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  disposables.push(kerbMat);
  for (const side of [1, -1] as const) {
    const kg = ribbon(
      track,
      () => side * (track.halfWidth - 0.05),
      () => side * kerbOuter,
      (_i, e) => (e === 0 ? 0.025 : 0.075),
      (e) => (e === 0 ? 0 : 1),
      (i) => track.kerb[i] > 0
    );
    faceUp(kg);
    kg.computeVertexNormals();
    const km = new THREE.Mesh(kg, kerbMat);
    km.frustumCulled = false;
    group.add(km);
    disposables.push(kg);
  }

  // ---- barriers ----
  const barrierMat = new THREE.ShaderMaterial({
    uniforms: shared,
    vertexShader: BARRIER_VERT,
    fragmentShader: BARRIER_FRAG,
    side: THREE.DoubleSide,
  });
  disposables.push(barrierMat);
  for (const side of [1, -1] as const) {
    const bg = barrierGeometry(track, side, 1.05);
    const bm = new THREE.Mesh(bg, barrierMat);
    bm.frustumCulled = false;
    group.add(bm);
    disposables.push(bg);
  }

  // ---- sky dome & horizon hills ----
  const skyGeo = new THREE.SphereGeometry(2400, 48, 24);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { uSunDirTrack: { value: sunDirTrack }, uNight: shared.uNight, uFogColor: shared.uFogColor },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  group.add(sky);
  disposables.push(skyGeo, skyMat);

  const rnd = mulberry32(20261120);
  const hillsPos: number[] = [];
  const hillsUv: number[] = [];
  const hillsIdx: number[] = [];
  const rings = [
    { r: 1500, h: 70, amp: 85 },
    { r: 1900, h: 120, amp: 140 },
  ];
  const segs = 180;
  rings.forEach((ring, ri) => {
    const phase = rnd() * 10;
    const base = hillsPos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const n =
        0.5 +
        0.3 * Math.sin(a * 3 + phase) +
        0.15 * Math.sin(a * 7.3 + phase * 2.1) +
        0.08 * Math.sin(a * 17.1 + phase * 0.7);
      const h = ring.h + ring.amp * n;
      const x = cx + Math.cos(a) * ring.r;
      const z = cz + Math.sin(a) * ring.r;
      hillsPos.push(x, -2, z, x, h, z);
      hillsUv.push(ri / (rings.length - 1), 0, ri / (rings.length - 1), 1);
      if (i > 0) {
        const b = base + i * 2;
        const p = b - 2;
        hillsIdx.push(p, b, p + 1, b, b + 1, p + 1);
      }
    }
  });
  const hillsGeo = new THREE.BufferGeometry();
  hillsGeo.setAttribute('position', new THREE.Float32BufferAttribute(hillsPos, 3));
  hillsGeo.setAttribute('uv', new THREE.Float32BufferAttribute(hillsUv, 2));
  const hillsNor = new Float32Array(hillsPos.length);
  for (let i = 1; i < hillsNor.length; i += 3) hillsNor[i] = 1;
  hillsGeo.setAttribute('normal', new THREE.BufferAttribute(hillsNor, 3));
  hillsGeo.setIndex(hillsIdx);
  const hillsMat = new THREE.ShaderMaterial({
    uniforms: { uFogColor: shared.uFogColor, uNight: shared.uNight },
    vertexShader: WORLD_VERT,
    fragmentShader: HILLS_FRAG,
    side: THREE.DoubleSide,
  });
  const hills = new THREE.Mesh(hillsGeo, hillsMat);
  hills.frustumCulled = false;
  hills.renderOrder = -5;
  group.add(hills);
  disposables.push(hillsGeo, hillsMat);

  // ---- trees (instanced) ----
  const treeGeo = (() => {
    const foliage = new THREE.ConeGeometry(2.6, 7.5, 7, 1);
    foliage.translate(0, 6.2, 0);
    const foliage2 = new THREE.ConeGeometry(2.0, 5.0, 7, 1);
    foliage2.translate(0, 9.0, 0);
    const trunk = new THREE.CylinderGeometry(0.22, 0.32, 3.0, 5);
    trunk.translate(0, 1.5, 0);
    const parts = [foliage, foliage2, trunk];
    const colours = [new THREE.Color(1, 1, 1), new THREE.Color(1.08, 1.08, 1.08), new THREE.Color(0.32, 0.22, 0.16)];
    const merged = new THREE.BufferGeometry();
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    parts.forEach((p, pi) => {
      const g = p.index ? p.toNonIndexed() : p;
      const pa = g.getAttribute('position');
      const na = g.getAttribute('normal');
      for (let i = 0; i < pa.count; i++) {
        pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
        nor.push(na.getX(i), na.getY(i), na.getZ(i));
        col.push(colours[pi].r, colours[pi].g, colours[pi].b);
      }
      g.dispose();
      p.dispose();
    });
    merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    merged.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return merged;
  })();
  const treeMat = withDriveFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, color: '#ffffff' }), fogU);
  const treeSpots: { x: number; z: number; s: number; c: THREE.Color }[] = [];
  const clusterCount = 70;
  for (let c = 0; c < clusterCount && treeSpots.length < 900; c++) {
    const ang = rnd() * Math.PI * 2;
    const rad = 120 + rnd() * 900;
    const ccx = cx + Math.cos(ang) * rad;
    const ccz = cz + Math.sin(ang) * rad;
    const members = 6 + Math.floor(rnd() * 16);
    for (let m = 0; m < members; m++) {
      const x = ccx + (rnd() - 0.5) * 70;
      const z = ccz + (rnd() - 0.5) * 70;
      if (field.distanceAt(x, z) < 30) continue;
      const shade = 0.75 + rnd() * 0.4;
      treeSpots.push({ x, z, s: 0.75 + rnd() * 0.7, c: new THREE.Color(0.06 * shade, 0.12 * shade, 0.06 * shade) });
    }
  }
  // a denser belt hugging the infield
  for (let i = 0; i < 260; i++) {
    const x = track.bounds.minX - 40 + rnd() * (track.bounds.maxX - track.bounds.minX + 80);
    const z = track.bounds.minZ - 40 + rnd() * (track.bounds.maxZ - track.bounds.minZ + 80);
    const d = field.distanceAt(x, z);
    if (d < 34 || d > 75) continue;
    const shade = 0.75 + rnd() * 0.4;
    treeSpots.push({ x, z, s: 0.7 + rnd() * 0.6, c: new THREE.Color(0.055 * shade, 0.11 * shade, 0.05 * shade) });
  }
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, treeSpots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  treeSpots.forEach((t, i) => {
    q.setFromAxisAngle(up, rnd() * Math.PI * 2);
    sc.set(t.s, t.s * (0.85 + rnd() * 0.35), t.s);
    m4.compose(new THREE.Vector3(t.x, 0, t.z), q, sc);
    trees.setMatrixAt(i, m4);
    trees.setColorAt(i, t.c);
  });
  trees.instanceMatrix.needsUpdate = true;
  if (trees.instanceColor) trees.instanceColor.needsUpdate = true;
  trees.computeBoundingSphere();
  group.add(trees);
  disposables.push(treeGeo, treeMat);

  // ---- light towers along the circuit ----
  const poleSpots: { x: number; z: number; rot: number }[] = [];
  for (let s = 20; s < track.length; s += 68) {
    const i = Math.floor(s / track.spacing) % track.count;
    const side = Math.floor(s / 68) % 2 === 0 ? 1 : -1;
    const off = (side > 0 ? track.barrierRight[i] : track.barrierLeft[i]) + 2.6;
    const rx = -track.tz[i] * side;
    const rz = track.tx[i] * side;
    const x = track.px[i] + rx * off;
    const z = track.pz[i] + rz * off;
    if (field.distanceAt(x, z) < off - 1.5) continue; // would stand on another part of the track
    poleSpots.push({ x, z, rot: Math.atan2(-rx, -rz) });
  }
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.2, 11, 6);
  poleGeo.translate(0, 5.5, 0);
  const poleMat = withDriveFog(new THREE.MeshStandardMaterial({ color: '#2a2f2d', metalness: 0.7, roughness: 0.45 }), fogU);
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, poleSpots.length);
  const headGeo = new THREE.BoxGeometry(1.6, 0.22, 0.6);
  headGeo.translate(0, 11, -0.55);
  const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1) });
  const heads = new THREE.InstancedMesh(headGeo, headMat, poleSpots.length);
  poleSpots.forEach((p, i) => {
    q.setFromAxisAngle(up, p.rot);
    m4.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(1, 1, 1));
    poles.setMatrixAt(i, m4);
    heads.setMatrixAt(i, m4);
  });
  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  poles.computeBoundingSphere();
  heads.computeBoundingSphere();
  group.add(poles, heads);
  disposables.push(poleGeo, poleMat, headGeo, headMat);

  // ---- braking boards before the slow corners ----
  const boardTex = boardTexture();
  const boardMat = withDriveFog(new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.6, metalness: 0 }), fogU);
  const boardGeos: THREE.BufferGeometry[] = [];
  disposables.push(boardTex, boardMat);
  const slowCorners = track.corners.filter((c) => c.radius <= 80);
  for (const c of slowCorners) {
    const entry = c.apexS - 32;
    [150, 100, 50].forEach((dist, k) => {
      const s = (entry - dist + track.length) % track.length;
      const i = Math.floor(s / track.spacing) % track.count;
      // outside of the approach: opposite to the corner direction
      const side = c.direction === 'right' ? -1 : 1;
      const rx = -track.tz[i] * side;
      const rz = track.tx[i] * side;
      const off = track.halfWidth + track.kerbWidth + 2.2;
      const g = new THREE.PlaneGeometry(1.5, 1.5);
      const uvs = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let v = 0; v < uvs.count; v++) uvs.setX(v, (uvs.getX(v) + k) / 3);
      boardGeos.push(g);
      const board = new THREE.Mesh(g, boardMat);
      board.position.set(track.px[i] + rx * off, 1.55, track.pz[i] + rz * off);
      // face oncoming traffic (plane normal = −forward)
      board.rotation.y = Math.atan2(-track.tx[i], -track.tz[i]);
      group.add(board);
      const postGeo = new THREE.BoxGeometry(0.08, 1.0, 0.08);
      boardGeos.push(postGeo);
      const post = new THREE.Mesh(postGeo, poleMat);
      post.position.set(board.position.x, 0.5, board.position.z);
      group.add(post);
    });
  }
  disposables.push({ dispose: () => boardGeos.forEach((g) => g.dispose()) });

  // ---- start / finish gantry with the five start lights ----
  const steel = withDriveFog(new THREE.MeshStandardMaterial({ color: '#151a18', metalness: 0.75, roughness: 0.38 }), fogU);
  const champagne = withDriveFog(new THREE.MeshStandardMaterial({ color: '#c8a96e', metalness: 0.85, roughness: 0.3 }), fogU);
  disposables.push(steel, champagne);
  const gantryGeos: THREE.BufferGeometry[] = [];
  disposables.push({ dispose: () => gantryGeos.forEach((g) => g.dispose()) });
  const addBox = (w: number, h: number, d: number, mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    gantryGeos.push(g);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const gantry = new THREE.Group();
  const span = track.halfWidth * 2 + 6;
  addBox(0.5, 7.4, 0.5, steel, gantry, -span / 2, 3.7, 0);
  addBox(0.5, 7.4, 0.5, steel, gantry, span / 2, 3.7, 0);
  addBox(span + 0.6, 1.25, 0.7, steel, gantry, 0, 7.2, 0);
  addBox(span + 0.6, 0.08, 0.72, champagne, gantry, 0, 7.86, 0);
  const lightMats: THREE.MeshBasicMaterial[] = [];
  const lampGeo = new THREE.CircleGeometry(0.26, 20);
  gantryGeos.push(lampGeo);
  for (let col = 0; col < 5; col++) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.005, 0.005) });
    lightMats.push(mat);
    disposables.push(mat);
    for (let row = 0; row < 2; row++) {
      const lamp = new THREE.Mesh(lampGeo, mat);
      lamp.position.set((col - 2) * 0.95, 7.0 + row * 0.62 - 0.31, 0.37);
      gantry.add(lamp);
    }
  }
  {
    const p = track;
    const i = 3; // 6 m past the line
    gantry.position.set(p.px[i], 0, p.pz[i]);
    gantry.rotation.y = Math.atan2(-p.tx[i], -p.tz[i]); // local +Z (lamp side) faces the grid
  }
  group.add(gantry);

  // A second, lighter gantry over the back straight: something to flash under at full speed.
  {
    const s = track.corners.find((c) => c.name === 'DBR Chicane')?.apexS ?? track.length * 0.45;
    const i = Math.floor(((s - 150 + track.length) % track.length) / track.spacing);
    const bridge = new THREE.Group();
    addBox(0.4, 6.4, 0.4, steel, bridge, -span / 2, 3.2, 0);
    addBox(0.4, 6.4, 0.4, steel, bridge, span / 2, 3.2, 0);
    addBox(span + 0.4, 0.9, 1.6, steel, bridge, 0, 6.6, 0);
    const strip = addBox(span - 1, 0.1, 0.12, headMat, bridge, 0, 6.12, 0.82);
    strip.renderOrder = 1;
    bridge.position.set(track.px[i], 0, track.pz[i]);
    bridge.rotation.y = Math.atan2(-track.tx[i], -track.tz[i]);
    group.add(bridge);
  }

  // ---- pit building (inside of the main straight) & grandstand (outside) ----
  {
    const facade = facadeTexture();
    disposables.push(facade);
    const len = 230;
    facade.repeat.set(len / 64, 1);
    const facadeMat = withDriveFog(new THREE.MeshStandardMaterial({ map: facade, roughness: 0.7, metalness: 0.2 }), fogU);
    const roofMat = withDriveFog(new THREE.MeshStandardMaterial({ color: '#0e1211', roughness: 0.5, metalness: 0.6 }), fogU);
    disposables.push(facadeMat, roofMat);
    const i0 = Math.floor(((track.length - 120) % track.length) / track.spacing);
    const off = track.barrierRight[i0] + 9;
    const rx = -track.tz[i0];
    const rz = track.tx[i0];
    const pit = new THREE.Group();
    const bodyGeo = new THREE.BoxGeometry(12, 7, len);
    gantryGeos.push(bodyGeo);
    // only the track-facing side gets the garage facade
    const pitMats = [roofMat, facadeMat, roofMat, roofMat, roofMat, roofMat];
    const body = new THREE.Mesh(bodyGeo, pitMats);
    body.position.set(6, 3.5, 0);
    pit.add(body);
    addBox(15, 0.35, len + 4, roofMat, pit, 4.5, 7.2, 0);
    const glow = addBox(0.15, 0.12, len - 6, headMat, pit, -2.95, 6.85, 0);
    glow.renderOrder = 1;
    pit.position.set(track.px[i0] + rx * off, 0, track.pz[i0] + rz * off);
    pit.rotation.y = Math.atan2(-track.tx[i0], -track.tz[i0]);
    group.add(pit);

    const standMat = withDriveFog(new THREE.MeshStandardMaterial({ color: '#00482b', roughness: 0.65, metalness: 0.1 }), fogU);
    const standFrame = withDriveFog(new THREE.MeshStandardMaterial({ color: '#202624', roughness: 0.55, metalness: 0.5 }), fogU);
    disposables.push(standMat, standFrame);
    const j0 = Math.floor(((track.length - 60) % track.length) / track.spacing);
    const offL = track.barrierLeft[j0] + 7;
    const lx = track.tz[j0];
    const lz = -track.tx[j0];
    const stand = new THREE.Group();
    const standLen = 150;
    for (let t = 0; t < 8; t++) addBox(1.6, 0.9 + t * 0.9, standLen, t % 2 ? standMat : standFrame, stand, -t * 1.6, (0.9 + t * 0.9) / 2, 0);
    addBox(0.4, 12, standLen, standFrame, stand, -13.2, 6, 0);
    addBox(16, 0.3, standLen + 4, roofMat, stand, -6, 12.2, 0);
    addBox(16, 0.06, standLen + 4, champagne, stand, -6, 12.4, 0);
    stand.position.set(track.px[j0] + lx * offL, 0, track.pz[j0] + lz * offL);
    stand.rotation.y = Math.atan2(-track.tx[j0], -track.tz[j0]);
    group.add(stand);
  }

  // ---- runtime ----
  let night = 0;
  const setStartLights = (lit: number) => {
    lightMats.forEach((m, i) => {
      if (i < lit) m.color.setRGB(9, 0.35, 0.2);
      else m.color.setRGB(0.06, 0.005, 0.005);
    });
  };

  const fogDay = new THREE.Color(0.34, 0.28, 0.32);
  const fogNight = new THREE.Color(0.025, 0.033, 0.05);
  const applyNight = () => {
    shared.uNight.value = night;
    shared.uFogColor.value.copy(fogDay).lerp(fogNight, night);
    shared.uSunColor.value.setRGB(1.55, 1.12, 0.78).multiplyScalar(1 - 0.88 * night);
    shared.uSkyAmb.value.setRGB(0.42, 0.45, 0.6).lerp(new THREE.Color(0.035, 0.045, 0.075), night);
    shared.uGroundAmb.value.setRGB(0.14, 0.13, 0.11).lerp(new THREE.Color(0.012, 0.012, 0.014), night);
    shared.uFogFar.value = THREE.MathUtils.lerp(2100, 800, night);
    // lamp heads: dim by day, blooming at night
    headMat.color.setRGB(1, 1, 1).multiplyScalar(THREE.MathUtils.lerp(1.4, 9, night));
  };
  applyNight();

  return {
    group,
    sunDirScene,
    sunDirTrack,
    setCarPose: (x: number, z: number, heading: number) => {
      // world → scene: R_y(−ψ) · (p − car)
      group.rotation.set(0, -heading, 0);
      const c = Math.cos(-heading);
      const s = Math.sin(-heading);
      group.position.set(-(x * c + z * s), 0, -(-x * s + z * c));
      sky.position.set(x, 0, z);
      // sun direction in scene space follows the world rotation
      sunDirScene.copy(sunDirTrack).applyAxisAngle(up, -heading);
    },
    setNight: (n: number) => {
      night = n;
      applyNight();
    },
    setStartLights,
    setContactShadow: (texture, rect) => {
      shared.uShadowTex.value = texture;
      shared.uShadowRect.value.copy(rect);
    },
    setLamps: (halfSpacing, noseZ, tailZ) => {
      shared.uLamps.value.set(halfSpacing, noseZ, tailZ);
    },
    update: () => {
      // static world – reserved for animated trackside dressing
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
      trees.dispose();
      poles.dispose();
      heads.dispose();
    },
  };
}
