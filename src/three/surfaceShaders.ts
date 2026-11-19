import * as THREE from 'three';

/* ------------------------------------------------------------------------------------------------
 * Crease-angle normal smoothing
 *
 * Several of the sourced GLBs (notably Valhalla) ship as "triangle soup" with per-face normals,
 * so every polygon reflects the studio as a separate facet – the crumpled-foil look. Here normals
 * are rebuilt by averaging the area-weighted face normals that meet at a welded position, but only
 * across edges flatter than `creaseDeg`, so genuine character lines stay razor sharp.
 * ---------------------------------------------------------------------------------------------- */

const smoothedCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

export function smoothCreasedNormals(source: THREE.BufferGeometry, creaseDeg = 50): THREE.BufferGeometry {
  const cached = smoothedCache.get(source);
  if (cached) return cached;
  if (source.groups.length > 0 || !source.getAttribute('position')) return source;

  const geo = source.index ? source.toNonIndexed() : source.clone();
  const pos = geo.getAttribute('position');
  const triCount = pos.count / 3;
  const creaseCos = Math.cos(THREE.MathUtils.degToRad(creaseDeg));

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const faceN = new Float32Array(triCount * 3); // area-weighted
  const faceU = new Float32Array(triCount * 3); // unit
  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    const n = c.sub(b).cross(a.sub(b)); // (c-b) × (a-b)
    faceN[t * 3] = n.x;
    faceN[t * 3 + 1] = n.y;
    faceN[t * 3 + 2] = n.z;
    const len = n.length() || 1;
    faceU[t * 3] = n.x / len;
    faceU[t * 3 + 1] = n.y / len;
    faceU[t * 3 + 2] = n.z / len;
  }

  geo.computeBoundingBox();
  const diag = geo.boundingBox!.getSize(new THREE.Vector3()).length() || 1;
  const q = 1 / (diag * 1e-5);
  const buckets = new Map<string, number[]>();
  const keys: string[] = new Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    a.fromBufferAttribute(pos, i);
    const k = `${Math.round(a.x * q)},${Math.round(a.y * q)},${Math.round(a.z * q)}`;
    keys[i] = k;
    let list = buckets.get(k);
    if (!list) {
      list = [];
      buckets.set(k, list);
    }
    list.push((i / 3) | 0);
  }

  const normals = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = (i / 3) | 0;
    const ux = faceU[t * 3];
    const uy = faceU[t * 3 + 1];
    const uz = faceU[t * 3 + 2];
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (const o of buckets.get(keys[i])!) {
      const d = ux * faceU[o * 3] + uy * faceU[o * 3 + 1] + uz * faceU[o * 3 + 2];
      if (d >= creaseCos) {
        nx += faceN[o * 3];
        ny += faceN[o * 3 + 1];
        nz += faceN[o * 3 + 2];
      }
    }
    const len = Math.hypot(nx, ny, nz) || 1;
    normals[i * 3] = nx / len;
    normals[i * 3 + 1] = ny / len;
    normals[i * 3 + 2] = nz / len;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.computeBoundingSphere();
  smoothedCache.set(source, geo);
  return geo;
}

/* ------------------------------------------------------------------------------------------------
 * Shared GLSL: object-space position (in metres) + normal, independent of each GLB's UV layout
 * ---------------------------------------------------------------------------------------------- */

const HASH_GLSL = /* glsl */ `
  vec3 atelierHash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yxx) * p3.zyx);
  }
`;

function injectObjectSpace(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      '#include <common>\nvarying vec3 vAtelierObjPos;\nvarying vec3 vAtelierObjNormal;'
    )
    .replace(
      '#include <begin_vertex>',
      [
        '#include <begin_vertex>',
        // Uniform world scale of this mesh → object-space coords in metres (stable on moving doors).
        'vAtelierObjPos = transformed * length(modelMatrix[0].xyz);',
        'vAtelierObjNormal = normalize(objectNormal);',
      ].join('\n')
    );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    `#include <common>\nvarying vec3 vAtelierObjPos;\nvarying vec3 vAtelierObjNormal;\n${HASH_GLSL}`
  );
}

/* ------------------------------------------------------------------------------------------------
 * Metallic flake paint
 *
 * Each ~1 mm cell tilts the *base* layer normal randomly, so flakes catch the softboxes as sparkle
 * under the mirror-smooth clearcoat (three.js keeps the clearcoat on the unperturbed normal).
 * When a flake shrinks below a pixel the tilt fades out and is replaced by equivalent roughness –
 * a cheap LEAN-style filter that keeps distant paint from shimmering.
 * ---------------------------------------------------------------------------------------------- */

export interface FlakeUniforms {
  uFlakeDensity: { value: number };
  uFlakeTilt: { value: number };
  uFlakeHaze: { value: number };
}

export function installMetallicFlake(
  material: THREE.MeshPhysicalMaterial,
  density = 900,
  tilt = 0.32,
  haze = 0.12
): FlakeUniforms {
  const uniforms: FlakeUniforms = {
    uFlakeDensity: { value: density },
    uFlakeTilt: { value: tilt },
    uFlakeHaze: { value: haze },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    injectObjectSpace(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uFlakeDensity;\nuniform float uFlakeTilt;\nuniform float uFlakeHaze;'
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        {
          vec3 fp = vAtelierObjPos * uFlakeDensity;
          vec3 rnd = atelierHash33(floor(fp)) * 2.0 - 1.0;
          // Flakes only resolve once a cell spans ~3+ pixels; below that they would alias into
          // per-pixel speckle, so their spread is handed over to the roughness term instead.
          float footprint = length(fwidth(fp));
          float resolve = 1.0 - smoothstep(0.14, 0.42, footprint);
          normal = normalize(normal + rnd * uFlakeTilt * resolve);
          roughnessFactor = clamp(roughnessFactor + uFlakeHaze * (1.0 - resolve), 0.0, 1.0);
        }`
      );
  };
  material.customProgramCacheKey = () => 'atelier-flake';
  return uniforms;
}

/* ------------------------------------------------------------------------------------------------
 * Triplanar carbon weave
 *
 * The sourced models have arbitrary UV scales, which turned the 2×2 twill into a coarse
 * checkerboard. Projecting the weave in object space gives a consistent ~6 mm tow pitch on every
 * car, and the weave's alpha channel modulates roughness so tows flash individually.
 * ---------------------------------------------------------------------------------------------- */

export function installTriplanarCarbon(material: THREE.MeshPhysicalMaterial, tilesPerMeter = 9) {
  const uniforms = { uWeaveScale: { value: tilesPerMeter } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    injectObjectSpace(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWeaveScale;')
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        #ifdef USE_MAP
          vec3 tpW = pow(abs(vAtelierObjNormal), vec3(4.0));
          tpW /= max(dot(tpW, vec3(1.0)), 1e-4);
          vec3 tp = vAtelierObjPos * uWeaveScale;
          vec4 weave = texture2D(map, tp.zy) * tpW.x + texture2D(map, tp.xz) * tpW.y + texture2D(map, tp.xy) * tpW.z;
          diffuseColor *= vec4(weave.rgb, 1.0);
          float atelierTow = weave.a;
        #else
          float atelierTow = 0.5;
        #endif`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * mix(0.86, 1.16, atelierTow), 0.04, 1.0);`
      );
  };
  material.customProgramCacheKey = () => 'atelier-carbon';
}

/* ------------------------------------------------------------------------------------------------
 * X-ray coachwork
 *
 * One shared shader for every body panel in X-ray mode: surfaces facing the camera all but vanish,
 * silhouettes and panel edges glow (fresnel), and a scan band sweeps nose-to-tail. Additive and
 * depth-write free, so the solid running gear, cabin and engine read through it like a cutaway.
 * ---------------------------------------------------------------------------------------------- */

export function createXrayMaterial(carLength: number): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    name: 'AtelierXray',
    uniforms: {
      uTime: { value: 0 },
      uLength: { value: carLength },
      uFill: { value: new THREE.Color('#5fa9e6') },
      uEdge: { value: new THREE.Color('#d9f1ff') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vXrayNormal;
      varying vec3 vXrayView;
      varying vec3 vXrayWorld;
      void main() {
        // Same op order as three's project_vertex, so depth matches the X-ray depth pre-pass.
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vXrayNormal = normalize(normalMatrix * normal);
        vXrayView = -mvPosition.xyz;
        vXrayWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * mvPosition;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uLength;
      uniform vec3 uFill;
      uniform vec3 uEdge;
      varying vec3 vXrayNormal;
      varying vec3 vXrayView;
      varying vec3 vXrayWorld;
      void main() {
        float facing = abs(dot(normalize(vXrayNormal), normalize(vXrayView)));
        float rim = pow(1.0 - facing, 2.1);
        float span = uLength + 1.6;
        float scanZ = -0.5 * span + mod(uTime * 1.25, span);
        float band = exp(-pow((vXrayWorld.z - scanZ) / 0.09, 2.0));
        // A depth pre-pass leaves only the front-most shell layer, so it can carry the full glow.
        vec3 colour = uFill * 0.035 + uEdge * (0.62 * rim) + uEdge * band * (0.12 + 0.45 * rim);
        gl_FragColor = vec4(colour, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  // Additive blending is order-independent, so skip three's back-then-front double draw of
  // transparent double-sided meshes: it halves X-ray draw calls on the 300-mesh Valhalla.
  material.forceSinglePass = true;
  return material;
}
