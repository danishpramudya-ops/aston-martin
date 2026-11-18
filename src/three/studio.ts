import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';

/* ------------------------------------------------------------------------------------------------
 * Quality tiers
 * ---------------------------------------------------------------------------------------------- */

export interface StudioQuality {
  tier: 'high' | 'balanced';
  maxPixelRatio: number;
  msaa: number;
  mirror: boolean;
  mirrorScale: number;
  bloom: boolean;
  envSize: number;
}

export function detectStudioQuality(): StudioQuality {
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  const shortSide = Math.min(window.screen?.width || 1920, window.screen?.height || 1080);
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency || 8;
  const constrained = (coarse && shortSide < 900) || memory <= 4 || cores <= 4;
  return constrained
    ? { tier: 'balanced', maxPixelRatio: 1.5, msaa: 4, mirror: true, mirrorScale: 0.35, bloom: true, envSize: 256 }
    : { tier: 'high', maxPixelRatio: 2, msaa: 4, mirror: true, mirrorScale: 0.5, bloom: true, envSize: 512 };
}

/* ------------------------------------------------------------------------------------------------
 * Procedural automotive light-studio environment
 * ---------------------------------------------------------------------------------------------- */

const SOFTBOX_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Softboxes fall off toward their edges like real diffusion fabric, which is what turns a hard
// rectangle reflection into the soft-edged "studio ribbon" seen on photographed coachwork.
const SOFTBOX_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform vec2 uFeather;
  varying vec2 vUv;
  void main() {
    vec2 e = min(vUv, 1.0 - vUv);
    float m = smoothstep(0.0, uFeather.x, e.x) * smoothstep(0.0, uFeather.y, e.y);
    gl_FragColor = vec4(uColor * uIntensity * m, 1.0);
  }
`;

function softbox(
  w: number,
  h: number,
  intensity: number,
  color: THREE.ColorRepresentation = '#ffffff',
  feather: [number, number] = [0.12, 0.12]
): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
      uFeather: { value: new THREE.Vector2(feather[0], feather[1]) },
    },
    vertexShader: SOFTBOX_VERT,
    fragmentShader: SOFTBOX_FRAG,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

function aimAt(mesh: THREE.Object3D, x: number, y: number, z: number, target = new THREE.Vector3(0, 0.55, 0)) {
  mesh.position.set(x, y, z);
  mesh.lookAt(target);
}

/**
 * A dark cyclorama lit by large feathered softboxes: overhead key, long shoulder strips that run
 * the length of the car (the signature highlight line along an Aston's flanks), nose/tail strips,
 * low fills, and faint champagne/cool accents echoing the brand palette.
 */
export function createStudioEnvironment(renderer: THREE.WebGLRenderer, size = 512): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(40, 64, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 floorC = vec3(0.010, 0.011, 0.011);
          vec3 horizon = vec3(0.060, 0.058, 0.054);
          vec3 ceiling = vec3(0.018, 0.019, 0.021);
          vec3 c = h < 0.0
            ? mix(horizon * 0.45, floorC, smoothstep(0.0, -0.28, h))
            : mix(horizon, ceiling, smoothstep(0.0, 0.5, h));
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    })
  );
  env.add(shell);

  const add = (m: THREE.Mesh) => {
    env.add(m);
    return m;
  };

  // Overhead key: broad, soft – shapes the roof, bonnet and deck.
  const key = add(softbox(7.5, 3.4, 3.2, '#ffffff', [0.22, 0.3]));
  key.position.set(0, 6.2, 0.2);
  key.rotation.x = Math.PI / 2;

  // Shoulder strips running nose-to-tail; tilted toward the car for crisp flank highlights.
  [-1, 1].forEach((s) => {
    const strip = add(softbox(13, 0.55, 9.0, '#ffffff', [0.06, 0.35]));
    aimAt(strip, s * 4.6, 3.6, 0, new THREE.Vector3(0, 0.4, 0));
    strip.rotateZ(Math.PI / 2);
  });

  // Nose & tail horizontals: draw clean lines across grille, headlamps and the light blade.
  const nose = add(softbox(5.2, 0.42, 4.2, '#ffffff', [0.1, 0.35]));
  aimAt(nose, 0, 2.4, -7.5);
  const tail = add(softbox(5.2, 0.42, 3.4, '#fff7ee', [0.1, 0.35]));
  aimAt(tail, 0, 2.2, 7.5);

  // Large low fills keep the rocker panels and wheel faces from collapsing to black.
  [-1, 1].forEach((s) => {
    const fill = add(softbox(11, 1.6, 0.55, '#dfe6ea', [0.3, 0.4]));
    aimAt(fill, s * 8, 0.9, 0.5, new THREE.Vector3(0, 0.45, 0));
  });

  // Brand accents: warm champagne behind-left, cool steel front-right (subtle colour in reflections).
  const warm = add(softbox(2.6, 3.4, 1.7, '#e9c98f', [0.35, 0.35]));
  aimAt(warm, -6.2, 1.9, 4.6);
  const cool = add(softbox(2.4, 3.0, 1.1, '#bcd3ea', [0.35, 0.35]));
  aimAt(cool, 6.4, 2.0, -4.2);

  // Front-left disc softbox: the catch-light the hero 3/4 camera sees.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.1, 48),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.4), side: THREE.DoubleSide })
  );
  aimAt(disc, -5.6, 2.8, -5.8);
  env.add(disc);

  const rt = pmrem.fromScene(env, 0.015, 0.1, 100, { size });
  pmrem.dispose();
  env.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });
  return rt.texture;
}

/* ------------------------------------------------------------------------------------------------
 * Showroom floor: blurred mirror reflection + baked contact shadow + light pools
 * ---------------------------------------------------------------------------------------------- */

const FLOOR_VERT = /* glsl */ `
  uniform mat4 textureMatrix;
  varying vec4 vMirrorUv;
  varying vec3 vWorld;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vMirrorUv = textureMatrix * vec4(position, 1.0);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
    #include <logdepthbuf_vertex>
  }
`;

const FLOOR_FRAG = /* glsl */ `
  uniform vec3 color;
  uniform sampler2D tDiffuse;
  uniform sampler2D tShadow;
  uniform vec4 uShadowRect;
  uniform float uShadowOpacity;
  uniform vec3 uBase;
  uniform vec3 uVoid;
  uniform float uRadius;
  uniform float uReflect;
  uniform float uNight;
  uniform vec3 uLamps;   // x: lamp half-spacing, y: nose z, z: tail z
  varying vec4 vMirrorUv;
  varying vec3 vWorld;
  #include <common>
  #include <logdepthbuf_pars_fragment>

  float beamPool(vec2 p, vec2 lamp) {
    float f = lamp.y - p.y;                 // metres ahead of the lamp (nose faces −Z)
    float l = p.x - lamp.x;
    float spread = 0.12 + max(f, 0.0) * 0.21;
    float lateral = exp(-(l * l) / (spread * spread));
    float along = smoothstep(0.1, 0.9, f) * exp(-max(f, 0.0) * 0.42);
    return lateral * along;
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec3 V = normalize(cameraPosition - vWorld);
    float ndv = clamp(V.y, 0.0, 1.0);
    float fresnel = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
    float r = length(vWorld.xz);

    // Overhead spot pool: the car sits in a soft island of light, so its contact shadow reads.
    float pool = 1.0 - smoothstep(0.0, 4.6, length(vWorld.xz * vec2(1.25, 0.82)));
    vec3 col = uBase * (1.0 + pool * pool * 2.4);

    #ifdef USE_MIRROR
      vec2 muv = vMirrorUv.xy / vMirrorUv.w;
      // Polished resin floor: crisp where the tyres touch down, increasingly diffuse further out.
      float lod = clamp(0.6 + r * 1.25, 0.0, 6.0);
      vec3 refl = textureLod(tDiffuse, muv, lod).rgb;
      float reach = 1.0 - smoothstep(1.4, 6.8, r);
      col += refl * mix(0.14, 0.62, fresnel) * uReflect * reach;
    #endif

    vec2 suv = (vWorld.xz - uShadowRect.xy) / uShadowRect.zw;
    float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
    float shadow = texture2D(tShadow, suv).a * inside;
    col *= 1.0 - clamp(shadow * uShadowOpacity, 0.0, 0.97);

    // "Lights" mode: headlamp throw ahead of the nose, red wash behind the light blade.
    float pools = beamPool(vWorld.xz, vec2(-uLamps.x, uLamps.y)) + beamPool(vWorld.xz, vec2(uLamps.x, uLamps.y));
    col += vec3(1.0, 0.96, 0.9) * pools * uNight * 0.75;
    float behind = max(vWorld.z - uLamps.z, 0.0);
    float tailGlow = smoothstep(uLamps.z - 0.25, uLamps.z + 0.15, vWorld.z) * exp(-behind * behind * 5.0) * exp(-vWorld.x * vWorld.x * 2.2);
    col += vec3(1.0, 0.05, 0.07) * tailGlow * uNight * 0.11;

    // Dissolve into the backdrop instead of ending on a visible horizon edge.
    float edge = smoothstep(uRadius * 0.22, uRadius * 0.92, r);
    gl_FragColor = vec4(col, 1.0 - edge);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function makeFloorUniforms(voidColor: THREE.Color, radius: number) {
  return {
    color: { value: new THREE.Color(0x7f7f7f) },
    tDiffuse: { value: null as THREE.Texture | null },
    textureMatrix: { value: new THREE.Matrix4() },
    tShadow: { value: null as THREE.Texture | null },
    uShadowRect: { value: new THREE.Vector4(-2, -3, 4, 6) },
    uShadowOpacity: { value: 0.92 },
    uBase: { value: new THREE.Color('#0d100f') },
    uVoid: { value: voidColor.clone() },
    uRadius: { value: radius },
    uReflect: { value: 1.0 },
    uNight: { value: 0 },
    uLamps: { value: new THREE.Vector3(0.68, -2.2, 2.2) },
  };
}

class ContactShadow {
  readonly target: THREE.WebGLRenderTarget;
  private readonly blurTarget: THREE.WebGLRenderTarget;
  private readonly camera: THREE.OrthographicCamera;
  private readonly depthMaterial: THREE.MeshDepthMaterial;
  private readonly blurH: THREE.ShaderMaterial;
  private readonly blurV: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  readonly rect = new THREE.Vector4(-2, -3, 4, 6);

  constructor(resolution = 512) {
    const opts = { type: THREE.HalfFloatType, depthBuffer: false } as const;
    this.target = new THREE.WebGLRenderTarget(resolution, resolution, { ...opts, depthBuffer: true });
    this.target.texture.generateMipmaps = false;
    this.blurTarget = new THREE.WebGLRenderTarget(resolution, resolution, opts);
    this.blurTarget.texture.generateMipmaps = false;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1.6);
    this.camera.rotation.x = Math.PI / 2; // look straight up from the floor

    const darkness = { value: 1.35 };
    this.depthMaterial = new THREE.MeshDepthMaterial();
    this.depthMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.darkness = darkness;
      shader.fragmentShader = `uniform float darkness;\n${shader.fragmentShader.replace(
        'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
        'gl_FragColor = vec4( vec3( 0.0 ), pow( 1.0 - fragCoordZ, 1.6 ) * darkness );'
      )}`;
    };
    this.depthMaterial.depthTest = false;
    this.depthMaterial.depthWrite = false;
    this.depthMaterial.side = THREE.DoubleSide;

    this.blurH = new THREE.ShaderMaterial({
      ...HorizontalBlurShader,
      uniforms: THREE.UniformsUtils.clone(HorizontalBlurShader.uniforms),
    });
    this.blurV = new THREE.ShaderMaterial({
      ...VerticalBlurShader,
      uniforms: THREE.UniformsUtils.clone(VerticalBlurShader.uniforms),
    });
    this.blurH.depthTest = false;
    this.blurV.depthTest = false;
    this.quad = new FullScreenQuad(this.blurH);
  }

  setFootprint(lengthM: number, widthM: number) {
    const w = widthM + 1.5;
    const l = lengthM + 1.5;
    this.camera.left = -w / 2;
    this.camera.right = w / 2;
    this.camera.top = l / 2;
    this.camera.bottom = -l / 2;
    this.camera.updateProjectionMatrix();
    this.rect.set(-w / 2, -l / 2, w, l);
  }

  private blur(renderer: THREE.WebGLRenderer, amount: number) {
    this.quad.material = this.blurH;
    this.blurH.uniforms.tDiffuse.value = this.target.texture;
    this.blurH.uniforms.h.value = amount / 256;
    renderer.setRenderTarget(this.blurTarget);
    this.quad.render(renderer);

    this.quad.material = this.blurV;
    this.blurV.uniforms.tDiffuse.value = this.blurTarget.texture;
    this.blurV.uniforms.v.value = amount / 256;
    renderer.setRenderTarget(this.target);
    this.quad.render(renderer);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, hide: THREE.Object3D[]) {
    const prevTarget = renderer.getRenderTarget();
    const prevBackground = scene.background;
    const prevOverride = scene.overrideMaterial;
    const prevClearAlpha = renderer.getClearAlpha();
    const prevVisible = hide.map((o) => o.visible);

    hide.forEach((o) => (o.visible = false));
    scene.background = null;
    scene.overrideMaterial = this.depthMaterial;
    renderer.setClearAlpha(0);

    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, this.camera);

    scene.overrideMaterial = prevOverride;
    scene.background = prevBackground;
    hide.forEach((o, i) => (o.visible = prevVisible[i]));

    this.blur(renderer, 2.6);
    this.blur(renderer, 1.0);

    renderer.setClearAlpha(prevClearAlpha);
    renderer.setRenderTarget(prevTarget);
  }

  dispose() {
    this.target.dispose();
    this.blurTarget.dispose();
    this.depthMaterial.dispose();
    this.blurH.dispose();
    this.blurV.dispose();
    this.quad.dispose();
  }
}

/* ------------------------------------------------------------------------------------------------
 * Final grade: vignette + temporal film grain (also dithers dark-gradient banding) + fade
 * ---------------------------------------------------------------------------------------------- */

const FinishShader = {
  name: 'AtelierFinish',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uFade: { value: 1 },
    uVignette: { value: 0.9 },
    uGrain: { value: 0.022 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uFade;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = vUv - 0.5;
      float vig = smoothstep(0.95, 0.18, length(q * vec2(1.0, 0.82)) * (0.7 + 0.5 * uVignette));
      c.rgb *= mix(1.0, vig, uVignette);
      float g = hash(gl_FragCoord.xy + fract(uTime * 7.31) * 517.0) - 0.5;
      c.rgb += g * uGrain;
      c.rgb *= 1.0 - uFade;
      gl_FragColor = c;
    }
  `,
};

/* ------------------------------------------------------------------------------------------------
 * Studio: renderer + environment + floor + post pipeline, shared by the Hero and Observatory
 * ---------------------------------------------------------------------------------------------- */

export interface StudioOptions {
  background?: THREE.ColorRepresentation;
  floorRadius?: number;
  exposure?: number;
  quality?: StudioQuality;
  /** Day-mode bloom strength (night mode scales it up). */
  bloomStrength?: number;
}

/** Soft radial glow behind the car (mirrors the viewport's CSS radial gradient) – dithered by grain. */
function createBackdropTexture(voidColor: THREE.Color): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 288;
  const ctx = c.getContext('2d')!;
  const hex = `#${voidColor.getHexString()}`;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, c.width, c.height);
  const g = ctx.createRadialGradient(256, 150, 8, 256, 150, 300);
  g.addColorStop(0, '#18201c');
  g.addColorStop(0.45, '#0e1311');
  g.addColorStop(1, hex);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Studio {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly quality: StudioQuality;
  /** Objects hidden while baking the contact shadow (floor, rings, FX lines…). */
  readonly props: THREE.Object3D[] = [];

  private readonly envTexture: THREE.Texture;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly kickerLight: THREE.DirectionalLight;
  private readonly backdrop: THREE.CanvasTexture;
  private readonly bloomStrength: number;
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly bloom: UnrealBloomPass | null;
  private readonly finish: ShaderPass;
  private readonly floor: THREE.Mesh;
  private readonly floorUniforms: ReturnType<typeof makeFloorUniforms>;
  private readonly contact: ContactShadow;
  private readonly placeholderCamera = new THREE.PerspectiveCamera();

  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private time = 0;
  private shadowFrames = 2;
  private nightTarget = 0;
  private night = 0;
  private fadeTarget = 0;
  private fadeSpeed = 1.6;
  private frameTimes: number[] = [];

  constructor(container: HTMLElement, options: StudioOptions = {}) {
    this.quality = options.quality ?? detectStudioQuality();
    const voidColor = new THREE.Color(options.background ?? '#070908');

    this.renderer = new THREE.WebGLRenderer({
      antialias: false, // MSAA happens in the composer's HDR target
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
    });
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = options.exposure ?? 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(voidColor, 1);
    container.innerHTML = '';
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';

    this.backdrop = createBackdropTexture(voidColor);
    this.scene.background = this.backdrop;
    this.bloomStrength = options.bloomStrength ?? 0.26;
    this.envTexture = createStudioEnvironment(this.renderer, this.quality.envSize);
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = 1.0;

    // A single soft key adds directional modelling on top of the image-based light.
    this.keyLight = new THREE.DirectionalLight('#fff8ef', 1.1);
    this.keyLight.position.set(-3.5, 7, -2.5);
    this.scene.add(this.keyLight);
    this.kickerLight = new THREE.DirectionalLight('#dfe9ff', 0.45);
    this.kickerLight.position.set(4.5, 2.5, 4.5);
    this.scene.add(this.kickerLight);

    const radius = options.floorRadius ?? 14;
    this.floorUniforms = makeFloorUniforms(voidColor, radius);
    this.contact = new ContactShadow(512);

    const floorGeo = new THREE.CircleGeometry(radius, 128);
    if (this.quality.mirror) {
      const reflector = new Reflector(floorGeo, {
        textureWidth: 512,
        textureHeight: 512,
        clipBias: 0.002,
        multisample: 0,
        shader: {
          name: 'ShowroomFloor',
          uniforms: this.floorUniforms,
          vertexShader: FLOOR_VERT,
          fragmentShader: FLOOR_FRAG,
        },
      });
      const mirrorTex = reflector.getRenderTarget().texture;
      mirrorTex.generateMipmaps = true;
      mirrorTex.minFilter = THREE.LinearMipmapLinearFilter;
      const mat = reflector.material as THREE.ShaderMaterial;
      mat.defines = { USE_MIRROR: '' };
      // Reflector cloned the uniforms – point ours at the live copies it actually uses.
      Object.assign(this.floorUniforms, mat.uniforms);
      this.floor = reflector;
    } else {
      this.floor = new THREE.Mesh(
        floorGeo,
        new THREE.ShaderMaterial({
          uniforms: this.floorUniforms,
          vertexShader: FLOOR_VERT,
          fragmentShader: FLOOR_FRAG,
        })
      );
    }
    // Assigned after construction: render-target textures can't go through cloneUniforms().
    this.floorUniforms.tShadow.value = this.contact.target.texture;
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.renderOrder = -1;
    (this.floor.material as THREE.ShaderMaterial).transparent = true;
    this.scene.add(this.floor);
    this.props.push(this.floor);

    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: this.quality.msaa,
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.renderPass = new RenderPass(this.scene, this.placeholderCamera);
    this.composer.addPass(this.renderPass);
    // Threshold sits above paint highlights (linear HDR) so only lamps and true glints bloom.
    this.bloom = this.quality.bloom
      ? new UnrealBloomPass(new THREE.Vector2(1, 1), this.bloomStrength, 0.55, 1.1)
      : null;
    if (this.bloom) {
      // Grazing clearcoat can reflect a softbox at 20×+ white; unclamped, one such pixel blooms
      // into a floating haze. Cap bloom *input* luminance (hue preserved) – lamps still glow.
      const hp = this.bloom.materialHighPassFilter;
      hp.fragmentShader = hp.fragmentShader.replace(
        'vec4 texel = texture2D( tDiffuse, vUv );',
        'vec4 texel = texture2D( tDiffuse, vUv );\n\t\t\ttexel.rgb *= min( 1.0, 4.0 / max( luminance( texel.rgb ), 1e-4 ) );'
      );
      hp.needsUpdate = true;
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    this.finish = new ShaderPass(FinishShader);
    this.composer.addPass(this.finish);

    this.setSize(container.clientWidth, container.clientHeight);
  }

  /** Contact-shadow bounds + lamp positions follow the active car. */
  setCar(lengthM: number, widthM: number) {
    this.contact.setFootprint(lengthM, widthM);
    this.floorUniforms.uShadowRect.value.copy(this.contact.rect);
    this.floorUniforms.uLamps.value.set(widthM * 0.34, -lengthM * 0.5 + 0.12, lengthM * 0.5 - 0.1);
    this.invalidateShadow();
  }

  /** Re-bake the contact shadow for the next `frames` frames (e.g. while doors swing). */
  invalidateShadow(frames = 1) {
    this.shadowFrames = Math.max(this.shadowFrames, frames);
  }

  setNight(on: boolean) {
    this.nightTarget = on ? 1 : 0;
  }

  /** Fade the frame to the void (1) or reveal it (0). */
  setFade(value: number, speed = 1.6) {
    this.fadeTarget = value;
    this.fadeSpeed = speed;
  }

  snapFade(value: number) {
    this.fadeTarget = value;
    this.finish.uniforms.uFade.value = value;
  }

  /**
   * Links every shader under `object` in the background (KHR_parallel_shader_compile) before it is
   * first drawn. WebGL otherwise compiles lazily on the first visible frame, and ANGLE can block the
   * main thread for seconds on the physical-material programs.
   *
   * `outgoing` is hidden while compile() gathers lights, because light counts are part of every
   * program's cache key: the variants built must match the scene *after* the swap.
   */
  precompile(
    object: THREE.Object3D,
    camera: THREE.Camera,
    outgoing: THREE.Object3D | null = null,
    timeoutMs = 8000
  ): Promise<void> {
    const renderer = this.renderer;
    const previousTarget = renderer.getRenderTarget();
    const outgoingVisible = outgoing?.visible ?? false;
    // Coachwork only ever draws into off-screen HDR targets (composer, mirror), which select linear
    // output and no tone mapping; programs compiled against the canvas would never be reused.
    renderer.setRenderTarget(this.composer.readBuffer);
    if (outgoing) outgoing.visible = false;
    const pending = renderer.compileAsync(object, camera, this.scene);
    if (outgoing) outgoing.visible = outgoingVisible;
    renderer.setRenderTarget(previousTarget);
    // On a lost context programs never report ready; never hold the reveal hostage to that.
    const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs));
    return Promise.race([pending.then(() => undefined, () => undefined), timeout]);
  }

  setSize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.quality.maxPixelRatio);
    this.applySize();
  }

  private applySize() {
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(this.width, this.height);
    if (this.floor instanceof Reflector) {
      const s = this.pixelRatio * this.quality.mirrorScale;
      this.floor.getRenderTarget().setSize(
        Math.max(64, Math.round(this.width * s)),
        Math.max(64, Math.round(this.height * s))
      );
    }
  }

  /** Drops resolution in small steps if the GPU can't hold ~45 fps. */
  private adapt(dt: number) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 1 / 45 && this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
      this.applySize();
    }
  }

  render(camera: THREE.Camera, dt: number) {
    this.time += dt;
    this.adapt(dt);

    this.night += (this.nightTarget - this.night) * Math.min(1, dt * 3.2);
    this.floorUniforms.uNight.value = this.night;
    this.scene.environmentIntensity = THREE.MathUtils.lerp(1.0, 0.4, this.night);
    this.keyLight.intensity = THREE.MathUtils.lerp(1.1, 0.25, this.night);
    this.kickerLight.intensity = THREE.MathUtils.lerp(0.45, 0.12, this.night);
    if (this.bloom) {
      this.bloom.strength = this.bloomStrength * THREE.MathUtils.lerp(1, 1.9, this.night);
    }

    const fade = this.finish.uniforms.uFade.value as number;
    const step = Math.sign(this.fadeTarget - fade) * dt * this.fadeSpeed;
    this.finish.uniforms.uFade.value =
      Math.abs(this.fadeTarget - fade) <= Math.abs(step) ? this.fadeTarget : fade + step;
    this.finish.uniforms.uTime.value = this.time;

    if (this.shadowFrames > 0) {
      this.contact.render(this.renderer, this.scene, this.props);
      this.shadowFrames -= 1;
    }

    this.renderPass.camera = camera;
    this.composer.render(dt);
  }

  dispose() {
    this.composer.dispose();
    this.renderPass.dispose();
    this.bloom?.dispose();
    this.finish.dispose();
    this.contact.dispose();
    if (this.floor instanceof Reflector) this.floor.dispose();
    else (this.floor.material as THREE.Material).dispose();
    this.floor.geometry.dispose();
    this.envTexture.dispose();
    this.backdrop.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
