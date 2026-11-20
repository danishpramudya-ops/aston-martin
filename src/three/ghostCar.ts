/**
 * Best-lap ghost: a holographic copy of the current car that replays the recorded racing line.
 * It shares the live car's geometry (no extra GPU memory) and draws it with one additive fresnel
 * material, so it reads as a rival without competing with the real coachwork.
 */
import * as THREE from 'three';

const GHOST_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const GHOST_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uFade;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
    vec3 c = uColor * (0.08 + rim * 1.25) * uFade;
    gl_FragColor = vec4(c, 1.0);
  }
`;

export interface GhostCar {
  group: THREE.Group;
  setPose: (x: number, z: number, heading: number) => void;
  setFade: (fade: number) => void;
  dispose: () => void;
}

/** Copies every currently visible mesh under `source` (the car root at the scene origin). */
export function buildGhostCar(source: THREE.Object3D): GhostCar {
  const group = new THREE.Group();
  group.name = 'best_lap_ghost';
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0.55, 0.85, 0.12) },
      uFade: { value: 1 },
    },
    vertexShader: GHOST_VERT,
    fragmentShader: GHOST_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  source.updateMatrixWorld(true);
  const toLocal = new THREE.Matrix4().copy(source.matrixWorld).invert();
  const visibleInTree = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p && p !== source.parent; p = p.parent) if (!p.visible) return false;
    return true;
  };
  source.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (o as THREE.InstancedMesh).isInstancedMesh || !visibleInTree(o)) return;
    const pos = m.geometry.getAttribute('position');
    const nor = m.geometry.getAttribute('normal');
    if (!pos || !nor) return;
    const g = new THREE.Mesh(m.geometry, mat);
    g.matrixAutoUpdate = false;
    g.matrix.multiplyMatrices(toLocal, m.matrixWorld);
    g.renderOrder = 4;
    group.add(g);
  });
  group.visible = false;

  return {
    group,
    setPose: (x, z, heading) => {
      group.position.set(x, 0, z);
      group.rotation.set(0, heading, 0);
    },
    setFade: (fade) => {
      mat.uniforms.uFade.value = fade;
      group.visible = fade > 0.01;
    },
    dispose: () => {
      group.removeFromParent();
      group.clear();
      mat.dispose(); // geometry belongs to the live car
    },
  };
}
