import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  Cpu,
  DoorOpen,
  Flame,
  Layers,
  Pause,
  Play,
  RotateCcw,
  Sliders,
  Sparkles,
  SunMoon,
  Wind,
  X,
} from 'lucide-react';
import type { AstonCar, QCabinTrim, QCaliperFinish, QPaintFinish } from '../data/cars';
import {
  COCKPIT_SWITCHGEAR,
  DRIVE_PHYSICS_PROFILES,
  STUDIO_MOODS,
  XRAY_ENGINEERING_PINS,
  type QWheelFinish,
  type StudioMoodId,
  type SwitchgearControlSpec,
  type XrayPartSpec,
} from '../data/engineeringData';
import { engineAudio, type ExhaustValveMode } from '../audio/engineAudio';
import { buildAstonCar3D, preloadCarModel, type Car3DInstance } from '../three/buildCar3D';
import { getCameraPovsForCar, type CameraPovId, type CameraPovSpec } from '../three/cameraPovs';
import { evaluateLowerCoachwork, type Car3DBlueprint } from '../three/carProfiles';
import { Studio } from '../three/studio';
import { DriveGame, type DriveModeName } from '../game/driveGame';
import { DriveClusterOverlay, DriveControlDeck, DriveRaceHud } from './DriveClusterHud';

interface Observatory3DStageProps {
  car: AstonCar;
  paint: QPaintFinish;
  caliper: QCaliperFinish;
  wheelFinish: QWheelFinish;
  cabinTrim: QCabinTrim;
  mode: 'studio' | 'aero' | 'drive';
  povRequest: { id: CameraPovId; seq: number } | null;
  xrayRequest?: { seq: number } | null;
  onRegisterSnapshot?: (fn: (() => string) | null) => void;
}

interface StreakMeta {
  laneX: number;
  zProg: number;
  baseY: number;
}

const STREAK_COUNT = 180;

function buildStreakMeta(bp: Car3DBlueprint): StreakMeta[] {
  return Array.from({ length: STREAK_COUNT }, (_, idx) => ({
    laneX: ((idx % 10) / 9 - 0.5) * bp.W * 1.14,
    zProg: Math.random(),
    baseY: 0.1 + (Math.floor(idx / 10) / 18) * 0.98,
  }));
}

function evalStreamY(
  x: number,
  baseY: number,
  z: number,
  bp: Car3DBlueprint,
  speedNorm: number
): { y: number; xOut: number; energy: number } {
  const u = (z + bp.L * 0.5) / bp.L;
  let y = baseY;
  let xOut = x;
  let energy = 0;

  if (u >= -0.06 && u <= 1.12) {
    const cu = Math.max(0, Math.min(1, u));
    const env = evaluateLowerCoachwork(bp, cu);
    const canopyBoost =
      u > 0.25 && u < 0.72
        ? Math.sin(((u - 0.25) / 0.47) * Math.PI) * (bp.H - env.deckY)
        : 0;
    const ceilingY = env.deckY + Math.max(0, canopyBoost);

    if (Math.abs(xOut) < env.halfW * 1.06) {
      if (baseY < 0.24) {
        y = Math.max(0.032, env.sillY * 0.58);
        energy = 0.85 * speedNorm;
      } else if (y < ceilingY + 0.14) {
        const lift = (ceilingY + 0.14 - y) * 0.9;
        y += lift;
        xOut *= 1 + lift * 0.1;
        energy = Math.min(1, lift * 1.45 * speedNorm);
      }
    }
    if (u > 0.9 && baseY < 0.34) {
      y += (u - 0.9) * 1.15;
      energy = 1.0 * speedNorm;
    }
  }
  return { y, xOut, energy };
}

export const Observatory3DStage: React.FC<Observatory3DStageProps> = ({
  car,
  paint,
  caliper,
  wheelFinish,
  cabinTrim,
  mode,
  povRequest,
  xrayRequest,
  onRegisterSnapshot,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [activePovId, setActivePovId] = useState<CameraPovId>('hero-34');
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [nightLights, setNightLights] = useState(false);
  const [studioMood, setStudioMood] = useState<StudioMoodId>('gaydon');
  const [xrayMode, setXrayMode] = useState(false);
  const [showSwitchgearPins, setShowSwitchgearPins] = useState(true);
  const [selectedXrayPart, setSelectedXrayPart] = useState<XrayPartSpec | null>(null);
  const [selectedSwitch, setSelectedSwitch] = useState<SwitchgearControlSpec | null>(null);
  const [switchStatusMsg, setSwitchStatusMsg] = useState<string | null>(null);
  const [exhaustMode, setExhaustMode] = useState<ExhaustValveMode>('SPORT');
  const [damperMode, setDamperMode] = useState<'GT' | 'SPORT' | 'TRACK'>('SPORT');
  const [espMode, setEspMode] = useState<'ON' | 'TRACK' | 'OFF'>('ON');
  const [autoOrbit, setAutoOrbit] = useState(false);
  const [speedKmh, setSpeedKmh] = useState(260);
  const [brakeStress, setBrakeStress] = useState(false);
  const [loadingCar, setLoadingCar] = useState(true);

  // Cockpit drive-mode rotary (studio switchgear); carried into the Proving Ground game.
  const [rotaryMode, setRotaryMode] = useState<DriveModeName>('SPORT+');
  // Proving Ground game (created with the studio; its HUD subscribes to the game's own store, so
  // this stage no longer re-renders ~22×/s while driving)
  const [driveGame, setDriveGame] = useState<DriveGame | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const studioRef = useRef<Studio | null>(null);
  const car3dRef = useRef<Car3DInstance | null>(null);
  const driveGameRef = useRef<DriveGame | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const ringsRef = useRef<THREE.Object3D[]>([]);
  const povsRef = useRef<CameraPovSpec[]>([]);
  const activePovRef = useRef<CameraPovSpec | null>(null);
  const activePovIdRef = useRef<CameraPovId>('hero-34');
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const streakMetaRef = useRef<StreakMeta[]>([]);
  const pinElsRef = useRef<Map<string, HTMLButtonElement>>(new Map());

  const flyStateRef = useRef<{
    active: boolean;
    t: number;
    speed: number;
    fromPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    fromFov: number;
    toSpec: CameraPovSpec | null;
  }>({
    active: false,
    t: 1,
    speed: 1.45,
    fromPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    fromFov: 35,
    toSpec: null,
  });

  // Latest React state mirrored to refs for rAF & async swaps
  const carRef = useRef(car);
  const modeRef = useRef(mode);
  const autoOrbitRef = useRef(autoOrbit);
  const speedRef = useRef(speedKmh);
  const brakeStressRef = useRef(brakeStress);
  const paintRef = useRef(paint);
  const caliperRef = useRef(caliper);
  const wheelRef = useRef(wheelFinish);
  const cabinTrimRef = useRef(cabinTrim);
  const doorsOpenRef = useRef(doorsOpen);
  const nightLightsRef = useRef(nightLights);
  const studioMoodRef = useRef(studioMood);
  const xrayRef = useRef(xrayMode);
  const showSwitchgearRef = useRef(showSwitchgearPins);
  const rotaryModeRef = useRef(rotaryMode);

  carRef.current = car;
  paintRef.current = paint;
  caliperRef.current = caliper;
  wheelRef.current = wheelFinish;
  cabinTrimRef.current = cabinTrim;
  doorsOpenRef.current = doorsOpen;
  nightLightsRef.current = nightLights;
  studioMoodRef.current = studioMood;
  xrayRef.current = xrayMode;
  showSwitchgearRef.current = showSwitchgearPins;
  activePovIdRef.current = activePovId;
  rotaryModeRef.current = rotaryMode;

  const brakeThermalFor = (aero: boolean, stress: boolean, kmh: number) =>
    aero && stress ? 0.5 + (kmh / 360) * 1.6 : 0;

  // Register live 3D WebGL snapshot callback for the Q Commission Dossier
  useEffect(() => {
    if (!onRegisterSnapshot) return;
    onRegisterSnapshot(() => {
      const studio = studioRef.current;
      const cam = cameraRef.current;
      if (!studio || !cam) return '';
      return studio.captureSnapshot(cam);
    });
    return () => onRegisterSnapshot(null);
  }, [onRegisterSnapshot]);

  // Reset selected pins when the car changes (the drive game resets its own run on setCar)
  useEffect(() => {
    setSelectedXrayPart(null);
    setSelectedSwitch(null);
    setSwitchStatusMsg(null);
  }, [car.id]);

  // Mode transitions (Studio <-> CFD Aero <-> Proving Ground Drive)
  useEffect(() => {
    modeRef.current = mode;
    const isDrive = mode === 'drive';
    const isAero = mode === 'aero';

    ringsRef.current.forEach((r) => {
      r.visible = !isDrive;
    });

    const game = driveGameRef.current;
    if (isDrive) {
      setDoorsOpen(false);
      setXrayMode(false);
      setAutoOrbit(false);
      setSelectedXrayPart(null);
      setSelectedSwitch(null);
      flyStateRef.current.active = false;
      if (controlsRef.current) controlsRef.current.enabled = false;
      game?.setMode(rotaryModeRef.current);
      // Before the first car has streamed in, the vehicle swap effect starts the game instead.
      if (game && car3dRef.current && !game.isActive) void game.enter(car3dRef.current, carRef.current);
    } else {
      if (controlsRef.current) controlsRef.current.enabled = true;
      if (game?.isActive) game.exit();
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      if (isAero) {
        const cur = activePovRef.current;
        if (!cur || cur.zone === 'interior') {
          triggerPovFlight('hero-34');
        }
        setDoorsOpen(false);
        car3dRef.current?.setActiveAero(speedRef.current);
        car3dRef.current?.setBrakeThermal(brakeThermalFor(true, brakeStressRef.current, speedRef.current));
      } else {
        car3dRef.current?.setActiveAero(0);
        car3dRef.current?.setBrakeThermal(0);
        const cur = activePovRef.current || povsRef.current[0];
        if (cur) {
          car3dRef.current?.setInteriorMode(cur.zone === 'interior');
          flyTo(cur, 1.35);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    autoOrbitRef.current = autoOrbit;
  }, [autoOrbit]);

  useEffect(() => {
    speedRef.current = speedKmh;
    if (car3dRef.current && modeRef.current === 'aero') {
      car3dRef.current.setActiveAero(speedKmh);
      car3dRef.current.setBrakeThermal(brakeThermalFor(true, brakeStressRef.current, speedKmh));
    }
  }, [speedKmh]);

  useEffect(() => {
    brakeStressRef.current = brakeStress;
    if (car3dRef.current && modeRef.current === 'aero') {
      car3dRef.current.setBrakeThermal(brakeThermalFor(true, brakeStress, speedRef.current));
    }
  }, [brakeStress]);

  const framedSpec = (spec: CameraPovSpec, aspect: number): CameraPovSpec => {
    if (spec.zone === 'interior') return spec;
    const fit = Math.min(2.4, Math.max(1, 1.62 / Math.max(0.3, aspect)));
    if (fit === 1) return spec;
    const position = spec.target.clone().add(spec.position.clone().sub(spec.target).multiplyScalar(fit));
    return { ...spec, position, maxDistance: spec.maxDistance * fit };
  };

  const flyTo = (rawSpec: CameraPovSpec, speed = 1.45) => {
    const cam = cameraRef.current;
    const ctrls = controlsRef.current;
    if (!cam || !ctrls) return;
    const spec = framedSpec(rawSpec, cam.aspect);
    ctrls.minDistance = 0.04;
    ctrls.maxDistance = 12.0;
    ctrls.minPolarAngle = 0.05;
    ctrls.maxPolarAngle = Math.PI * 0.92;
    flyStateRef.current = {
      active: true,
      t: 0,
      speed,
      fromPos: cam.position.clone(),
      fromTarget: ctrls.target.clone(),
      fromFov: cam.fov,
      toSpec: spec,
    };
  };

  const triggerPovFlight = (povId: CameraPovId) => {
    const spec = povsRef.current.find((p) => p.id === povId) || povsRef.current[0];
    if (!spec) return;

    setActivePovId(spec.id);
    activePovRef.current = spec;
    setSelectedXrayPart(null);
    if (spec.zone !== 'interior') {
      setSelectedSwitch(null);
    }

    if (spec.zone === 'interior') {
      setAutoOrbit(false);
      setXrayMode(false);
    } else {
      car3dRef.current?.setInteriorMode(false);
    }
    setDoorsOpen(Boolean(spec.autoOpenDoors));
    flyTo(spec);
  };

  const focusXrayPart = (part: XrayPartSpec) => {
    engineAudio.playSwitchClick(false);
    setSelectedXrayPart(part);
    setAutoOrbit(false);
    const target = new THREE.Vector3(...part.anchor);
    const position = new THREE.Vector3(...part.camOffset);
    flyTo(
      {
        id: activePovIdRef.current,
        code: part.code,
        label: part.title,
        zone: 'exterior',
        position,
        target,
        fov: 32,
        minDistance: 1.1,
        maxDistance: 8.5,
        minPolarAngle: 0.1,
        maxPolarAngle: Math.PI * 0.495,
        rotateSpeed: 0.65,
      },
      1.65
    );
  };

  const handleSwitchgearTrigger = (sw: SwitchgearControlSpec) => {
    setSelectedSwitch(sw);
    engineAudio.playSwitchClick(sw.actionType === 'ignition' || sw.actionType === 'paddles');

    if (sw.actionType === 'ignition') {
      if (engineAudio.active) {
        engineAudio.stop();
        setSwitchStatusMsg(`${car.name} Ignition: Standby`);
      } else {
        const phys = DRIVE_PHYSICS_PROFILES[car.id] || DRIVE_PHYSICS_PROFILES.valkyrie;
        engineAudio.triggerColdStart(car.topology, phys.idleRpm);
        setSwitchStatusMsg(`${car.name} Ignition: Cold-Start Sequence Fired`);
      }
    } else if (sw.actionType === 'driveMode') {
      const order: DriveModeName[] = ['GT', 'SPORT', 'SPORT+', 'TRACK'];
      const next = order[(order.indexOf(rotaryMode) + 1) % order.length];
      setRotaryMode(next);
      const ex: ExhaustValveMode = next === 'TRACK' || next === 'SPORT+' ? 'TRACK' : next === 'SPORT' ? 'SPORT' : 'QUIET';
      setExhaustMode(ex);
      engineAudio.setExhaustValve(ex);
      setSwitchStatusMsg(`Drive Mode Rotary -> ${next} Calibration Active`);
    } else if (sw.actionType === 'exhaust') {
      const order: ExhaustValveMode[] = ['QUIET', 'SPORT', 'TRACK'];
      const next = order[(order.indexOf(exhaustMode) + 1) % order.length];
      setExhaustMode(next);
      engineAudio.setExhaustValve(next);
      if (engineAudio.active) engineAudio.triggerBlip(car.specs.redlineRpm * 0.68, 1300);
      setSwitchStatusMsg(`Active Exhaust Valves -> ${next} Acoustic Profile`);
    } else if (sw.actionType === 'damper') {
      const order: ('GT' | 'SPORT' | 'TRACK')[] = ['GT', 'SPORT', 'TRACK'];
      const next = order[(order.indexOf(damperMode) + 1) % order.length];
      setDamperMode(next);
      setSwitchStatusMsg(`Bilstein DTX Dampers -> ${next} Valve Map`);
    } else if (sw.actionType === 'esp') {
      const order: ('ON' | 'TRACK' | 'OFF')[] = ['ON', 'TRACK', 'OFF'];
      const next = order[(order.indexOf(espMode) + 1) % order.length];
      setEspMode(next);
      setSwitchStatusMsg(`6-Axis IMU / E-Diff -> ESP ${next}`);
    } else if (sw.actionType === 'kers') {
      if (!engineAudio.active) {
        engineAudio.start(car.topology, 2400);
      }
      engineAudio.triggerBlip(car.specs.redlineRpm * 0.9, 1800);
      setSwitchStatusMsg(`Hybrid E-Boost Primed (+${car.id === 'valkyrie' ? '161' : '251'} PS Electric Supplement)`);
    } else if (sw.actionType === 'paddles') {
      if (!engineAudio.active) {
        engineAudio.start(car.topology, 2600);
      }
      engineAudio.triggerGearShift('down', car.specs.redlineRpm * 0.72);
      setSwitchStatusMsg(`Carbon Shift Paddles -> Rev-Match Downshift Engaged`);
    } else if (sw.actionType === 'lights') {
      setNightLights((v) => !v);
      setSwitchStatusMsg(`Matrix LED & Cabin Illumination Toggled`);
    }
  };

  // Respond cleanly when external components request a specific POV
  useEffect(() => {
    if (povRequest) {
      triggerPovFlight(povRequest.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [povRequest]);

  // Respond when user clicks "Inspect in 3D X-Ray Cutaway" from Powertrain Lab or Inspector
  useEffect(() => {
    if (xrayRequest) {
      setXrayMode(true);
      setDoorsOpen(false);
      setSelectedSwitch(null);
      triggerPovFlight('hero-34');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xrayRequest]);

  // Live sync Q materials, doors, lights, studio mood, X-Ray without rebuilding car geometry
  useEffect(() => {
    car3dRef.current?.setPaint(paint);
  }, [paint]);

  useEffect(() => {
    car3dRef.current?.setCaliper(caliper);
  }, [caliper]);

  useEffect(() => {
    car3dRef.current?.setWheelFinish(wheelFinish);
  }, [wheelFinish]);

  useEffect(() => {
    car3dRef.current?.setCabinTrim(cabinTrim);
  }, [cabinTrim]);

  useEffect(() => {
    car3dRef.current?.setDoorsOpen(doorsOpen);
  }, [doorsOpen]);

  useEffect(() => {
    car3dRef.current?.setLightsMode(nightLights);
    studioRef.current?.setNight(nightLights);
    driveGameRef.current?.setNight(nightLights);
  }, [nightLights]);

  // Fullscreen applies to the viewport itself (HUD included); F key or the HUD button.
  const toggleFullscreen = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void el.requestFullscreen?.().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(viewportRef.current) && document.fullscreenElement === viewportRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    studioRef.current?.setMood(studioMood);
    if (studioMood === 'night' && !nightLightsRef.current) {
      setNightLights(true);
    } else if (studioMood === 'gaydon' && nightLightsRef.current) {
      setNightLights(false);
    }
  }, [studioMood]);

  useEffect(() => {
    car3dRef.current?.setXRay(xrayMode);
    studioRef.current?.setAmbientOcclusion(!xrayMode);
    if (!xrayMode) setSelectedXrayPart(null);
  }, [xrayMode]);

  // Studio lifecycle: one renderer, environment, floor, driving track and post pipeline
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const studio = new Studio(el, { background: '#070908', floorRadius: 14 });
    studioRef.current = studio;
    studio.setNight(nightLightsRef.current);
    studio.setMood(studioMoodRef.current);
    const { scene } = studio;

    const brassRingGeo = new THREE.RingGeometry(2.88, 2.9, 128);
    brassRingGeo.rotateX(-Math.PI / 2);
    const brassRingMat = new THREE.MeshBasicMaterial({
      color: '#c8a96e',
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const brassRing = new THREE.Mesh(brassRingGeo, brassRingMat);
    brassRing.position.y = 0.003;
    scene.add(brassRing);

    const innerTickGeo = new THREE.RingGeometry(2.74, 2.75, 128);
    innerTickGeo.rotateX(-Math.PI / 2);
    const innerTickMat = new THREE.MeshBasicMaterial({
      color: '#34403a',
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const innerTick = new THREE.Mesh(innerTickGeo, innerTickMat);
    innerTick.position.y = 0.002;
    scene.add(innerTick);
    ringsRef.current = [brassRing, innerTick];

    const startPov = povsRef.current[0];
    const camera = new THREE.PerspectiveCamera(35, el.clientWidth / Math.max(1, el.clientHeight), 0.04, 160);
    camera.position.set(-4.6, 1.5, -4.7);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, studio.renderer.domElement);
    controls.target.set(0, 0.5, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.enablePan = false;
    if (startPov) {
      controls.minDistance = startPov.minDistance;
      controls.maxDistance = startPov.maxDistance;
    }
    controls.update();
    controlsRef.current = controls;

    const onControlStart = () => {
      flyStateRef.current.active = false;
      setAutoOrbit(false);
    };
    controls.addEventListener('start', onControlStart);

    // Continuous 180 CFD Streamline Ribbons
    const streakPos = new Float32Array(STREAK_COUNT * 2 * 3);
    const streakCol = new Float32Array(STREAK_COUNT * 2 * 3);
    const streakGeo = new THREE.BufferGeometry();
    streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
    streakGeo.setAttribute('color', new THREE.BufferAttribute(streakCol, 3));
    const streakMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.86,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const streakLines = new THREE.LineSegments(streakGeo, streakMat);
    streakLines.visible = false;
    streakLines.frustumCulled = false;
    scene.add(streakLines);
    studio.props.push(brassRing, innerTick, streakLines);

    // Proving Ground game: builds its circuit lazily on the first drive.
    const game = new DriveGame(studio, camera);
    game.onFullscreenRequest = () => toggleFullscreen();
    driveGameRef.current = game;
    setDriveGame(game);
    if (import.meta.env.DEV) (window as unknown as { __driveGame?: DriveGame }).__driveGame = game;

    let onScreen = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        // Only hijack WASD / arrows / Space while most of the stage is actually on screen.
        game.setVisible(entry.intersectionRatio >= 0.35);
      },
      { threshold: [0, 0.01, 0.35, 0.6] }
    );
    io.observe(el);

    const resize = () => {
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      camera.updateProjectionMatrix();
      studio.setSize(el.clientWidth, el.clientHeight);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const projVec = new THREE.Vector3();
    let rafId = 0;
    let lastT = performance.now();

    const animate = (now: number) => {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      if (!onScreen || document.hidden) return;

      const car3d = car3dRef.current;
      const curMode = modeRef.current;

      if (curMode === 'drive') {
        // ---- PROVING GROUND GAME ----
        const game = driveGameRef.current;
        if (game && game.isActive && car3d) game.update(dt);
        else if (car3d) car3d.update(dt);
      } else {
        // ---- STUDIO / POV / CFD AERO LOOP ----
        const fly = flyStateRef.current;
        if (fly.active && fly.toSpec) {
          fly.t = Math.min(1, fly.t + dt * fly.speed);
          if (fly.t >= 0.45) {
            car3d?.setInteriorMode(fly.toSpec.zone === 'interior');
          }
          const e = fly.t < 0.5 ? 4 * fly.t * fly.t * fly.t : 1 - Math.pow(-2 * fly.t + 2, 3) / 2;
          camera.position.lerpVectors(fly.fromPos, fly.toSpec.position, e);
          controls.target.lerpVectors(fly.fromTarget, fly.toSpec.target, e);
          camera.fov = THREE.MathUtils.lerp(fly.fromFov, fly.toSpec.fov, e);
          camera.updateProjectionMatrix();

          if (fly.t >= 1) {
            fly.active = false;
            car3d?.setInteriorMode(fly.toSpec.zone === 'interior');
            controls.minDistance = fly.toSpec.minDistance;
            controls.maxDistance = fly.toSpec.maxDistance;
            controls.minPolarAngle = fly.toSpec.minPolarAngle;
            controls.maxPolarAngle = fly.toSpec.maxPolarAngle;
            controls.rotateSpeed = fly.toSpec.rotateSpeed;
          }
        } else if (autoOrbitRef.current && activePovRef.current?.zone !== 'interior') {
          controls.autoRotate = true;
          controls.autoRotateSpeed = 1.25;
        } else {
          controls.autoRotate = false;
        }

        if (car3d && car3d.update(dt)) studio.invalidateShadow();

        // CFD streamlines in Aero Wind Tunnel mode
        const isAero = curMode === 'aero' && Boolean(car3d);
        streakLines.visible = isAero;
        if (isAero && car3d) {
          const bp = car3d.blueprint;
          const metas = streakMetaRef.current;
          const speedNorm = speedRef.current / 360;
          const posArr = streakGeo.attributes.position.array as Float32Array;
          const colArr = streakGeo.attributes.color.array as Float32Array;
          const flowVel = 2.0 + speedNorm * 5.4;
          const tailLen = 0.45 + speedNorm * 0.55;

          for (let i = 0; i < metas.length; i++) {
            const m = metas[i];
            m.zProg += dt * (flowVel / 8.8);
            if (m.zProg > 1) m.zProg -= 1;
            const zHead = -4.4 + m.zProg * 8.8;
            const zTail = zHead - tailLen;

            const head = evalStreamY(m.laneX, m.baseY, zHead, bp, speedNorm);
            const tail = evalStreamY(m.laneX, m.baseY, zTail, bp, speedNorm);

            const base = i * 6;
            posArr[base] = tail.xOut;
            posArr[base + 1] = tail.y;
            posArr[base + 2] = zTail;

            posArr[base + 3] = head.xOut;
            posArr[base + 4] = head.y;
            posArr[base + 5] = zHead;

            const en = head.energy;
            colArr[base] = 0.18;
            colArr[base + 1] = 0.28;
            colArr[base + 2] = 0.28;

            colArr[base + 3] = 0.52 + en * 0.36;
            colArr[base + 4] = 0.68 + en * 0.24;
            colArr[base + 5] = 0.66 * (1 - en * 0.9);
          }
          streakGeo.attributes.position.needsUpdate = true;
          streakGeo.attributes.color.needsUpdate = true;
        }

        controls.update();

        // Project interactive 3D X-Ray Engineering Pins or Cockpit Switchgear Pins at 60fps
        const w = el.clientWidth;
        const h = el.clientHeight;
        const activeId = carRef.current.id;
        const isInterior = activePovRef.current?.zone === 'interior';
        const showXrayPins = curMode === 'studio' && xrayRef.current && !isInterior;
        const showCockpitPins = curMode === 'studio' && isInterior && showSwitchgearRef.current;

        if (showXrayPins || showCockpitPins) {
          const list = showXrayPins
            ? XRAY_ENGINEERING_PINS[activeId] || []
            : COCKPIT_SWITCHGEAR[activeId] || [];
          for (const item of list) {
            const btn = pinElsRef.current.get(item.id);
            if (!btn) continue;
            projVec.set(item.anchor[0], item.anchor[1], item.anchor[2]);
            projVec.project(camera);
            const visible = projVec.z < 1 && projVec.z > -1 && Math.abs(projVec.x) <= 0.96 && Math.abs(projVec.y) <= 0.92;
            if (visible) {
              const sx = (projVec.x * 0.5 + 0.5) * w;
              const sy = (-projVec.y * 0.5 + 0.5) * h;
              btn.style.opacity = '1';
              btn.style.pointerEvents = 'auto';
              btn.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
            } else {
              btn.style.opacity = '0';
              btn.style.pointerEvents = 'none';
            }
          }
        }
      }

      studio.render(camera, dt);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      io.disconnect();
      ro.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.dispose();
      game.dispose();
      driveGameRef.current = null;
      setDriveGame(null);
      car3dRef.current?.dispose();
      car3dRef.current = null;
      brassRingGeo.dispose();
      brassRingMat.dispose();
      innerTickGeo.dispose();
      innerTickMat.dispose();
      streakGeo.dispose();
      streakMat.dispose();
      studio.dispose();
      studioRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  // Vehicle swap: fade through void, build & compile shaders offscreen, then glide in
  useEffect(() => {
    const studio = studioRef.current;
    if (!studio) return;
    let cancelled = false;
    let next: Car3DInstance | null = null;

    const hadCar = Boolean(car3dRef.current);
    setLoadingCar(true);
    studio.setFade(1, hadCar ? 3.2 : 100);
    preloadCarModel(car.id);

    new Promise<void>((resolve) => window.setTimeout(resolve, hadCar ? 340 : 0))
      .then(() => {
        if (cancelled) return;
        next = buildAstonCar3D(car, paintRef.current, caliperRef.current, cabinTrimRef.current);
        return next.ready.catch(() => undefined);
      })
      .then(() => {
        const camera = cameraRef.current;
        if (cancelled || !next || !camera) return;
        next.setXRay(xrayRef.current);
        return studio.precompile(next.root, camera, car3dRef.current?.root ?? null);
      })
      .then(() => {
        if (cancelled || !next) return;
        const incoming: Car3DInstance = next;

        const prev = car3dRef.current;
        if (prev) {
          studio.scene.remove(prev.root);
          prev.dispose();
        }

        incoming.setPaint(paintRef.current);
        incoming.setCaliper(caliperRef.current);
        incoming.setWheelFinish(wheelRef.current);
        incoming.setCabinTrim(cabinTrimRef.current);
        incoming.setLightsMode(nightLightsRef.current);
        incoming.setXRay(xrayRef.current);
        incoming.setActiveAero(modeRef.current === 'aero' ? speedRef.current : 0);
        incoming.setBrakeThermal(
          brakeThermalFor(modeRef.current === 'aero', brakeStressRef.current, speedRef.current)
        );
        incoming.setDoorsOpen(doorsOpenRef.current);
        studio.scene.add(incoming.root);
        car3dRef.current = incoming;

        const bp = incoming.blueprint;
        studio.setCar(bp.L, bp.W);
        streakMetaRef.current = buildStreakMeta(bp);

        const povs = getCameraPovsForCar(bp);
        povsRef.current = povs;
        const pov = povs.find((p) => p.id === activePovIdRef.current) || povs[0];
        activePovRef.current = pov;
        incoming.setInteriorMode(modeRef.current === 'drive' ? false : pov.zone === 'interior');

        flyStateRef.current.active = false;
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (camera && controls && modeRef.current !== 'drive') {
          if (pov.zone === 'interior') {
            camera.position.copy(pov.position);
            controls.target.copy(pov.target);
          } else {
            const framed = framedSpec(pov, camera.aspect);
            const offset = new THREE.Vector3().subVectors(framed.position, framed.target).multiplyScalar(1.16);
            camera.position.copy(pov.target).add(offset);
            camera.position.y = Math.max(0.35, camera.position.y - 0.18);
            controls.target.copy(pov.target);
          }
          camera.fov = pov.fov + 3;
          camera.updateProjectionMatrix();
        }

        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (cancelled) return;
            setLoadingCar(false);
            if (modeRef.current === 'drive') {
              // The game owns the reveal while on the circuit (it fades in after its own warm-up).
              const game = driveGameRef.current;
              if (game?.isActive) game.setCar(incoming, carRef.current);
              else if (game) void game.enter(incoming, carRef.current);
              if (!game?.isLoading) studio.setFade(0, 1.25);
            } else {
              flyTo(pov, 0.62);
              studio.setFade(0, 1.25);
            }
          })
        );
      });

    return () => {
      cancelled = true;
      if (next && car3dRef.current !== next) next.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [car]);

  const currentPovs = getCameraPovsForCar(
    car3dRef.current?.blueprint || {
      id: car.id,
      L: car.aero.lengthM,
      W: car.aero.widthM,
      H: car.aero.heightM,
      WB: car.aero.wheelbaseM,
      zFrontAxle: -1.35,
      zRearAxle: 1.4,
      trackFrontHalf: 0.86,
      trackRearHalf: 0.88,
      wheelRadiusF: 0.35,
      wheelRadiusR: 0.36,
      tireWidthF: 0.25,
      tireWidthR: 0.3,
      driverX: -0.32,
      eyeY: 0.85,
      eyeZ: 0.2,
      dashZ: -0.35,
      wheelZ: -0.15,
      wheelY: 0.72,
      seatBackZ: 0.55,
      cabinFloorY: 0.15,
      windscreenBottomZ: -0.7,
      windscreenBottomY: 0.65,
      windscreenTopZ: 0.0,
      windscreenTopY: 1.15,
      roofRearZ: 0.8,
      roofRearY: 1.08,
      cabinHalfW: 0.62,
      doorFrontZ: -0.68,
      doorRearZ: 0.54,
      doorBottomY: 0.18,
      doorBeltY: 0.74,
      grilleStyle: 'vaned-gt',
      tailStyle: 'c-clamp',
      exhaustStyle: 'lower-dual',
      wheelStyle: 'forged-multi',
      doorStyle: 'swan-wing',
      roofStyle: 'coupe-metal',
      hasActiveWing: car.aero.hasActiveWing,
      rearWingY: 0.88,
      rearWingZ: 2.0,
    }
  );

  const activePovObj = currentPovs.find((p) => p.id === activePovId) || currentPovs[0];
  const isInteriorView = activePovObj.zone === 'interior';
  const xrayPins = XRAY_ENGINEERING_PINS[car.id] || [];
  const switchgearPins = COCKPIT_SWITCHGEAR[car.id] || [];
  const activePhysics = DRIVE_PHYSICS_PROFILES[car.id] || DRIVE_PHYSICS_PROFILES.valkyrie;

  const speedFactor = Math.min(1, Math.pow(speedKmh / car.aero.downforceRefKmh, 2));
  const currentDownforceKg = Math.round(car.aero.maxDownforceKg * speedFactor);
  const dragNewtons = Math.round(0.5 * 1.225 * Math.pow(speedKmh / 3.6, 2) * car.aero.dragCd * 2.05);
  const brakeTempC = brakeStress && mode === 'aero' ? Math.round(240 + (speedKmh / 360) * 580) : 145;

  const bindPinRef = (id: string) => (el: HTMLButtonElement | null) => {
    if (el) pinElsRef.current.set(id, el);
    else pinElsRef.current.delete(id);
  };

  return (
    <>
      <div ref={viewportRef} className={`studio-viewport ${mode === 'drive' ? 'drive-viewport' : ''} ${isFullscreen ? 'is-fullscreen' : ''}`}>
        <div
          ref={mountRef}
          style={{ width: '100%', height: '100%', cursor: mode === 'drive' ? 'crosshair' : 'grab' }}
        />

        {loadingCar && (
          <div className="stage-loading" role="status" aria-live="polite">
            <span className="stage-loading-label">Preparing {car.name} coachwork</span>
            <span className="stage-loading-bar" />
          </div>
        )}

        {/* Top Architectural HUD Bar */}
        <div className="hud-top-bar">
          <div className="hud-top-left">
            <div className="hud-badge">
              <span className="hud-dot" />
              <span>
                {mode === 'drive'
                  ? `GAYDON PROVING GROUND // ${car.name.toUpperCase()} LIVE DRIVE`
                  : mode === 'aero'
                    ? `360° 3D WIND TUNNEL // ${car.chassisCode}`
                    : xrayMode
                      ? `X-RAY ENGINEERING CUTAWAY // ${car.chassisCode}`
                      : `${isInteriorView ? 'COCKPIT INTERIOR 3D' : 'EXTERIOR 360° 3D'} // ${car.chassisCode}`}
              </span>
            </div>

            {mode === 'studio' && !isInteriorView && (
              <div className="studio-mood-strip" role="group" aria-label="Studio Lighting Mood">
                {STUDIO_MOODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`mood-pill ${studioMood === m.id ? 'active' : ''}`}
                    onClick={() => setStudioMood(m.id)}
                    title={m.subtitle}
                  >
                    <span className="mood-dot" style={{ background: m.accentHex }} />
                    <span>{m.label.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="hud-top-right">
            {mode === 'studio' && !isInteriorView && (
              <button
                type="button"
                className={`hud-tool-btn ${autoOrbit ? 'active' : ''}`}
                onClick={() => setAutoOrbit((v) => !v)}
                title="Toggle 360° turntable orbit"
              >
                {autoOrbit ? <Pause size={12} /> : <Play size={12} />}
                <span>Orbit</span>
              </button>
            )}

            {mode === 'studio' && isInteriorView && (
              <button
                type="button"
                className={`hud-tool-btn ${showSwitchgearPins ? 'active' : ''}`}
                onClick={() => setShowSwitchgearPins((v) => !v)}
                title="Toggle interactive cockpit button & switchgear specification pins"
              >
                <Sliders size={12} />
                <span>Controls Spec</span>
              </button>
            )}

            {mode !== 'drive' && (
              <button
                type="button"
                className={`hud-tool-btn ${doorsOpen ? 'active' : ''}`}
                onClick={() => setDoorsOpen((v) => !v)}
              >
                <DoorOpen size={12} />
                <span>{doorsOpen ? 'Close Doors' : 'Open Doors'}</span>
              </button>
            )}

            <button
              type="button"
              className={`hud-tool-btn ${nightLights ? 'active' : ''}`}
              onClick={() => setNightLights((v) => !v)}
            >
              <SunMoon size={12} />
              <span>{nightLights ? 'Lights: On' : 'Lights'}</span>
            </button>

            {mode !== 'drive' && (
              <button
                type="button"
                className={`hud-tool-btn ${xrayMode ? 'active' : ''}`}
                onClick={() => setXrayMode((v) => !v)}
              >
                <Layers size={12} />
                <span>X-Ray</span>
              </button>
            )}

            {mode === 'aero' && (
              <button
                type="button"
                className={`hud-tool-btn ${brakeStress ? 'active' : ''}`}
                onClick={() => setBrakeStress((v) => !v)}
              >
                <Flame size={12} />
                <span>Brake {brakeTempC}°C</span>
              </button>
            )}

            {mode !== 'drive' && (
              <button
                type="button"
                className="hud-tool-btn"
                onClick={() => triggerPovFlight(activePovId)}
                aria-label="Reset camera to active POV"
              >
                <RotateCcw size={12} />
              </button>
            )}
          </div>
        </div>

        {/* 3D Projected X-Ray Engineering Cutaway Pins */}
        {mode === 'studio' && xrayMode && !isInteriorView && (
          <div className="stage-pins-layer" aria-label="X-Ray Mechanical Cutaway Callouts">
            {xrayPins.map((part, idx) => (
              <button
                key={part.id}
                ref={bindPinRef(part.id)}
                type="button"
                className={`stage-3d-pin xray-pin ${selectedXrayPart?.id === part.id ? 'active' : ''}`}
                style={{ opacity: 0 }}
                onClick={() => focusXrayPart(part)}
              >
                <span className="pin-pulse" />
                <span className="pin-code">0{idx + 1}</span>
                <span className="pin-label">{part.code.split('//')[1]?.trim() || part.title}</span>
              </button>
            ))}
          </div>
        )}

        {/* 3D Projected Cockpit Switchgear & Controls Pins */}
        {mode === 'studio' && isInteriorView && showSwitchgearPins && (
          <div className="stage-pins-layer" aria-label="Interactive Cockpit Switchgear Callouts">
            {switchgearPins.map((sw, idx) => (
              <button
                key={sw.id}
                ref={bindPinRef(sw.id)}
                type="button"
                className={`stage-3d-pin switch-pin ${selectedSwitch?.id === sw.id ? 'active' : ''}`}
                style={{ opacity: 0 }}
                onClick={() => handleSwitchgearTrigger(sw)}
              >
                <span className="pin-pulse" />
                <span className="pin-code">0{idx + 1}</span>
                <span className="pin-label">{sw.shortLabel}</span>
              </button>
            ))}
          </div>
        )}

        {/* Mechanical Cutaway Spec Card (when an X-Ray pin is clicked) */}
        {mode === 'studio' && xrayMode && selectedXrayPart && (
          <div className="stage-spec-card">
            <div className="stage-spec-head">
              <div>
                <div className="stage-spec-code">
                  <Cpu size={11} />
                  <span>{selectedXrayPart.code}</span>
                </div>
                <h4 className="stage-spec-title">{selectedXrayPart.title}</h4>
              </div>
              <button
                type="button"
                className="stage-spec-close"
                onClick={() => setSelectedXrayPart(null)}
                aria-label="Close mechanical callout"
              >
                <X size={13} />
              </button>
            </div>
            <div className="stage-spec-meta">
              <span>{selectedXrayPart.metric}</span>
              <span>·</span>
              <span>{selectedXrayPart.material}</span>
            </div>
            <p className="stage-spec-desc">{selectedXrayPart.description}</p>
          </div>
        )}

        {/* Cockpit Switchgear Spec Card (when a cockpit control pin is clicked) */}
        {mode === 'studio' && isInteriorView && selectedSwitch && (
          <div className="stage-spec-card switchgear-card">
            <div className="stage-spec-head">
              <div>
                <div className="stage-spec-code">
                  <Sparkles size={11} />
                  <span>
                    {selectedSwitch.code} · {selectedSwitch.actuationForce}
                  </span>
                </div>
                <h4 className="stage-spec-title">{selectedSwitch.name}</h4>
              </div>
              <button
                type="button"
                className="stage-spec-close"
                onClick={() => setSelectedSwitch(null)}
                aria-label="Close switchgear spec"
              >
                <X size={13} />
              </button>
            </div>
            <div className="stage-spec-meta">
              <span>{selectedSwitch.material}</span>
            </div>
            {switchStatusMsg && <div className="stage-spec-live-badge">{switchStatusMsg}</div>}
            <p className="stage-spec-desc">{selectedSwitch.description}</p>
          </div>
        )}

        {/* CFD Live Telemetry HUD Card */}
        {mode === 'aero' && (
          <div className="aero-telemetry-hud">
            <div className="aero-telemetry-head">
              <Wind size={11} style={{ display: 'inline', marginRight: 6 }} />
              REAL-TIME CFD TELEMETRY // 360° 3D
            </div>
            <div className="aero-stat-grid">
              <div>
                <div className="aero-stat-label">Downforce</div>
                <div className="aero-stat-val">
                  {currentDownforceKg} <span>kg</span>
                </div>
              </div>
              <div>
                <div className="aero-stat-label">Drag Force</div>
                <div className="aero-stat-val">
                  {dragNewtons} <span>N</span>
                </div>
              </div>
              <div>
                <div className="aero-stat-label">Aero Split</div>
                <div className="aero-stat-val">
                  {car.aero.frontBiasPct}/{100 - car.aero.frontBiasPct}
                  <span>%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Proving Ground: race HUD + instrument cluster (both subscribe to the game's store) */}
        {mode === 'drive' && (
          <>
            <DriveRaceHud game={driveGame} car={car} isFullscreen={isFullscreen} onToggleFullscreen={toggleFullscreen} />
            <DriveClusterOverlay game={driveGame} car={car} physics={activePhysics} />
          </>
        )}
      </div>

      {/* Bottom Dock: 8 POVs OR CFD Speed Slider OR Proving Ground Interactive Driver Deck */}
      {mode === 'drive' ? (
        <DriveControlDeck game={driveGame} car={car} physics={activePhysics} />
      ) : mode === 'studio' ? (
        <div className="pov-dock-bar">
          <div className="pov-status-readout">
            <span className="azimuth-deg">{activePovObj.code}</span>
            <span className="azimuth-label">
              {activePovObj.zone === 'interior'
                ? 'Inside Cabin'
                : activePovObj.zone === 'threshold'
                  ? 'Door Open'
                  : '360° 3D'}
            </span>
          </div>

          <div className="pov-pills-track" role="tablist" aria-label="Exterior to Interior 3D POVs">
            {currentPovs.map((pov) => {
              const isSelected = pov.id === activePovId;
              const isInterior = pov.zone === 'interior';
              return (
                <button
                  key={pov.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  className={`pov-chip ${isSelected ? 'active' : ''} ${isInterior ? 'interior-chip' : ''}`}
                  onClick={() => triggerPovFlight(pov.id)}
                >
                  <span className="pov-chip-code">{pov.code}</span>
                  <span>{pov.label}</span>
                </button>
              );
            })}
          </div>

          <div className="compass-drag-hint">
            <span>
              {xrayMode
                ? 'Click Pins to Inspect Engine'
                : isInteriorView
                  ? 'Click Controls · Drag 360°'
                  : 'Drag to Orbit 3D'}
            </span>
          </div>
        </div>
      ) : (
        <div className="speed-control-bar">
          <div className="speed-readout">
            <span className="speed-num">{speedKmh}</span>
            <span className="speed-unit">km/h Airspeed</span>
          </div>
          <div className="speed-slider-wrap">
            <span className="speed-min">60 km/h</span>
            <input
              id="wind-tunnel-speed"
              name="windTunnelSpeed"
              type="range"
              min={60}
              max={car.specs.topSpeedKmh}
              step={5}
              value={speedKmh}
              onChange={(e) => setSpeedKmh(Number(e.target.value))}
              className="speed-slider"
              aria-label="Wind tunnel airspeed km/h"
            />
            <span className="speed-max">{car.specs.topSpeedKmh} km/h Vmax</span>
          </div>
          <div className="compass-drag-hint">
            <span>
              Cd {car.aero.dragCd} · {car.aero.brakeFrontMm} mm Rotor
            </span>
          </div>
        </div>
      )}
    </>
  );
};
