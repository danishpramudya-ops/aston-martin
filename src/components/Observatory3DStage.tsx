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
import { buildDrivingTrack, type DrivingTrack } from '../three/drivingTrack';
import { Studio } from '../three/studio';
import {
  DriveClusterOverlay,
  DriveControlDeck,
  type DriveCameraMode,
  type DriveModeName,
  type DriveTelemetrySnapshot,
} from './DriveClusterHud';

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

  // Proving Ground Interactive Driving Simulator state
  const [driveCamera, setDriveCamera] = useState<DriveCameraMode>('chase');
  const [driveMode, setDriveMode] = useState<DriveModeName>('SPORT+');
  const [manualShift, setManualShift] = useState(false);
  const [driveAudioOn, setDriveAudioOn] = useState(true);
  const [driveTelemetry, setDriveTelemetry] = useState<DriveTelemetrySnapshot>({
    speedKmh: 0,
    rpm: 1100,
    gear: 1,
    throttle: 0,
    brake: 0,
    steer: 0,
    latG: 0,
    longG: 0,
    downforceKg: 0,
    brakeTempC: 145,
    kersPct: 100,
    kersActive: false,
    zeroTo100Sec: null,
    zeroTo200Sec: null,
    peakSpeedKmh: 0,
    launchArmed: false,
  });

  const studioRef = useRef<Studio | null>(null);
  const car3dRef = useRef<Car3DInstance | null>(null);
  const trackRef = useRef<DrivingTrack | null>(null);
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

  // Live driving physics mutable state (updated at 60fps in rAF; UI synced throttled ~20Hz)
  const driveInputRef = useRef({
    throttle: false,
    brake: false,
    left: false,
    right: false,
    boost: false,
  });
  const driveSimRef = useRef({
    speedMps: 0,
    rpm: 1100,
    gear: 1,
    steer: 0,
    laneX: 0,
    brakeTempC: 145,
    kersPct: 100,
    launchArmed: false,
    runStartTime: null as number | null,
    zeroTo100Sec: null as number | null,
    zeroTo200Sec: null as number | null,
    peakSpeedKmh: 0,
    shiftCooldown: 0,
    lastUiSync: 0,
    audioStarted: false,
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
  const driveCamRef = useRef(driveCamera);
  const driveModeRef = useRef(driveMode);
  const manualShiftRef = useRef(manualShift);
  const driveAudioRef = useRef(driveAudioOn);

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
  driveCamRef.current = driveCamera;
  driveModeRef.current = driveMode;
  manualShiftRef.current = manualShift;
  driveAudioRef.current = driveAudioOn;

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

  // Reset selected pins & driving run when car changes
  useEffect(() => {
    setSelectedXrayPart(null);
    setSelectedSwitch(null);
    setSwitchStatusMsg(null);
    const phys = DRIVE_PHYSICS_PROFILES[car.id] || DRIVE_PHYSICS_PROFILES.valkyrie;
    driveSimRef.current = {
      speedMps: 0,
      rpm: phys.idleRpm,
      gear: 1,
      steer: 0,
      laneX: 0,
      brakeTempC: 145,
      kersPct: 100,
      launchArmed: false,
      runStartTime: null,
      zeroTo100Sec: null,
      zeroTo200Sec: null,
      peakSpeedKmh: 0,
      shiftCooldown: 0,
      lastUiSync: 0,
      audioStarted: false,
    };
    setDriveTelemetry({
      speedKmh: 0,
      rpm: phys.idleRpm,
      gear: 1,
      throttle: 0,
      brake: 0,
      steer: 0,
      latG: 0,
      longG: 0,
      downforceKg: 0,
      brakeTempC: 145,
      kersPct: 100,
      kersActive: false,
      zeroTo100Sec: null,
      zeroTo200Sec: null,
      peakSpeedKmh: 0,
      launchArmed: false,
    });
  }, [car.id]);

  // Mode transitions (Studio <-> CFD Aero <-> Proving Ground Drive)
  useEffect(() => {
    modeRef.current = mode;
    const isDrive = mode === 'drive';
    const isAero = mode === 'aero';

    trackRef.current?.setVisible(isDrive);
    studioRef.current?.setFloorVisible(!isDrive);
    ringsRef.current.forEach((r) => {
      r.visible = !isDrive;
    });

    if (isDrive) {
      setDoorsOpen(false);
      setXrayMode(false);
      setAutoOrbit(false);
      setSelectedXrayPart(null);
      setSelectedSwitch(null);
      if (controlsRef.current) controlsRef.current.enabled = false;
      car3dRef.current?.setInteriorMode(driveCamRef.current === 'cockpit');
    } else {
      if (controlsRef.current) controlsRef.current.enabled = true;
      car3dRef.current?.setDriveDynamics(0, 0, 0, 0);
      if (driveSimRef.current.audioStarted) {
        engineAudio.stop();
        driveSimRef.current.audioStarted = false;
      }
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
    if (modeRef.current === 'drive') {
      car3dRef.current?.setInteriorMode(driveCamera === 'cockpit');
    }
  }, [driveCamera]);

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
      const next = order[(order.indexOf(driveMode) + 1) % order.length];
      setDriveMode(next);
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

  // Manual gear shift handler for Proving Ground drive mode
  const handleManualShift = useCallback(
    (dir: 'up' | 'down') => {
      const sim = driveSimRef.current;
      const phys = DRIVE_PHYSICS_PROFILES[carRef.current.id] || DRIVE_PHYSICS_PROFILES.valkyrie;
      const maxGear = phys.gearRatios.length;
      if (dir === 'up' && sim.gear < maxGear) {
        sim.gear += 1;
        sim.shiftCooldown = 0.22;
        if (driveAudioRef.current) engineAudio.triggerGearShift('up', sim.rpm);
      } else if (dir === 'down' && sim.gear > 1) {
        sim.gear -= 1;
        sim.shiftCooldown = 0.22;
        if (driveAudioRef.current) engineAudio.triggerGearShift('down', sim.rpm);
      }
    },
    []
  );

  const handleTriggerLaunch = useCallback(() => {
    const sim = driveSimRef.current;
    const phys = DRIVE_PHYSICS_PROFILES[carRef.current.id] || DRIVE_PHYSICS_PROFILES.valkyrie;
    engineAudio.playSwitchClick(true);
    sim.speedMps = 0;
    sim.gear = 1;
    sim.launchArmed = true;
    sim.runStartTime = null;
    sim.zeroTo100Sec = null;
    sim.zeroTo200Sec = null;
    if (driveAudioRef.current) {
      engineAudio.start(carRef.current.topology, phys.redlineRpm * 0.45);
      sim.audioStarted = true;
    }
  }, []);

  const handleResetDriveRun = useCallback(() => {
    const sim = driveSimRef.current;
    const phys = DRIVE_PHYSICS_PROFILES[carRef.current.id] || DRIVE_PHYSICS_PROFILES.valkyrie;
    engineAudio.playSwitchClick(false);
    sim.speedMps = 0;
    sim.rpm = phys.idleRpm;
    sim.gear = 1;
    sim.steer = 0;
    sim.laneX = 0;
    sim.brakeTempC = 145;
    sim.kersPct = 100;
    sim.launchArmed = false;
    sim.runStartTime = null;
    sim.zeroTo100Sec = null;
    sim.zeroTo200Sec = null;
    sim.peakSpeedKmh = 0;
  }, []);

  // Keyboard bindings when Proving Ground Drive mode is active
  useEffect(() => {
    if (mode !== 'drive') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === 'w' || e.key === 'ArrowUp') {
        e.preventDefault();
        driveInputRef.current.throttle = true;
      } else if (k === 's' || e.key === 'ArrowDown') {
        e.preventDefault();
        driveInputRef.current.brake = true;
      } else if (k === 'a' || e.key === 'ArrowLeft') {
        e.preventDefault();
        driveInputRef.current.left = true;
      } else if (k === 'd' || e.key === 'ArrowRight') {
        e.preventDefault();
        driveInputRef.current.right = true;
      } else if (e.key === ' ') {
        e.preventDefault();
        const phys = DRIVE_PHYSICS_PROFILES[carRef.current.id] || DRIVE_PHYSICS_PROFILES.valkyrie;
        if (phys.hasHybridBoost) {
          driveInputRef.current.boost = true;
        } else {
          handleTriggerLaunch();
        }
      } else if (k === 'e' || e.key === 'Shift') {
        handleManualShift('up');
      } else if (k === 'q' || e.key === 'Control') {
        handleManualShift('down');
      } else if (k === 'c') {
        setDriveCamera((prev) => (prev === 'chase' ? 'cockpit' : prev === 'cockpit' ? 'bonnet' : 'chase'));
      } else if (k === 'm') {
        setDriveMode((prev) => {
          const order: DriveModeName[] = ['GT', 'SPORT', 'SPORT+', 'TRACK'];
          return order[(order.indexOf(prev) + 1) % order.length];
        });
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || e.key === 'ArrowUp') driveInputRef.current.throttle = false;
      else if (k === 's' || e.key === 'ArrowDown') driveInputRef.current.brake = false;
      else if (k === 'a' || e.key === 'ArrowLeft') driveInputRef.current.left = false;
      else if (k === 'd' || e.key === 'ArrowRight') driveInputRef.current.right = false;
      else if (e.key === ' ') driveInputRef.current.boost = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      driveInputRef.current = { throttle: false, brake: false, left: false, right: false, boost: false };
    };
  }, [mode, handleManualShift, handleTriggerLaunch]);

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
  }, [nightLights]);

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

    // Proving Ground twilight asphalt circuit (shown only in Drive mode)
    const track = buildDrivingTrack();
    trackRef.current = track;
    scene.add(track.group);

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
    studio.props.push(brassRing, innerTick, streakLines, track.group);

    let onScreen = true;
    const io = new IntersectionObserver(([entry]) => (onScreen = entry.isIntersecting), { threshold: 0.01 });
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

      if (curMode === 'drive' && car3d) {
        // ---- REAL-TIME PROVING GROUND DRIVING PHYSICS ----
        const activeCarObj = carRef.current;
        const bp = car3d.blueprint;
        const phys = DRIVE_PHYSICS_PROFILES[activeCarObj.id] || DRIVE_PHYSICS_PROFILES.valkyrie;
        const inp = driveInputRef.current;
        const sim = driveSimRef.current;

        const throttle = inp.throttle ? 1 : 0;
        const brake = inp.brake ? 1 : 0;
        const steerTarget = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
        sim.steer += (steerTarget - sim.steer) * Math.min(1, dt * 6.5);

        const kersActive = phys.hasHybridBoost && inp.boost && sim.kersPct > 2 && throttle > 0.1;
        if (kersActive) {
          sim.kersPct = Math.max(0, sim.kersPct - dt * 22);
        } else if (brake > 0.1 && sim.speedMps > 4) {
          sim.kersPct = Math.min(100, sim.kersPct + dt * 28); // Regenerative braking recovery
        } else {
          sim.kersPct = Math.min(100, sim.kersPct + dt * 6);
        }

        // Start audio automatically on first throttle press if driveAudioOn
        if ((throttle > 0.1 || sim.launchArmed) && driveAudioRef.current && !sim.audioStarted) {
          engineAudio.triggerColdStart(activeCarObj.topology, phys.idleRpm);
          sim.audioStarted = true;
        }

        const modeMultiplier =
          driveModeRef.current === 'TRACK'
            ? 1.06
            : driveModeRef.current === 'SPORT+'
              ? 1.02
              : driveModeRef.current === 'SPORT'
                ? 0.94
                : 0.84;

        // Power-to-weight longitudinal acceleration calibrated to real Aston Martin 0-100 & Vmax
        const vmaxMps = activeCarObj.specs.topSpeedKmh / 3.6;
        const p2w = (activeCarObj.specs.powerPS * (kersActive ? 1.15 : 1.0)) / Math.max(1000, activeCarObj.specs.weightKg);
        const gearFactor = 0.55 + (phys.gearRatios[sim.gear - 1] || 1) * 0.22;
        const maxAccel = Math.min(13.8, p2w * 15.2 * modeMultiplier * Math.min(1.35, gearFactor));
        const aeroDragAccel = 0.00058 * activeCarObj.aero.dragCd * sim.speedMps * sim.speedMps;
        const rollResist = sim.speedMps > 0.1 ? 0.32 : 0;
        const brakeAccel = brake * phys.brakeDecelG * 9.81;

        let netAccel = 0;
        if (sim.launchArmed && throttle < 0.1) {
          // Hold launch RPM at 45% redline until throttle is pressed
          sim.rpm += (phys.redlineRpm * 0.48 - sim.rpm) * Math.min(1, dt * 10);
          sim.speedMps = 0;
        } else {
          if (sim.launchArmed && throttle > 0.1) {
            sim.launchArmed = false;
            sim.runStartTime = now;
            sim.zeroTo100Sec = null;
            sim.zeroTo200Sec = null;
          }
          if (throttle > 0.1 && sim.speedMps < 0.8 && sim.runStartTime === null) {
            sim.runStartTime = now;
            sim.zeroTo100Sec = null;
            sim.zeroTo200Sec = null;
          }

          const speedHeadroom = Math.max(0, 1 - Math.pow(sim.speedMps / vmaxMps, 2.4));
          netAccel = throttle * maxAccel * speedHeadroom - brakeAccel - aeroDragAccel - rollResist;
          sim.speedMps = Math.max(0, Math.min(vmaxMps, sim.speedMps + netAccel * dt));
        }

        const speedKmhNow = sim.speedMps * 3.6;
        if (speedKmhNow > sim.peakSpeedKmh) sim.peakSpeedKmh = speedKmhNow;

        // 0-100 & 0-200 stopwatch telemetry
        if (sim.runStartTime !== null) {
          if (sim.zeroTo100Sec === null && speedKmhNow >= 100) {
            sim.zeroTo100Sec = (now - sim.runStartTime) / 1000;
          }
          if (sim.zeroTo200Sec === null && speedKmhNow >= 200) {
            sim.zeroTo200Sec = (now - sim.runStartTime) / 1000;
          }
          if (speedKmhNow < 1 && throttle < 0.05) {
            sim.runStartTime = null;
          }
        }

        // Gear & RPM calculation
        sim.shiftCooldown = Math.max(0, sim.shiftCooldown - dt);
        const gearRatio = phys.gearRatios[sim.gear - 1] || 1;
        const wheelRpm = (sim.speedMps / (2 * Math.PI * phys.tireRadiusM)) * 60;
        const coupledRpm = wheelRpm * gearRatio * phys.finalDrive;
        const targetRpm = Math.max(
          phys.idleRpm + throttle * 1150,
          Math.min(phys.redlineRpm, coupledRpm)
        );
        sim.rpm += (targetRpm - sim.rpm) * Math.min(1, dt * 12);

        // Automatic DCT/Ricardo shifts when not in Manual mode
        if (!manualShiftRef.current && sim.shiftCooldown <= 0) {
          if (sim.rpm >= phys.shiftUpRpm && sim.gear < phys.gearRatios.length && throttle > 0.1) {
            sim.gear += 1;
            sim.shiftCooldown = 0.28;
            if (driveAudioRef.current && sim.audioStarted) {
              engineAudio.triggerGearShift('up', sim.rpm);
            }
          } else if (sim.rpm < phys.redlineRpm * 0.34 && sim.gear > 1 && sim.speedMps > 2) {
            sim.gear -= 1;
            sim.shiftCooldown = 0.28;
            if (driveAudioRef.current && sim.audioStarted) {
              engineAudio.triggerGearShift('down', sim.rpm);
            }
          }
        }

        // Lateral lane position & cornering G-force
        const lateralVel = sim.steer * Math.min(4.8, sim.speedMps * 0.14);
        sim.laneX = THREE.MathUtils.clamp(sim.laneX + lateralVel * dt, -3.3, 3.3);
        const latG = sim.steer * Math.min(phys.maxLateralG, (sim.speedMps / 42) * phys.maxLateralG * 0.65);
        const longG = netAccel / 9.81;

        // Brake core thermal model (glows orange-red under repeated hard stops!)
        if (brake > 0.1 && speedKmhNow > 25) {
          sim.brakeTempC = Math.min(860, sim.brakeTempC + dt * (115 + speedKmhNow * 0.95));
        } else {
          const cooling = 28 + speedKmhNow * 0.16;
          sim.brakeTempC = Math.max(145, sim.brakeTempC - dt * cooling);
        }

        // Push live telemetry to 3D car, track, and Web Audio synthesizer
        const stiffness = driveModeRef.current === 'TRACK' ? 0.65 : driveModeRef.current === 'GT' ? 1.18 : 0.88;
        const pitchRad = THREE.MathUtils.clamp(longG * 0.022 * stiffness, -0.032, 0.026);
        const rollRad = THREE.MathUtils.clamp(latG * 0.028 * stiffness, -0.042, 0.042);
        const brakeGlowNorm = THREE.MathUtils.clamp((sim.brakeTempC - 260) / 360, 0, 2.0);

        car3d.setActiveAero(speedKmhNow);
        car3d.setBrakeThermal(brakeGlowNorm);
        car3d.setDriveDynamics(pitchRad, rollRad, brake, sim.rpm / phys.redlineRpm);
        car3d.update(dt);

        track.update(dt, speedKmhNow, sim.steer, sim.laneX, nightLightsRef.current);

        if (driveAudioRef.current && sim.audioStarted) {
          engineAudio.setDriveState(sim.rpm, Math.max(0.12, throttle), speedKmhNow, kersActive);
        }

        // Dynamic Drive Camera (Chase / Cockpit / Bonnet) with speed FOV warp & subtle corner lean
        const speedNorm = Math.min(1, speedKmhNow / activeCarObj.specs.topSpeedKmh);
        const camMode = driveCamRef.current;
        if (camMode === 'cockpit') {
          const headShake = Math.sin(now * 0.045) * 0.002 * speedNorm;
          camera.position.set(
            bp.driverX + sim.steer * 0.035,
            bp.eyeY + 0.05 + headShake - pitchRad * 0.22,
            bp.eyeZ - 0.14 + longG * 0.015
          );
          camera.lookAt(bp.driverX + sim.steer * 0.95, bp.eyeY - 0.12, -22);
          camera.fov = 62 + speedNorm * 11;
        } else if (camMode === 'bonnet') {
          camera.position.set(sim.steer * 0.05, bp.windscreenBottomY + 0.14, bp.windscreenBottomZ - 0.12);
          camera.lookAt(sim.steer * 1.4, bp.windscreenBottomY - 0.05, -24);
          camera.fov = 56 + speedNorm * 14;
        } else {
          // Dynamic Trailing Chase 3D Cam framed cleanly above the center radial tachometer
          const chaseDist = 5.45 + speedNorm * 0.85 + (longG > 0 ? longG * 0.2 : 0);
          const targetCamX = sim.steer * 1.15;
          const targetCamY = 1.88 + (bp.H - 1.15) * 0.45 - speedNorm * 0.1;
          camera.position.lerp(new THREE.Vector3(targetCamX, targetCamY, chaseDist), Math.min(1, dt * 6));
          camera.lookAt(sim.steer * 0.65, bp.H * 0.34, -8.5);
          camera.fov = 43 + speedNorm * 14;
        }
        camera.updateProjectionMatrix();

        // Sync telemetry HUD at ~22 Hz to keep React ultra-smooth
        if (now - sim.lastUiSync > 45) {
          sim.lastUiSync = now;
          const sf = Math.min(1, Math.pow(speedKmhNow / activeCarObj.aero.downforceRefKmh, 2));
          setDriveTelemetry({
            speedKmh: speedKmhNow,
            rpm: sim.rpm,
            gear: sim.gear,
            throttle,
            brake,
            steer: sim.steer,
            latG,
            longG,
            downforceKg: Math.round(activeCarObj.aero.maxDownforceKg * sf),
            brakeTempC: Math.round(sim.brakeTempC),
            kersPct: sim.kersPct,
            kersActive,
            zeroTo100Sec: sim.zeroTo100Sec,
            zeroTo200Sec: sim.zeroTo200Sec,
            peakSpeedKmh: sim.peakSpeedKmh,
            launchArmed: sim.launchArmed,
          });
        }
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
      car3dRef.current?.dispose();
      car3dRef.current = null;
      track.dispose();
      trackRef.current = null;
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
        incoming.setInteriorMode(
          modeRef.current === 'drive' ? driveCamRef.current === 'cockpit' : pov.zone === 'interior'
        );

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
            if (modeRef.current !== 'drive') flyTo(pov, 0.62);
            setLoadingCar(false);
            studio.setFade(0, 1.25);
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
      <div className={`studio-viewport ${mode === 'drive' ? 'drive-viewport' : ''}`}>
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

        {/* Proving Ground Driving Telemetry Instrument Cluster Overlay */}
        {mode === 'drive' && (
          <DriveClusterOverlay
            car={car}
            physics={activePhysics}
            telemetry={driveTelemetry}
            driveMode={driveMode}
            manualShift={manualShift}
          />
        )}
      </div>

      {/* Bottom Dock: 8 POVs OR CFD Speed Slider OR Proving Ground Interactive Driver Deck */}
      {mode === 'drive' ? (
        <DriveControlDeck
          car={car}
          physics={activePhysics}
          telemetry={driveTelemetry}
          driveCamera={driveCamera}
          driveMode={driveMode}
          manualShift={manualShift}
          audioOn={driveAudioOn}
          onCameraChange={setDriveCamera}
          onModeChange={(m) => {
            engineAudio.playSwitchClick(false);
            setDriveMode(m);
            engineAudio.setExhaustValve(m === 'TRACK' || m === 'SPORT+' ? 'TRACK' : m === 'SPORT' ? 'SPORT' : 'QUIET');
          }}
          onToggleManual={() => {
            engineAudio.playSwitchClick(false);
            setManualShift((v) => !v);
          }}
          onToggleAudio={() => {
            setDriveAudioOn((v) => {
              const next = !v;
              if (!next) {
                engineAudio.stop();
                driveSimRef.current.audioStarted = false;
              }
              return next;
            });
          }}
          onShift={handleManualShift}
          onTriggerLaunch={handleTriggerLaunch}
          onResetRun={handleResetDriveRun}
          onControlInput={(control, active) => {
            driveInputRef.current[control] = active;
          }}
        />
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
