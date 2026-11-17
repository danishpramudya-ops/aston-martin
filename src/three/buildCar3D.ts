import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { AstonCar, QCabinTrim, QCaliperFinish, QPaintFinish } from '../data/cars';
import { buildCabin3D, type Cabin3DResult } from './cabinBuilder';
import { getBlueprintForCar, type Car3DBlueprint } from './carProfiles';
import {
  createClusterTexture,
  createLeatherTextures,
  getCarbonFiberTextures,
  getFlakeNormalTexture,
  getRotorTextures,
} from './textures';

export interface Car3DInstance {
  root: THREE.Group;
  blueprint: Car3DBlueprint;
  setPaint: (paint: QPaintFinish) => void;
  setCaliper: (caliper: QCaliperFinish) => void;
  setCabinTrim: (trim: QCabinTrim) => void;
  setDoorsOpen: (open: boolean) => void;
  setLightsMode: (nightMode: boolean) => void;
  setXRay: (xray: boolean) => void;
  setInteriorMode: (inside: boolean) => void;
  setActiveAero: (speedKmh: number) => void;
  setBrakeThermal: (tempNorm: number) => void;
  update: (dt: number) => void;
  dispose: () => void;
}

const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

const glbTemplateCache = new Map<string, Promise<THREE.Group>>();

function loadGlbTemplate(carId: string): Promise<THREE.Group> {
  const existing = glbTemplateCache.get(carId);
  if (existing) return existing;

  const url = `./models/${carId}.glb`;
  const promise = new Promise<THREE.Group>((resolve, reject) => {
    gltfLoader.load(
      url,
      (gltf) => {
        resolve(gltf.scene);
      },
      undefined,
      (err) => {
        glbTemplateCache.delete(carId);
        reject(err);
      }
    );
  });

  glbTemplateCache.set(carId, promise);
  return promise;
}

/**
 * Preloads all 4 Aston Martin high-polygon GLB models into memory cache.
 */
export function preloadAllCarGlbs(): void {
  ['valkyrie', 'valhalla', 'vanquish', 'db12'].forEach((id) => {
    loadGlbTemplate(id).catch(() => {
      // Ignore background preload errors
    });
  });
}

function getFullNodePath(obj: THREE.Object3D): string {
  const parts: string[] = [];
  let curr: THREE.Object3D | null = obj;
  while (curr) {
    if (curr.name) parts.push(curr.name);
    curr = curr.parent;
  }
  return parts.join('/');
}

/**
 * Wraps a list of target nodes inside a hinged pivot group at the specified local hinge coordinate.
 */
function createHingedDoorGroup(
  parentScene: THREE.Object3D,
  nodes: THREE.Object3D[],
  hingeInScene: THREE.Vector3
): THREE.Group | null {
  if (nodes.length === 0) return null;
  const pivot = new THREE.Group();
  pivot.rotation.order = 'YXZ';
  pivot.position.copy(hingeInScene);
  parentScene.add(pivot);
  pivot.updateMatrixWorld(true);
  nodes.forEach((node) => {
    node.updateMatrixWorld(true);
    pivot.attach(node);
  });
  return pivot;
}

/**
 * Builds the complete photorealistic 3D Aston Martin vehicle assembly using
 * authentic high-polygon GLB coachwork models paired with dynamic Q by Aston Martin
 * clearcoat paint shaders, metallic flake normal maps, articulated doors, and
 * our bespoke 3D cockpit interior for close-up POV inspection.
 */
export function buildAstonCar3D(
  car: AstonCar,
  initialPaint: QPaintFinish,
  initialCaliper: QCaliperFinish,
  initialTrim: QCabinTrim
): Car3DInstance {
  const bp = getBlueprintForCar(car);
  const root = new THREE.Group();
  const glbContainer = new THREE.Group();
  root.add(glbContainer);

  // Kick off background preload of other models
  preloadAllCarGlbs();

  const { map: carbonMap, bumpMap: carbonBump } = getCarbonFiberTextures();
  const flakeNormal = getFlakeNormalTexture();
  const rotorTex = getRotorTextures();

  const paintColor = new THREE.Color(initialPaint.isNeutral ? '#b8bfc4' : initialPaint.hex);
  const paintMat = new THREE.MeshPhysicalMaterial({
    color: paintColor,
    metalness: initialPaint.isNeutral ? 0.78 : 0.72,
    roughness: 0.13,
    clearcoat: 1.0,
    clearcoatRoughness: 0.035,
    normalMap: flakeNormal,
    normalScale: new THREE.Vector2(0.028, 0.028),
    reflectivity: 1.0,
    envMapIntensity: 2.15,
    transparent: false,
    opacity: 1.0,
    side: THREE.DoubleSide,
  });

  const carbonMat = new THREE.MeshPhysicalMaterial({
    map: carbonMap,
    bumpMap: carbonBump,
    bumpScale: 0.005,
    roughness: 0.26,
    metalness: 0.35,
    clearcoat: 0.82,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.55,
    side: THREE.DoubleSide,
  });

  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: '#111514',
    roughness: 0.65,
    metalness: 0.32,
    side: THREE.DoubleSide,
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: '#d4dcd9',
    metalness: 0.94,
    roughness: 0.14,
    envMapIntensity: 2.0,
    side: THREE.DoubleSide,
  });

  const grilleMetalMat = new THREE.MeshStandardMaterial({
    color: '#8f9895',
    metalness: 0.88,
    roughness: 0.22,
    envMapIntensity: 1.7,
    side: THREE.DoubleSide,
  });

  const wheelAlloyMat = new THREE.MeshPhysicalMaterial({
    color: '#adb5b2',
    metalness: 0.9,
    roughness: 0.2,
    clearcoat: 0.6,
    envMapIntensity: 1.85,
    side: THREE.DoubleSide,
  });

  const darkAlloyMat = new THREE.MeshStandardMaterial({
    color: '#1b1f1e',
    metalness: 0.82,
    roughness: 0.28,
    envMapIntensity: 1.5,
    side: THREE.DoubleSide,
  });

  const tireMat = new THREE.MeshStandardMaterial({
    color: '#121514',
    roughness: 0.82,
    metalness: 0.06,
    side: THREE.DoubleSide,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#0b1110',
    transparent: true,
    opacity: 0.24,
    roughness: 0.035,
    metalness: 0.1,
    reflectivity: 1.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    envMapIntensity: 2.25,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const clearLensMat = new THREE.MeshPhysicalMaterial({
    color: '#e8f1f5',
    transparent: true,
    opacity: 0.18,
    roughness: 0.02,
    metalness: 0.05,
    reflectivity: 1.0,
    clearcoat: 1.0,
    envMapIntensity: 2.4,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const caliperMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(initialCaliper.hex),
    metalness: 0.55,
    roughness: 0.22,
    clearcoat: 0.9,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.7,
    side: THREE.DoubleSide,
  });

  const rotorMat = new THREE.MeshStandardMaterial({
    map: rotorTex.map,
    bumpMap: rotorTex.bumpMap,
    bumpScale: 0.008,
    metalness: 0.72,
    roughness: 0.34,
    emissive: new THREE.Color('#ff3b00'),
    emissiveIntensity: 0,
    side: THREE.DoubleSide,
  });

  const drlMat = new THREE.MeshStandardMaterial({
    color: '#f5faff',
    emissive: new THREE.Color('#dff2ff'),
    emissiveIntensity: 1.85,
    roughness: 0.1,
    side: THREE.DoubleSide,
  });

  const tailBladeMat = new THREE.MeshStandardMaterial({
    color: '#ff1f2d',
    emissive: new THREE.Color('#ff1424'),
    emissiveIntensity: 2.25,
    roughness: 0.12,
    side: THREE.DoubleSide,
  });

  let glbLeatherTex = createLeatherTextures(initialTrim.primaryHex, initialTrim.stitchHex);
  const glbLeatherMat = new THREE.MeshStandardMaterial({
    map: glbLeatherTex.map,
    bumpMap: glbLeatherTex.bumpMap,
    bumpScale: 0.006,
    roughness: 0.54,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });

  const glbLeatherSecondaryMat = new THREE.MeshStandardMaterial({
    color: initialTrim.primaryHex,
    roughness: 0.58,
    metalness: 0.06,
    side: THREE.DoubleSide,
  });

  const glbStitchMat = new THREE.MeshStandardMaterial({
    color: initialTrim.stitchHex,
    emissive: new THREE.Color(initialTrim.stitchHex),
    emissiveIntensity: 0.18,
    roughness: 0.4,
    side: THREE.DoubleSide,
  });

  let glbClusterTex = createClusterTexture(car, false);
  const glbScreenMat = new THREE.MeshBasicMaterial({
    map: glbClusterTex,
    side: THREE.DoubleSide,
  });

  // Build bespoke 3D cockpit interior for close-up interior POVs & hypercar canopy interior
  const cabinResult: Cabin3DResult = buildCabin3D(car, bp, initialTrim, paintMat, glassMat);
  root.add(cabinResult.group);

  // State tracking so async GLB load immediately syncs with current user selections
  let isDisposed = false;
  let isInteriorPov = false;
  let isNightLights = false;
  let isXray = false;
  let doorTarget = 0;
  let doorCurrent = 0;
  let brakeHeatTarget = 0;
  let brakeHeatCurrent = 0;
  let aeroSpeed = 0;

  const doorPivots: Array<{
    pivot: THREE.Object3D;
    side: number;
    mode: 'dihedral' | 'swan' | 'canopy' | 'window-drop';
    baseY?: number;
  }> = [];
  const wheelSpinNodes: THREE.Object3D[] = [];
  const customClonedMats: THREE.Material[] = [];
  const customHeadlightMats: THREE.MeshStandardMaterial[] = [];

  function syncInteriorExteriorVisibility() {
    if (isInteriorPov) {
      glbContainer.visible = false;
      cabinResult.group.visible = true;
      cabinResult.group.scale.set(1, 1, 1);
      cabinResult.group.position.set(0, 0, 0);
      cabinResult.setCockpitSurroundVisible(true);
    } else {
      glbContainer.visible = true;
      cabinResult.setCockpitSurroundVisible(false);
      if (car.id === 'valkyrie') {
        cabinResult.group.visible = true;
        cabinResult.group.scale.setScalar(0.74);
        cabinResult.group.position.set(0, 0.15, -0.32);
      } else if (car.id === 'valhalla') {
        cabinResult.group.visible = true;
        cabinResult.group.scale.setScalar(0.82);
        cabinResult.group.position.set(0, 0.06, -0.18);
      } else {
        // Vanquish and DB12 have full native 3D interiors inside their GLB models
        cabinResult.group.visible = false;
      }
    }
  }

  syncInteriorExteriorVisibility();

  // Add subtle glowing brake rotor discs at the 4 wheel positions so thermal glow works on all models
  const thermalRotorDiscs: THREE.Mesh[] = [];
  const flX = -bp.W * 0.42;
  const frX = bp.W * 0.42;
  [
    [flX, bp.wheelRadiusF, bp.zFrontAxle],
    [frX, bp.wheelRadiusF, bp.zFrontAxle],
    [flX, bp.wheelRadiusR, bp.zRearAxle],
    [frX, bp.wheelRadiusR, bp.zRearAxle],
  ].forEach(([wx, wy, wz]) => {
    const rMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(wy * 0.56, wy * 0.56, 0.024, 28),
      rotorMat
    );
    rMesh.rotation.z = Math.PI / 2;
    rMesh.position.set(wx, wy, wz);
    glbContainer.add(rMesh);
    thermalRotorDiscs.push(rMesh);
  });

  loadGlbTemplate(car.id)
    .then((template) => {
      if (isDisposed) return;

      const glbScene = template.clone(true);

      // 1. Pre-normalization cleanup of model-specific redundant nodes
      glbScene.traverse((obj) => {
        const n = obj.name || '';
        if (car.id === 'vanquish') {
          // Keep twin-turbo V12 (amdb11_engine_v12), hide optional V8/i6 meshes
          if (/engine_v8|intake_v8|etk_engine_i6/i.test(n)) {
            obj.visible = false;
          }
        }
        if (car.id === 'valkyrie') {
          // Lower the internal flat box (Plane.011) slightly so it doesn't slice across the cockpit seats
          if (n === 'Plane.011' || n === 'Plane.011_AstonMartinValkyrieThirdMain_0') {
            obj.position.y -= 0.22;
          }
        }
      });

      // 2. Rotate 180 deg around Y so Nose faces -Z, Tail faces +Z, Left is -X, Right is +X
      const glbWrapper = new THREE.Group();
      glbScene.rotation.y = Math.PI;
      glbWrapper.add(glbScene);

      glbScene.updateMatrixWorld(true);
      const rawBox = new THREE.Box3().setFromObject(glbScene);
      const rawSize = rawBox.getSize(new THREE.Vector3());
      const rawCenter = rawBox.getCenter(new THREE.Vector3());

      const scale = bp.L / Math.max(rawSize.z, 0.001);
      glbWrapper.scale.setScalar(scale);
      glbScene.position.set(-rawCenter.x, -rawBox.min.y, -rawCenter.z);

      // 3. Classify every mesh in the GLB and bind Q by Aston Martin PBR shaders
      glbScene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        obj.castShadow = true;
        obj.receiveShadow = true;

        const pathName = getFullNodePath(obj);
        const origMat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
        const matName = origMat?.name || '';

        if (car.id === 'valkyrie') {
          if (
            matName === 'AstonMartinValkyrieMainBody' ||
            matName === 'AstonMartinValkyrieSecondMain'
          ) {
            obj.material = paintMat;
          } else if (matName === 'AstonMartinValkyrieWindows') {
            obj.material = glassMat;
          } else if (matName === 'AstonMartinValkyrieLightsCover') {
            obj.material = clearLensMat;
          } else if (matName === 'AstonMartinValkyrieBrakes') {
            obj.material = caliperMat;
          } else if (matName === 'AstonMartinValkyrieBackLights') {
            obj.material = tailBladeMat;
          } else if (/FronLights2|FrontLights|FrontLights3/i.test(matName)) {
            obj.material = drlMat;
          } else if (matName === 'AstonMartinValkyrieTires') {
            obj.material = tireMat;
          } else if (/AstonMartinValkyrieWheel[1235]/i.test(matName)) {
            obj.material = darkAlloyMat;
          } else if (matName === 'AstonMartinValkyrieWheel4' || matName === 'AstonMartinValkyrie6') {
            obj.material = wheelAlloyMat;
          } else if (
            matName === 'AstonMartinValkyrieThirdMain' ||
            matName === 'AstonMartinValkyrie1' ||
            matName === 'AstonMartinValkyrie2' ||
            matName === 'Plane.103__0'
          ) {
            obj.material = carbonMat;
          } else {
            obj.material = darkTrimMat;
          }
        } else if (car.id === 'valhalla') {
          if (/carpaint/i.test(pathName) || matName === 'Material.001') {
            obj.material = paintMat;
          } else if (/glass_windows|glasses/i.test(pathName)) {
            obj.material = glassMat;
          } else if (/bone_caliper/i.test(pathName)) {
            obj.material = caliperMat;
          } else if (matName === 'Material.004') {
            // chassis_pivot_details.033 rear LED light blade
            obj.material = tailBladeMat;
          } else if (/Wheel.*_tyres/i.test(pathName)) {
            obj.material = tireMat;
          } else if (/carbon_fiber|chassis_pivot_bottom/i.test(pathName)) {
            obj.material = carbonMat;
          } else if (origMat instanceof THREE.MeshStandardMaterial && origMat.map) {
            // Material.002 (textured rims, headlamp internals, grille & badging)
            const cloned = origMat.clone();
            cloned.roughness = /Wheel.*_rims/i.test(pathName) ? 0.24 : 0.28;
            cloned.metalness = /Wheel.*_rims/i.test(pathName) ? 0.78 : 0.55;
            cloned.envMapIntensity = 1.85;
            obj.material = cloned;
            customClonedMats.push(cloned);
          }
        } else if (car.id === 'vanquish') {
          if (matName === 'amdb11' || matName === 'amdb11_roof') {
            obj.material = paintMat;
          } else if (matName === 'amdb11_caliper') {
            obj.material = caliperMat;
          } else if (matName === 'amdb11_brake') {
            obj.material = rotorMat;
          } else if (matName === 'amdb11_wheel_grey') {
            obj.material = wheelAlloyMat;
          } else if (matName === 'Scene_-_Root' || /Object_4\./i.test(pathName)) {
            obj.material = tireMat;
          } else if (matName === 'amdb11_glass' || matName === 'amdb11_glass_tint') {
            obj.material = /headlight|bumper/i.test(pathName) ? clearLensMat : glassMat;
          } else if (matName === 'amdb11_rearglass') {
            obj.material = /backlight/i.test(pathName) ? glassMat : tailBladeMat;
          } else if (/taillight|chmsl/i.test(matName)) {
            obj.material = tailBladeMat;
          } else if (/runninglight|highbeam|headlight/i.test(matName)) {
            obj.material = drlMat;
          } else if (matName === 'amdb11_leather' || matName === 'amdb11_leather_2') {
            obj.material = glbLeatherMat;
          } else if (matName === 'amdb11_leather_3' || matName === 'amdb11_interior') {
            obj.material = glbLeatherSecondaryMat;
          } else if (matName === 'amdb11_stitch_1' || matName === 'amdb11_stitch_2') {
            obj.material = glbStitchMat;
          } else if (/amdb11_gauge|amdb11_screen/i.test(matName)) {
            obj.material = glbScreenMat;
          } else if (matName === 'amdb11_black_ext' || matName === 'amdb11_black_2' || matName === 'amdb11_trim') {
            obj.material = carbonMat;
          } else if (/chrome|silver|mirror|badging/i.test(matName)) {
            obj.material = chromeMat;
          } else if (matName === 'amdb11_grille') {
            obj.material = grilleMetalMat;
          } else {
            obj.material = darkTrimMat;
          }
        } else if (car.id === 'db12') {
          if (matName === 'OEMPaint' || matName === 'Coloured') {
            obj.material = paintMat;
          } else if (matName === 'CaliperAZonePaint' || matName === 'CaliperAZone') {
            obj.material = caliperMat;
          } else if (matName === 'Carbon1M' || matName === 'Carbon1') {
            obj.material = carbonMat;
          } else if (matName === 'GlassMtl') {
            obj.material = /Glass_21|GlassInside_20|Object_46/i.test(pathName)
              ? glassMat
              : clearLensMat;
          } else if (matName === 'GlassRed') {
            obj.material = tailBladeMat;
          } else if (matName === 'InteriorColour1A') {
            obj.material = glbLeatherMat;
          } else if (matName === 'InteriorColour2A') {
            obj.material = glbStitchMat;
          } else if (matName === 'LightA' && origMat instanceof THREE.MeshStandardMaterial) {
            const cloned = origMat.clone();
            cloned.emissive = new THREE.Color('#dff2ff');
            if (cloned.map) cloned.emissiveMap = cloned.map;
            cloned.emissiveIntensity = isNightLights ? 3.2 : 1.15;
            cloned.envMapIntensity = 2.0;
            obj.material = cloned;
            customClonedMats.push(cloned);
            customHeadlightMats.push(cloned);
          } else if (/Grille[1-8]A/i.test(matName)) {
            obj.material = /Grille[123]A/i.test(matName) ? grilleMetalMat : darkTrimMat;
          } else if (origMat instanceof THREE.MeshStandardMaterial) {
            const cloned = origMat.clone();
            if (/Wheel[12]A/i.test(matName)) {
              cloned.metalness = 0.78;
              cloned.roughness = 0.24;
              cloned.envMapIntensity = 1.9;
            } else {
              cloned.envMapIntensity = 1.5;
            }
            obj.material = cloned;
            customClonedMats.push(cloned);
          }
        }
      });

      // Compute exact car-local meter bounds while glbWrapper is still detached from parent scene
      glbWrapper.updateMatrixWorld(true);

      const computeNodesBox = (nodes: THREE.Object3D[]) => {
        const b = new THREE.Box3();
        nodes.forEach((n) => b.expandByObject(n));
        return b;
      };

      // 4. Bind Articulated Doors & Spinning Wheels in glbContainer world-meter space
      if (car.id === 'valhalla') {
        const doorL = glbScene.getObjectByName('detach_door_L_50');
        const doorR = glbScene.getObjectByName('detach_door_R_50');
        const boxL = doorL ? computeNodesBox([doorL]) : null;
        const boxR = doorR ? computeNodesBox([doorR]) : null;
        glbContainer.add(glbWrapper);
        glbContainer.updateMatrixWorld(true);

        const pivotL =
          doorL && boxL
            ? createHingedDoorGroup(
                glbContainer,
                [doorL],
                new THREE.Vector3(boxL.min.x + 0.12, boxL.max.y - 0.12, boxL.min.z + 0.08)
              )
            : null;
        const pivotR =
          doorR && boxR
            ? createHingedDoorGroup(
                glbContainer,
                [doorR],
                new THREE.Vector3(boxR.max.x - 0.12, boxR.max.y - 0.12, boxR.min.z + 0.08)
              )
            : null;
        if (pivotL) doorPivots.push({ pivot: pivotL, side: -1, mode: 'dihedral' });
        if (pivotR) doorPivots.push({ pivot: pivotR, side: 1, mode: 'dihedral' });

        ['WheelFL', 'WheelFR', 'WheelBL', 'WheelBR'].forEach((wName) => {
          const wNode = glbScene.getObjectByName(wName);
          if (wNode) wheelSpinNodes.push(wNode);
        });
      } else if (car.id === 'vanquish') {
        const leftDoorNodes = [
          'amdb11_door_L',
          'amdb11_doorpanel_L',
          'amdb11_doorglass_L',
          'amdb11_mirror_L',
        ]
          .map((n) => glbScene.getObjectByName(n))
          .filter((n): n is THREE.Object3D => Boolean(n));

        const rightDoorNodes = [
          'amdb11_door_R',
          'amdb11_doorpanel_R',
          'amdb11_doorglass_R',
          'amdb11_mirror_R',
        ]
          .map((n) => glbScene.getObjectByName(n))
          .filter((n): n is THREE.Object3D => Boolean(n));

        const boxL = computeNodesBox(leftDoorNodes);
        const boxR = computeNodesBox(rightDoorNodes);
        glbContainer.add(glbWrapper);
        glbContainer.updateMatrixWorld(true);

        const pivotL = createHingedDoorGroup(
          glbContainer,
          leftDoorNodes,
          new THREE.Vector3(boxL.min.x + 0.06, (boxL.min.y + boxL.max.y) * 0.48, boxL.min.z + 0.05)
        );
        const pivotR = createHingedDoorGroup(
          glbContainer,
          rightDoorNodes,
          new THREE.Vector3(boxR.max.x - 0.06, (boxR.min.y + boxR.max.y) * 0.48, boxR.min.z + 0.05)
        );
        if (pivotL) doorPivots.push({ pivot: pivotL, side: -1, mode: 'swan' });
        if (pivotR) doorPivots.push({ pivot: pivotR, side: 1, mode: 'swan' });
      } else if (car.id === 'valkyrie') {
        const canopyNodes = ['Plane.047', 'Plane.014', 'Plane.015', 'Plane.016']
          .map((n) => glbScene.getObjectByName(n))
          .filter((n): n is THREE.Object3D => Boolean(n));
        const boxC = computeNodesBox(canopyNodes);
        glbContainer.add(glbWrapper);
        glbContainer.updateMatrixWorld(true);

        const canopyPivot = createHingedDoorGroup(
          glbContainer,
          canopyNodes,
          new THREE.Vector3(0, boxC.max.y - 0.05, boxC.min.z + 0.08)
        );
        if (canopyPivot) doorPivots.push({ pivot: canopyPivot, side: 1, mode: 'canopy' });
      } else if (car.id === 'db12') {
        glbContainer.add(glbWrapper);
        glbContainer.updateMatrixWorld(true);
        const sideGlass = glbScene.getObjectByName('GlassInside_20');
        if (sideGlass) {
          doorPivots.push({
            pivot: sideGlass,
            side: 1,
            mode: 'window-drop',
            baseY: sideGlass.position.y,
          });
        }
        ['Wheel2A_LF_24', 'Wheel2A_RF_25', 'Wheel1A_LR_26', 'Wheel1A_RR_27'].forEach((wName) => {
          const wNode = glbScene.getObjectByName(wName);
          if (wNode) wheelSpinNodes.push(wNode);
        });
      }
    })
    .catch((err) => {
      console.error(`Failed to load GLB for ${car.id}:`, err);
    });

  return {
    root,
    blueprint: bp,
    setPaint: (paint: QPaintFinish) => {
      paintMat.color.set(paint.isNeutral ? '#b8bfc4' : paint.hex);
      paintMat.metalness = paint.isNeutral ? 0.78 : 0.72;
      paintMat.roughness = paint.isNeutral ? 0.14 : 0.13;
      paintMat.needsUpdate = true;
    },
    setCaliper: (caliper: QCaliperFinish) => {
      caliperMat.color.set(caliper.hex);
      caliperMat.needsUpdate = true;
    },
    setCabinTrim: (trim: QCabinTrim) => {
      cabinResult.updateTrim(trim);

      const nextTex = createLeatherTextures(trim.primaryHex, trim.stitchHex);
      glbLeatherTex.map.dispose();
      glbLeatherTex.bumpMap.dispose();
      glbLeatherTex = nextTex;
      glbLeatherMat.map = nextTex.map;
      glbLeatherMat.bumpMap = nextTex.bumpMap;
      glbLeatherMat.needsUpdate = true;

      glbLeatherSecondaryMat.color.set(trim.primaryHex);
      glbStitchMat.color.set(trim.stitchHex);
      glbStitchMat.emissive.set(trim.stitchHex);
    },
    setDoorsOpen: (open: boolean) => {
      doorTarget = open ? 1 : 0;
    },
    setLightsMode: (nightMode: boolean) => {
      isNightLights = nightMode;
      drlMat.emissiveIntensity = nightMode ? 4.4 : 1.85;
      tailBladeMat.emissiveIntensity = nightMode ? 4.8 : 2.25;
      customHeadlightMats.forEach((m) => {
        m.emissiveIntensity = nightMode ? 3.2 : 1.15;
      });
      cabinResult.setLightsMode(nightMode);

      const nextCluster = createClusterTexture(car, nightMode);
      glbClusterTex.dispose();
      glbClusterTex = nextCluster;
      glbScreenMat.map = nextCluster;
      glbScreenMat.needsUpdate = true;
    },
    setXRay: (xray: boolean) => {
      isXray = xray;
      paintMat.transparent = xray;
      paintMat.opacity = xray ? 0.22 : 1.0;
      paintMat.depthWrite = !xray;
      paintMat.needsUpdate = true;
    },
    setInteriorMode: (inside: boolean) => {
      if (isInteriorPov === inside) return;
      isInteriorPov = inside;
      syncInteriorExteriorVisibility();
    },
    setActiveAero: (speedKmh: number) => {
      aeroSpeed = speedKmh;
    },
    setBrakeThermal: (tempNorm: number) => {
      brakeHeatTarget = Math.max(0, Math.min(2.2, tempNorm));
    },
    update: (dt: number) => {
      doorCurrent += (doorTarget - doorCurrent) * Math.min(1, dt * 6.5);
      doorPivots.forEach(({ pivot, side, mode, baseY }) => {
        if (mode === 'dihedral') {
          pivot.rotation.x = -doorCurrent * 0.42;
          pivot.rotation.y = side * doorCurrent * 0.58;
          pivot.rotation.z = -side * doorCurrent * 0.28;
        } else if (mode === 'swan') {
          pivot.rotation.x = -doorCurrent * 0.18;
          pivot.rotation.y = side * doorCurrent * 0.74;
          pivot.rotation.z = -side * doorCurrent * 0.08;
        } else if (mode === 'canopy') {
          pivot.rotation.x = -doorCurrent * 0.48;
        } else if (mode === 'window-drop' && baseY !== undefined) {
          pivot.position.y = baseY - doorCurrent * 0.16;
        }
      });

      brakeHeatCurrent += (brakeHeatTarget - brakeHeatCurrent) * Math.min(1, dt * 5.0);
      rotorMat.emissiveIntensity = brakeHeatCurrent;
      thermalRotorDiscs.forEach((d) => {
        d.visible = brakeHeatCurrent > 0.05 || isXray;
      });

      if (aeroSpeed > 1) {
        const angular = (aeroSpeed / 3.6) * dt;
        wheelSpinNodes.forEach((wNode, idx) => {
          const r = idx < 2 ? bp.wheelRadiusF : bp.wheelRadiusR;
          wNode.rotation.x += angular / r;
        });
      }
    },
    dispose: () => {
      isDisposed = true;
      cabinResult.dispose();
      glbLeatherTex.map.dispose();
      glbLeatherTex.bumpMap.dispose();
      glbClusterTex.dispose();
      customClonedMats.forEach((m) => m.dispose());
      [
        paintMat,
        carbonMat,
        darkTrimMat,
        chromeMat,
        grilleMetalMat,
        wheelAlloyMat,
        darkAlloyMat,
        tireMat,
        glassMat,
        clearLensMat,
        caliperMat,
        rotorMat,
        drlMat,
        tailBladeMat,
        glbLeatherMat,
        glbLeatherSecondaryMat,
        glbStitchMat,
        glbScreenMat,
      ].forEach((m) => m.dispose());
    },
  };
}
