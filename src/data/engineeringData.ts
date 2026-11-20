export interface QWheelFinish {
  id: string;
  name: string;
  finishType: string;
  hex: string;
  metalness: number;
  roughness: number;
  priceGbp: number;
}

export type StudioMoodId = 'gaydon' | 'dusk' | 'night' | 'champagne';

export interface StudioMood {
  id: StudioMoodId;
  label: string;
  subtitle: string;
  accentHex: string;
}

export interface PowertrainDeepSpec {
  codeName: string;
  architecture: string;
  displacementCc: string;
  boreStrokeMm: string;
  compressionRatio: string;
  firingOrder: string;
  valvetrain: string;
  induction: string;
  lubrication: string;
  hybridSystem: string;
  transmissionDetail: string;
  differential: string;
  specificOutput: string;
  coolingDetail: string;
  basePriceGbp: number;
}

export interface XrayPartSpec {
  id: string;
  code: string;
  title: string;
  subsystem: string;
  metric: string;
  material: string;
  anchor: [number, number, number];
  camOffset: [number, number, number];
  description: string;
}

export type SwitchgearActionType =
  | 'ignition'
  | 'driveMode'
  | 'exhaust'
  | 'damper'
  | 'esp'
  | 'kers'
  | 'paddles'
  | 'lights';

export interface SwitchgearControlSpec {
  id: string;
  code: string;
  name: string;
  shortLabel: string;
  zone: 'wheel' | 'bridge' | 'console' | 'pillar';
  material: string;
  actuationForce: string;
  tactileNote: string;
  actionType: SwitchgearActionType;
  anchor: [number, number, number];
  modes?: string[];
  description: string;
}

export interface DrivePhysicsProfile {
  gearRatios: number[];
  finalDrive: number;
  idleRpm: number;
  shiftUpRpm: number;
  redlineRpm: number;
  peakPowerRpm: number;
  tireRadiusM: number;
  maxLateralG: number;
  brakeDecelG: number;
  hasHybridBoost: boolean;
  hasTurbo: boolean;
  shiftCutMs: number;
  driveModes: ('GT' | 'SPORT' | 'SPORT+' | 'TRACK')[];
}

export const Q_WHEEL_FINISHES: QWheelFinish[] = [
  {
    id: 'satin-titanium',
    name: 'Satin Titanium Forged',
    finishType: 'CNC Forged Satin Monoblock',
    hex: '#b3bab8',
    metalness: 0.9,
    roughness: 0.24,
    priceGbp: 0,
  },
  {
    id: 'diamond-turned',
    name: 'Diamond-Turned Billet',
    finishType: 'Machined Face / Obsidian Pocket',
    hex: '#d8dfdd',
    metalness: 0.96,
    roughness: 0.14,
    priceGbp: 4500,
  },
  {
    id: 'gloss-obsidian',
    name: 'Gloss Obsidian Black',
    finishType: 'Triple-Coat Jet Lacquer',
    hex: '#1c201f',
    metalness: 0.78,
    roughness: 0.16,
    priceGbp: 3800,
  },
  {
    id: 'satin-bronze',
    name: 'Q Satin Savile Bronze',
    finishType: 'Anodized Champagne-Bronze Alloy',
    hex: '#9d8259',
    metalness: 0.88,
    roughness: 0.26,
    priceGbp: 6200,
  },
];

export const STUDIO_MOODS: StudioMood[] = [
  {
    id: 'gaydon',
    label: 'Gaydon Studio',
    subtitle: 'Neutral Warwickshire Calibration Cyclorama',
    accentHex: '#c8a96e',
  },
  {
    id: 'dusk',
    label: 'Silverstone Dusk',
    subtitle: 'Amber Track Horizon & Cool Zenith Fill',
    accentHex: '#e39c58',
  },
  {
    id: 'night',
    label: 'Monaco Night',
    subtitle: 'High-Contrast Nocturnal Headlamp Pool',
    accentHex: '#7fb5ff',
  },
  {
    id: 'champagne',
    label: 'Q Atelier Gold',
    subtitle: 'Warm Bespoke Concours Gallery Lighting',
    accentHex: '#d9bc82',
  },
];

export const POWERTRAIN_DEEP_SPECS: Record<string, PowertrainDeepSpec> = {
  valkyrie: {
    codeName: 'Cosworth RA // AM-RB 001',
    architecture: '65° Naturally Aspirated V12 (Structural Stressed Member)',
    displacementCc: '6,498 cc',
    boreStrokeMm: '98.0 × 71.8 mm',
    compressionRatio: '13.5 : 1',
    firingOrder: '1–7–5–11–3–9–6–12–2–8–4–10',
    valvetrain: '48-Valve Gear-Driven DOHC, Titanium Conrods & F1-Spec Pistons',
    induction: 'Individual Throttle Bodies (12× ITB) + Roof Ram-Air Plenum',
    lubrication: 'Multi-Stage Dry Sump (206 kg Engine Dry Mass)',
    hybridSystem: 'Rimac KERS Rear E-Motor (+161 PS / +280 Nm) + Integral Torque Fill',
    transmissionDetail: '7-Speed Ricardo Automated Single-Clutch Paddle-Shift',
    differential: 'Motorsport Electro-Hydraulic Limited-Slip Differential',
    specificOutput: '156.2 PS/L (ICE) · 181.0 PS/L Combined',
    coolingDetail: 'Twin Sidepod Oblique Water Radiators + Underfloor Oil Coolers',
    basePriceGbp: 2650000,
  },
  valhalla: {
    codeName: 'AM-V8 // Flat-Plane PHEV',
    architecture: '90° Hot-V Flat-Plane Crank Twin-Turbo V8 + Triple E-Motor AWD',
    displacementCc: '3,982 cc',
    boreStrokeMm: '83.0 × 92.0 mm',
    compressionRatio: '8.6 : 1',
    firingOrder: '1–8–2–7–4–5–3–6 (180° Flat-Plane)',
    valvetrain: '32-Valve DOHC, Bespoke High-Lift Cams & Exhaust Manifolds',
    induction: 'Twin-Scroll Monoscroll-Fed Hot-V Turbos + Roof Snorkel Plenum',
    lubrication: 'Dry Sump Motorsport Scavenge System',
    hybridSystem: '2× Front Axial-Flux E-Motors (Torque Vectoring + EV Reverse) + P2.5 E-Motor (+251 PS)',
    transmissionDetail: '8-Speed Bespoke Dual-Clutch Transaxle (Zero Mechanical Reverse Gear)',
    differential: 'Electronic Rear E-Diff + Active Front Axle Torque Vectoring',
    specificOutput: '207.9 PS/L (ICE) · 271.0 PS/L Combined',
    coolingDetail: 'Dihedral Door Air-Curtain Side Intercoolers + Central Battery Chiller',
    basePriceGbp: 850000,
  },
  vanquish: {
    codeName: 'AML 5.2T // Reinforced V12',
    architecture: '60° Twin-Turbocharged Front-Mid V12',
    displacementCc: '5,204 cc',
    boreStrokeMm: '89.0 × 69.7 mm',
    compressionRatio: '9.3 : 1',
    firingOrder: '1–7–5–11–3–9–6–12–2–8–4–10',
    valvetrain: '48-Valve DOHC, Reprofiled Camshafts, Redesigned Cylinder Heads & Ports',
    induction: '+15% Higher-Speed Reduced-Inertia Twin Turbos + Boost Reserve Tech',
    lubrication: 'High-Capacity Wet Sump with Baffled Motorsport Oil Pan',
    hybridSystem: 'Pure Internal Combustion — Zero Hybrid Mass Penalty',
    transmissionDetail: '8-Speed ZF 8HP95 Rear-Mounted Transaxle via Carbon Torque Tube',
    differential: 'Electronic Rear Differential (E-Diff, 0–100% Lock in 135 ms)',
    specificOutput: '160.5 PS/L (Highest Specific Output of Any Aston Martin V12)',
    coolingDetail: '+13% Enlarged Vaned Grille + F1-Inspired Carbon Bonnet Thermos-Louvres',
    basePriceGbp: 334000,
  },
  db12: {
    codeName: 'AM-V8 // Super Tourer',
    architecture: '90° Hand-Built Hot-V Twin-Turbocharged V8',
    displacementCc: '3,982 cc',
    boreStrokeMm: '83.0 × 92.0 mm',
    compressionRatio: '8.6 : 1',
    firingOrder: '1–5–4–2–6–3–7–8',
    valvetrain: '32-Valve DOHC with Revised Cam Profiles & Optimized Compression',
    induction: 'Larger-Diameter Twin-Scroll Turbochargers inside the Hot-Vee',
    lubrication: 'High-Lateral-G Wet Sump + Auxiliary Low-Temp Charge Cooler Loop',
    hybridSystem: 'Pure Internal Combustion with 3.083:1 Shorter Final Drive',
    transmissionDetail: '8-Speed ZF Rear-Mounted Automatic Transaxle via Carbon Propshaft',
    differential: 'First-Ever DB Electronic Rear Differential (E-Diff, 135 ms Lock)',
    specificOutput: '170.8 PS/L (+34% Output Over Preceding DB11 V8)',
    coolingDetail: '+56% Open Grille Aperture + Twin Auxiliary Low-Temp Radiators',
    basePriceGbp: 185000,
  },
};

export const XRAY_ENGINEERING_PINS: Record<string, XrayPartSpec[]> = {
  valkyrie: [
    {
      id: 'valk-eng',
      code: 'X01 // COSWORTH V12',
      title: 'Cosworth 6.5L 65° Naturally Aspirated V12',
      subsystem: 'Stressed Structural Powerplant',
      metric: '1,015 PS ICE · 11,100 RPM',
      material: 'CNC Billet Alloy Block & Titanium Conrods',
      anchor: [0, 0.56, 0.88],
      camOffset: [-2.1, 1.35, 1.85],
      description:
        'Acts as a fully stressed structural element linking the carbon MonoCell directly to the rear suspension. Weighs just 206 kg dry with zero belt-driven ancillaries.',
    },
    {
      id: 'valk-kers',
      code: 'X02 // RIMAC KERS',
      title: 'Rimac Hybrid KERS Pack & E-Motor',
      subsystem: 'Torque-Fill Kinetic Recovery',
      metric: '+161 PS / +280 Nm Boost',
      material: 'High-Discharge Li-Ion Cell Array',
      anchor: [0, 0.44, 0.34],
      camOffset: [-2.2, 1.15, 0.35],
      description:
        'Mounted tightly behind the carbon bulkhead to centralize polar moment of inertia, delivering instantaneous torque-fill between shifts and reverse propulsion.',
    },
    {
      id: 'valk-gbx',
      code: 'X03 // RICARDO 7-SPD',
      title: '7-Speed Ricardo Automated Single-Clutch',
      subsystem: 'Magnesium Casing Transaxle',
      metric: '40 ms Motorsport Shift Cut',
      material: 'Cast Magnesium Housing',
      anchor: [0, 0.36, 1.56],
      camOffset: [2.0, 1.05, 2.5],
      description:
        'Ultra-compact sequential-architecture casing carries the rear wishbone pickups directly, keeping the enormous underbody Venturi tunnels unobstructed.',
    },
    {
      id: 'valk-susp',
      code: 'X04 // PUSHROD AERO',
      title: 'Inboard Active Pushrod & Torsion Bar Suspension',
      subsystem: 'Multimatic Ride-Height Control',
      metric: '68 mm Track Ride Height',
      material: 'Aerofoil Carbon Wishbones & Titanium Bellcranks',
      anchor: [-0.42, 0.42, -1.32],
      camOffset: [-2.15, 0.98, -2.1],
      description:
        'Horizontal inboard dampers and active hydraulic heave control maintain millimetre-precise Venturi floor attitude up to 1,100 kg of aerodynamic load.',
    },
    {
      id: 'valk-exh',
      code: 'X05 // TOP EXHAUST',
      title: 'Inconel & Titanium Top-Exit Headers',
      subsystem: 'Equal-Length 6-into-1 Manifolds',
      metric: '115 dB F1 Harmonic Scream',
      material: '0.8 mm Thin-Wall Inconel 625',
      anchor: [0, 0.72, 1.24],
      camOffset: [1.95, 1.42, 2.25],
      description:
        'Short equal-length primary runners exit immediately aft of the roof snorkel to preserve clean high-velocity airflow out of the rear diffuser.',
    },
    {
      id: 'valk-brake',
      code: 'X06 // CCM-R BRAKES',
      title: 'Alcon 420 mm F / 385 mm R Carbon-Ceramic',
      subsystem: '6-Piston Monoblock Callipers',
      metric: 'Up to 1,000°C Thermal Ceiling',
      material: 'F1-Grade Carbon-Silicon-Carbide Matrix',
      anchor: [-0.82, 0.34, -1.36],
      camOffset: [-2.2, 0.65, -1.55],
      description:
        'Bespoke lightweight Alcon callipers paired with carbon aero-blade wheel covers extract heat directly out of the wheel well.',
    },
  ],
  valhalla: [
    {
      id: 'valh-v8',
      code: 'X01 // FLAT-PLANE V8',
      title: '4.0L Hot-V Flat-Plane Twin-Turbo V8',
      subsystem: 'Bespoke Dry-Sump Mid Engine',
      metric: '828 PS ICE · 207.9 PS/L',
      material: 'Flat-Plane Forged Crank & Hot-V Turbos',
      anchor: [0, 0.54, 0.88],
      camOffset: [-2.15, 1.35, 1.85],
      description:
        'Aston Martin’s most potent V8 ever built: flat-plane 180° crankshaft, dry-sump lubrication, and twin-scroll hot-V turbos fed by the carbon roof snorkel.',
    },
    {
      id: 'valh-front-e',
      code: 'X02 // FRONT E-AXLE',
      title: 'Dual Front Axial-Flux Electric Motors',
      subsystem: 'Active AWD Torque Vectoring',
      metric: 'Independent L/R Front Drive + EV Mode',
      material: 'High-Power-Density Copper Axial Stators',
      anchor: [0, 0.34, -1.34],
      camOffset: [-2.15, 1.0, -2.25],
      description:
        'Two independent axial-flux motors on the front axle deliver instantaneous torque vectoring into apexes and silent 130 km/h pure-EV cruising.',
    },
    {
      id: 'valh-batt',
      code: 'X03 // HV TUNNEL PACK',
      title: 'Central Spine High-Voltage PHEV Battery',
      subsystem: 'Liquid-Cooled Dielectric Pack',
      metric: '14 km Pure EV · Continuous Track Discharge',
      material: 'Structural Carbon-Encased Module',
      anchor: [0, 0.3, 0.1],
      camOffset: [-2.35, 1.15, 0.15],
      description:
        'Housed along the central spine of the autoclaved carbon tub for minimal polar inertia, supplying 251 PS of combined electric boost across all three e-motors.',
    },
    {
      id: 'valh-dct',
      code: 'X04 // 8-SPD DCT + P2.5',
      title: '8-Speed DCT with Integrated E-Motor',
      subsystem: 'Zero-Reverse-Gear Transaxle',
      metric: '1,079 PS / 1,100 Nm Combined',
      material: 'Lightweight Die-Cast Alloy Case',
      anchor: [0, 0.36, 1.5],
      camOffset: [2.1, 1.05, 2.45],
      description:
        'Eliminates the mechanical reverse gear entirely (front e-motors handle reversing) while integrating a third e-motor for starter/generator and torque fill.',
    },
    {
      id: 'valh-push',
      code: 'X05 // F1 PUSHRODS',
      title: 'Inboard Front Pushrod & Bilstein DTX',
      subsystem: 'Motorsport Suspension Kinematics',
      metric: '600+ kg Active Aero Load Rated',
      material: 'CNC Aluminium Uprights & Carbon Links',
      anchor: [-0.46, 0.42, -1.34],
      camOffset: [-2.1, 0.95, -1.95],
      description:
        'Inboard horizontal springs and dampers clear the front underbody airflow path, feeding clean high-energy air straight into the Venturi floor.',
    },
    {
      id: 'valh-exh',
      code: 'X06 // TOP-EXIT EXHAUST',
      title: 'Top-Exit Titanium Exhaust & Active T-Wing',
      subsystem: 'Thermal Extraction & Rear Aero',
      metric: '255 mm Hydraulic Rear Wing',
      material: 'Heat-Tinted Titanium Tubing',
      anchor: [0, 0.72, 1.48],
      camOffset: [2.0, 1.38, 2.4],
      description:
        'Short top-exit pipes vent hot exhaust gases above the rear deck while keeping the aggressive lower rear diffuser pure and undisturbed.',
    },
  ],
  vanquish: [
    {
      id: 'vanq-v12',
      code: 'X01 // 5.2L V12',
      title: '5.2L Reinforced Twin-Turbo 60° V12',
      subsystem: 'Flagship Front-Mid Powerplant',
      metric: '835 PS · 1,000 Nm · Boost Reserve',
      material: 'Strengthened Block, Conrods & Billet Cams',
      anchor: [0, 0.62, -1.25],
      camOffset: [-2.25, 1.25, -2.35],
      description:
        'Extensively re-engineered with stronger cylinder block, new cams, +15% higher-speed low-inertia turbos, and Boost Reserve for immediate throttle punch.',
    },
    {
      id: 'vanq-tube',
      code: 'X02 // CARBON TUBE',
      title: 'Carbon-Fibre Propshaft & Alloy Torque Tube',
      subsystem: '50/50 Front-Rear Balance Link',
      metric: '+75% Lateral Chassis Stiffness',
      material: 'Filament-Wound Carbon Fibre Shaft',
      anchor: [0, 0.28, 0.05],
      camOffset: [-2.4, 1.0, 0.2],
      description:
        'Rigidly links the front-mid V12 to the rear-mounted ZF transaxle, achieving ideal 50:50 static mass distribution across the 2,885 mm wheelbase.',
    },
    {
      id: 'vanq-ediff',
      code: 'X03 // ZF + E-DIFF',
      title: '8-Speed ZF Transaxle & Electronic Rear Diff',
      subsystem: 'Rear-Mounted Gearbox Assembly',
      metric: '0–100% Lock in 135 ms',
      material: 'Cast Aluminium Transaxle Housing',
      anchor: [0, 0.36, 1.42],
      camOffset: [2.15, 1.0, 2.4],
      description:
        'Mounted over the rear axle for balanced handling, paired with an ultra-fast E-Diff integrated directly into the ESP Corner Braking algorithm.',
    },
    {
      id: 'vanq-dtx',
      code: 'X04 // BILSTEIN DTX',
      title: 'Double-Wishbone Front & Bilstein DTX Dampers',
      subsystem: 'Adaptive Grand Touring Chassis',
      metric: '500% Damping Bandwidth Increase',
      material: 'Forged Aluminium Arms & Stiffer Engine Brace',
      anchor: [-0.62, 0.42, -1.35],
      camOffset: [-2.1, 0.92, -1.95],
      description:
        'Delivers effortless transcontinental suppleness in GT mode and razor-sharp body control in Sport+ with thicker anti-roll bars and stiffer cross-bracing.',
    },
    {
      id: 'vanq-ccb',
      code: 'X05 // STANDARD CCB',
      title: '410 mm F / 360 mm R Carbon-Ceramic Brakes',
      subsystem: 'Standard Flagship Braking Suite',
      metric: '-27 kg Unsprung Mass vs Cast Iron',
      material: 'Carbon-Ceramic Composite Rotors',
      anchor: [-0.88, 0.36, -1.38],
      camOffset: [-2.2, 0.65, -1.6],
      description:
        'Fitted as standard on Vanquish with dedicated front bumper cooling ducts to resist thermal fade up to 800°C during repeated 345 km/h stops.',
    },
    {
      id: 'vanq-exh',
      code: 'X06 // QUAD TITANIUM',
      title: 'Quad-Tailpipe Stainless / Optional Titanium Exhaust',
      subsystem: 'Active Valve V12 Acoustic System',
      metric: '-10.5 kg with Titanium System',
      material: 'Thin-Wall Titanium Acoustic Piping',
      anchor: [0, 0.28, 2.1],
      camOffset: [2.05, 0.85, 2.95],
      description:
        'Newly developed muffler geometry and electronic bypass valves release an unmistakable twelve-cylinder crescendo on demand.',
    },
  ],
  db12: [
    {
      id: 'db12-v8',
      code: 'X01 // HAND-BUILT V8',
      title: '4.0L Hand-Built Hot-V Twin-Turbo V8',
      subsystem: 'Super Tourer Powerplant',
      metric: '680 PS · 800 Nm (+34% vs DB11)',
      material: 'Sand-Cast Alloy Block & Larger Turbos',
      anchor: [0, 0.56, -1.05],
      camOffset: [-2.2, 1.25, -2.1],
      description:
        'Extensively reworked by Aston Martin engineers with modified cam profiles, optimized compression, larger turbochargers, and massively expanded cooling.',
    },
    {
      id: 'db12-cool',
      code: 'X02 // +56% COOLING',
      title: 'Expanded Charge-Air & Low-Temp Radiator Array',
      subsystem: 'Thermal Management Core',
      metric: '+56% Open Grille Aperture',
      material: 'Twin Auxiliary Aluminium Cores',
      anchor: [0, 0.44, -1.9],
      camOffset: [-1.85, 0.9, -2.85],
      description:
        'Two additional auxiliary coolers sit behind the signature six-vane grille to keep intake charge temperatures ice-cold under sustained 325 km/h loads.',
    },
    {
      id: 'db12-tube',
      code: 'X03 // CARBON SHAFT',
      title: 'Carbon-Fibre Propshaft & Bonded Alloy Spine',
      subsystem: '48/52 Front-Rear Mass Distribution',
      metric: '+7% Global Torsional Rigidity',
      material: 'Carbon Composite Drive Tube',
      anchor: [0, 0.28, 0.05],
      camOffset: [-2.35, 1.0, 0.15],
      description:
        'Connects the front-mid V8 to the rear transaxle through the bonded aluminium backbone with revised front crossmember and rear bulkhead stiffening.',
    },
    {
      id: 'db12-ediff',
      code: 'X04 // FIRST DB E-DIFF',
      title: '8-Speed ZF Transaxle & Electronic Rear Diff',
      subsystem: 'Shorter 3.083:1 Final Drive',
      metric: '0–100% Lock in Milliseconds',
      material: 'Electronic Multi-Plate Clutch Pack',
      anchor: [0, 0.36, 1.38],
      camOffset: [2.1, 1.0, 2.35],
      description:
        'The first DB model ever fitted with an Electronic Rear Differential, paired with a shortened final drive ratio for ferocious in-gear punch.',
    },
    {
      id: 'db12-dtx',
      code: 'X05 // BILSTEIN DTX',
      title: 'Next-Gen Bilstein DTX Adaptive Dampers',
      subsystem: '500% Wider Force Distribution',
      metric: 'GT / Sport / Sport+ Calibration',
      material: 'Forged Double Wishbones + Multi-Link Rear',
      anchor: [-0.62, 0.42, -1.32],
      camOffset: [-2.05, 0.92, -1.9],
      description:
        'Independent compression and rebound valve control delivers limousine composure in GT mode and razor-sharp apex response in Sport+.',
    },
    {
      id: 'db12-ccb',
      code: 'X06 // 400MM BRAKES',
      title: '400 mm F / 360 mm R Cast-Iron / CCB Option',
      subsystem: 'Dedicated Cooling Ducts + AML Michelin',
      metric: '-27 kg Unsprung Saving with CCB',
      material: 'Drilled Vent Discs & 6-Piston Callipers',
      anchor: [-0.86, 0.36, -1.34],
      camOffset: [-2.15, 0.65, -1.55],
      description:
        'Paired with bespoke Michelin Pilot Sport 5 S acoustic-foam tyres engineered exclusively to Aston Martin AML compound standards.',
    },
  ],
};

export const COCKPIT_SWITCHGEAR: Record<string, SwitchgearControlSpec[]> = {
  valkyrie: [
    {
      id: 'vk-start',
      code: 'SW // 01',
      name: 'Steering-Mounted Ignition & Pit-Limiter',
      shortLabel: 'IGNITION',
      zone: 'wheel',
      material: 'Anodized Billet Push-Button on Carbon Yoke',
      actuationForce: '4.8 N Motorsport Click',
      tactileNote: 'Positive tactile detent operable with racing gloves',
      actionType: 'ignition',
      anchor: [-0.25, 0.65, -0.33],
      description:
        'Fires the 6.5L Cosworth V12 via the rear Rimac e-motor — zero traditional key barrel or dashboard stalks inside the LMP1 carbon tub.',
    },
    {
      id: 'vk-mode',
      code: 'SW // 02',
      name: 'F1 Thumb Rotary Drive-Mode Selector',
      shortLabel: 'MODE DIAL',
      zone: 'wheel',
      material: 'Knurled Titanium 12-Position Thumb Wheel',
      actuationForce: '3.2 N Indexed Detent',
      tactileNote: 'Maps active ride height, Venturi floor, and throttle map',
      actionType: 'driveMode',
      anchor: [-0.36, 0.62, -0.32],
      modes: ['GT', 'SPORT', 'SPORT+', 'TRACK'],
      description:
        'Thumb-indexed rotary switches between Urban, Sport, and Track modes, dropping ride height and priming active Multimatic hydraulic suspension.',
    },
    {
      id: 'vk-kers',
      code: 'SW // 03',
      name: 'Rimac KERS Instantaneous Overtake Boost',
      shortLabel: 'KERS BOOST',
      zone: 'wheel',
      material: 'Lime-Anodized Guarded Thumb Trigger',
      actuationForce: '5.5 N Guarded Press',
      tactileNote: 'Deploys full +161 PS / +280 Nm electric supplement',
      actionType: 'kers',
      anchor: [-0.14, 0.62, -0.32],
      description:
        'Triggers maximum Rimac KERS electrical deployment on demand for instant torque-fill and blistering exit acceleration out of slow corners.',
    },
    {
      id: 'vk-paddles',
      code: 'SW // 04',
      name: 'Single-Piece Rocker Carbon Shift Paddles',
      shortLabel: 'PADDLES',
      zone: 'wheel',
      material: 'Autoclaved Dry-Weave Carbon + Hall Sensors',
      actuationForce: '6.2 N Magnetic Snap',
      tactileNote: 'Push-pull rocker allows upshift/downshift with one hand',
      actionType: 'paddles',
      anchor: [-0.25, 0.56, -0.36],
      description:
        'Formula-style magnetic rocker paddles fire the 7-speed Ricardo gearbox with razor-crisp 40 ms ignition cuts up to 11,100 RPM.',
    },
    {
      id: 'vk-exhaust',
      code: 'SW // 05',
      name: 'Acoustic Exhaust Valve & Telemetry Audio',
      shortLabel: 'EXHAUST',
      zone: 'console',
      material: 'Machined Aluminium Toggle Switch',
      actuationForce: '4.2 N Positive Throw',
      tactileNote: 'Bypasses acoustic resonators for unfiltered 115 dB V12',
      actionType: 'exhaust',
      anchor: [0.0, 0.44, -0.24],
      modes: ['QUIET', 'SPORT', 'TRACK'],
      description:
        'Opens the Inconel exhaust bypass valves immediately aft of the cockpit bulkhead so all twelve cylinders sing unhindered.',
    },
    {
      id: 'vk-esp',
      code: 'SW // 06',
      name: 'Traction & Active Aero Balance Override',
      shortLabel: 'ESP / AERO',
      zone: 'console',
      material: 'Knurled Billet Rotary with LED Collar',
      actuationForce: '3.6 N Indexed Click',
      tactileNote: 'Fine-tunes slip threshold across 9 motorsport steps',
      actionType: 'esp',
      anchor: [0.06, 0.39, -0.18],
      modes: ['ON', 'TRACK', 'OFF'],
      description:
        'Adjusts longitudinal traction slip and active rear wing DRS drag-reduction angle for high-speed straights.',
    },
    {
      id: 'vk-lights',
      code: 'SW // 07',
      name: 'OLED Mirror Pods & Night Cockpit Dimmer',
      shortLabel: 'OPTICS',
      zone: 'pillar',
      material: 'Flush Carbon Bezel Capacitive Pad',
      actuationForce: '2.5 N Haptic Pulse',
      tactileNote: 'Balances 120 Hz A-pillar digital mirrors for night driving',
      actionType: 'lights',
      anchor: [-0.52, 0.72, -0.45],
      description:
        'Controls external full-LED aerodynamic headlamps and dims internal OLED telemetry screens to prevent windscreen glare at night.',
    },
  ],
  valhalla: [
    {
      id: 'vh-start',
      code: 'SW // 01',
      name: 'Illuminated Crystal Start / PHEV Ready Button',
      shortLabel: 'START/STOP',
      zone: 'console',
      material: 'Optically Bonded Crystal Glass & Machined Bezel',
      actuationForce: '4.0 N Damped Press',
      tactileNote: 'Pulses AMR Lime on EV Ready, white-gold on V8 Ignition',
      actionType: 'ignition',
      anchor: [0.0, 0.43, -0.12],
      description:
        'Wakes the triple-motor hybrid architecture silently in Pure EV mode or commands instant firing of the 4.0L flat-plane crank twin-turbo V8.',
    },
    {
      id: 'vh-mode',
      code: 'SW // 02',
      name: 'Knurled PHEV / Sport+ / Race Mode Selector',
      shortLabel: 'DRIVE MODE',
      zone: 'console',
      material: 'CNC-Milled Solid Aluminium Rotary Ring',
      actuationForce: '3.4 N Precision Detent',
      tactileNote: 'Race Mode deploys the hydraulic 255 mm rear T-wing',
      actionType: 'driveMode',
      anchor: [0.0, 0.47, -0.22],
      modes: ['GT', 'SPORT', 'SPORT+', 'TRACK'],
      description:
        'Coordinates the front axial-flux torque vectoring, active front splitter air-dams, rear T-wing angle, and flat-plane V8 mapping.',
    },
    {
      id: 'vh-kers',
      code: 'SW // 03',
      name: 'E-Axle Torque Vectoring & E-Boost Button',
      shortLabel: 'E-BOOST',
      zone: 'wheel',
      material: 'Anodized Alloy Steering Thumb Switch',
      actuationForce: '4.5 N Crisp Snap',
      tactileNote: 'Channels full 251 PS electric burst across both axles',
      actionType: 'kers',
      anchor: [-0.18, 0.72, -0.2],
      description:
        'Forces maximum simultaneous discharge from both front axial-flux motors and the P2.5 gearbox motor for explosive apex exit.',
    },
    {
      id: 'vh-paddles',
      code: 'SW // 04',
      name: 'Column-Mounted Forged Carbon DCT Paddles',
      shortLabel: 'DCT PADDLES',
      zone: 'wheel',
      material: 'Satin Twill Carbon with Billet +/- Inlays',
      actuationForce: '5.6 N Magnetic Click',
      tactileNote: 'Zero-lag dual-clutch pre-selection with downshift blips',
      actionType: 'paddles',
      anchor: [-0.36, 0.72, -0.2],
      description:
        'Commands the bespoke 8-speed dual-clutch transaxle with instant sequential shifts and automated heel-and-toe rev-matching.',
    },
    {
      id: 'vh-exhaust',
      code: 'SW // 05',
      name: 'Top-Exit Titanium Exhaust Valve Toggle',
      shortLabel: 'EXHAUST',
      zone: 'console',
      material: 'Knurled Billet Roller Switch',
      actuationForce: '3.8 N Solid Detent',
      tactileNote: 'Unlocks flat-plane 180° metallic shriek independently of mode',
      actionType: 'exhaust',
      anchor: [-0.07, 0.43, -0.06],
      modes: ['QUIET', 'SPORT', 'TRACK'],
      description:
        'Overrides the acoustic exhaust flap schedule independently from the drive mode so the flat-plane V8 sings even at low cruise speeds.',
    },
    {
      id: 'vh-damper',
      code: 'SW // 06',
      name: 'Inboard Pushrod Bilstein DTX Damper Override',
      shortLabel: 'DAMPERS',
      zone: 'console',
      material: 'Machined Metal Tactile Toggle',
      actuationForce: '3.8 N Crisp Click',
      tactileNote: 'Decouples suspension stiffness from powertrain aggression',
      actionType: 'damper',
      anchor: [0.07, 0.43, -0.06],
      modes: ['GT', 'SPORT', 'TRACK'],
      description:
        'Allows pairing Track powertrain & active aero with supple Sport damper compliance for bumpy B-roads.',
    },
    {
      id: 'vh-lights',
      code: 'SW // 07',
      name: 'Adaptive Matrix LED & Ambient Carbon Wing Beam',
      shortLabel: 'ILLUMINATION',
      zone: 'bridge',
      material: 'Satin Chrome Knurled Dial',
      actuationForce: '3.0 N Smooth Detent',
      tactileNote: 'Activates matrix beam lamps and emerald cabin footwell glow',
      actionType: 'lights',
      anchor: [-0.46, 0.76, -0.34],
      description:
        'Engages exterior adaptive LED lighting and bathes the exposed structural carbon instrument wing in subtle night-mode illumination.',
    },
  ],
  vanquish: [
    {
      id: 'vq-start',
      code: 'SW // 01',
      name: 'Illuminated Crystal Glass Engine Start/Stop',
      shortLabel: 'CRYSTAL START',
      zone: 'console',
      material: 'Faceted Optical Crystal Glass inside Knurled Rotary',
      actuationForce: '3.9 N Weighted Press',
      tactileNote: 'Surrounded by the concentric knurled drive-mode collar',
      actionType: 'ignition',
      anchor: [0.0, 0.65, -0.08],
      description:
        'Centrepiece of Vanquish’s lowered horizontal bridge: awakens the 5.2L Twin-Turbo V12 with an unmistakable twelve-cylinder cold-start bark.',
    },
    {
      id: 'vq-mode',
      code: 'SW // 02',
      name: 'Concentric Knurled Aluminium Drive-Mode Rotary',
      shortLabel: 'DRIVE ROTARY',
      zone: 'console',
      material: 'Diamond-Knurled Solid Billet Aluminium',
      actuationForce: '3.1 N Watch-Bezel Click',
      tactileNote: 'Machined like a Swiss chronometer bezel around Start/Stop',
      actionType: 'driveMode',
      anchor: [0.0, 0.68, -0.15],
      modes: ['GT', 'SPORT', 'SPORT+', 'TRACK'],
      description:
        'Rotates smoothly across Wet, GT, Sport, Sport+, and Individual, recalibrating Boost Reserve, ZF shift speed, E-Diff lock, and Bilstein DTX.',
    },
    {
      id: 'vq-exhaust',
      code: 'SW // 03',
      name: 'Dedicated V12 Active Exhaust Override Button',
      shortLabel: 'V12 EXHAUST',
      zone: 'console',
      material: 'Solid Machined Metal Flush Key',
      actuationForce: '3.7 N Tactile Click',
      tactileNote: 'Direct physical shortcut — zero touchscreen menu diving',
      actionType: 'exhaust',
      anchor: [-0.08, 0.64, -0.02],
      modes: ['QUIET', 'SPORT', 'TRACK'],
      description:
        'Permanently mounted on the centre console so the driver can unleash the full quad-pipe V12 symphony with a single blind touch.',
    },
    {
      id: 'vq-damper',
      code: 'SW // 04',
      name: 'Chassis & Bilstein DTX Damper Override',
      shortLabel: 'CHASSIS DTX',
      zone: 'console',
      material: 'Solid Machined Metal Flush Key',
      actuationForce: '3.7 N Tactile Click',
      tactileNote: 'Cycles Bilstein DTX adaptive valving across 3 firmness stages',
      actionType: 'damper',
      anchor: [0.08, 0.64, -0.02],
      modes: ['GT', 'SPORT', 'TRACK'],
      description:
        'Independently selects Bilstein DTX damper calibration so you can pair V12 Sport+ throttle with plush continental GT ride comfort.',
    },
    {
      id: 'vq-paddles',
      code: 'SW // 05',
      name: 'Sculpted Metal / Carbon ZF Shift Paddles',
      shortLabel: 'SHIFT PADDLES',
      zone: 'wheel',
      material: 'Cold-Touch Anodized Billet Aluminium',
      actuationForce: '5.2 N Crisp Microswitch',
      tactileNote: 'Triggers 8-speed ZF transaxle with V12 Boost Reserve',
      actionType: 'paddles',
      anchor: [-0.39, 0.85, 0.02],
      description:
        'Manual paddle command locks Boost Reserve pressure above the throttle butterfly so full 1,000 Nm torque hits instantly on upshift.',
    },
    {
      id: 'vq-esp',
      code: 'SW // 06',
      name: 'ESP Track & Electronic Rear Diff Override',
      shortLabel: 'ESP / E-DIFF',
      zone: 'console',
      material: 'Machined Billet Toggle with Amber Status LED',
      actuationForce: '4.1 N Guarded Press',
      tactileNote: 'Unlocks progressive rear slip angle controlled by E-Diff',
      actionType: 'esp',
      anchor: [0.0, 0.61, 0.06],
      modes: ['ON', 'TRACK', 'OFF'],
      description:
        'Switches the 6-axis IMU stability system into Track threshold, letting the 135 ms E-Diff sculpt controlled power oversteer.',
    },
    {
      id: 'vq-lights',
      code: 'SW // 07',
      name: 'Matrix LED & 64-Colour Ambient Lighting Control',
      shortLabel: 'NIGHT MODE',
      zone: 'bridge',
      material: 'Knurled Billet Thumb Roller',
      actuationForce: '2.9 N Smooth Index',
      tactileNote: 'Illuminates crystal Start/Stop, Bowers & Wilkins grilles & DRLs',
      actionType: 'lights',
      anchor: [-0.54, 0.88, -0.14],
      description:
        'Activates full-width 7-blade rear LED signature, Matrix LED front headlights, and warm Gaydon ambient interior striping.',
    },
  ],
  db12: [
    {
      id: 'db-start',
      code: 'SW // 01',
      name: 'Illuminated Crystal Glass Start/Stop Button',
      shortLabel: 'CRYSTAL START',
      zone: 'console',
      material: 'Faceted Optical Glass inside Satin Chrome Bezel',
      actuationForce: '3.9 N Weighted Press',
      tactileNote: 'Awakens the 680 PS hand-built twin-turbo V8',
      actionType: 'ignition',
      anchor: [0.0, 0.62, -0.16],
      description:
        'Positioned at the ergonomic heart of the elevated DB12 centre console, framed by the diamond-knurled solid metal drive mode rotary.',
    },
    {
      id: 'db-mode',
      code: 'SW // 02',
      name: 'Knurled Solid Metal 5-Mode Drive Selector',
      shortLabel: 'MODE ROTARY',
      zone: 'console',
      material: 'CNC Diamond-Knurled Billet Aluminium',
      actuationForce: '3.1 N Chronometer Click',
      tactileNote: 'Cycles Wet, GT, Sport, Sport+ & Individual seamlessly',
      actionType: 'driveMode',
      anchor: [0.0, 0.66, -0.23],
      modes: ['GT', 'SPORT', 'SPORT+', 'TRACK'],
      description:
        'Transforms DB12 from a serene continental grand tourer into an apex-devouring Super Tourer by coordinating E-Diff, DTX dampers, and V8 boost.',
    },
    {
      id: 'db-exhaust',
      code: 'SW // 03',
      name: 'Dedicated Active Exhaust Valve Shortcut',
      shortLabel: 'EXHAUST VALVE',
      zone: 'console',
      material: 'Machined Aluminium Physical Switch',
      actuationForce: '3.6 N Crisp Detent',
      tactileNote: 'Permanent tactile override — never buried in touch menus',
      actionType: 'exhaust',
      anchor: [-0.14, 0.56, -0.04],
      modes: ['QUIET', 'SPORT', 'TRACK'],
      description:
        'Opens the twin-scroll V8 exhaust valves on demand for deep baritone overrun crackles on throttle lift.',
    },
    {
      id: 'db-damper',
      code: 'SW // 04',
      name: 'Bilstein DTX Adaptive Suspension Override',
      shortLabel: 'BILSTEIN DTX',
      zone: 'console',
      material: 'Machined Aluminium Physical Switch',
      actuationForce: '3.6 N Crisp Detent',
      tactileNote: '500% bandwidth adjustment between GT & Sport+',
      actionType: 'damper',
      anchor: [0.14, 0.59, -0.14],
      modes: ['GT', 'SPORT', 'TRACK'],
      description:
        'Separates suspension calibration from engine mapping so drivers can enjoy crisp V8 response over imperfect surfaces.',
    },
    {
      id: 'db-paddles',
      code: 'SW // 05',
      name: 'Anodized Billet ZF 8-Speed Shift Paddles',
      shortLabel: 'SHIFT PADDLES',
      zone: 'wheel',
      material: 'Cold-Touch Machined Alloy behind Thick-Rim Wheel',
      actuationForce: '5.1 N Positive Click',
      tactileNote: 'Leverages shortened 3.083:1 final drive for urgent acceleration',
      actionType: 'paddles',
      anchor: [-0.36, 0.84, -0.02],
      description:
        'Long-throw tactile paddles engage full manual control over the rear-mounted 8-speed ZF transaxle.',
    },
    {
      id: 'db-esp',
      code: 'SW // 06',
      name: '4-Stage ESP & First-Ever DB E-Diff Control',
      shortLabel: 'ESP / E-DIFF',
      zone: 'console',
      material: 'Flush Machined Toggle with Status Ring',
      actuationForce: '4.0 N Guarded Press',
      tactileNote: 'Wet / On / Track / Off calibration via 6-axis IMU',
      actionType: 'esp',
      anchor: [0.0, 0.58, -0.02],
      modes: ['ON', 'TRACK', 'OFF'],
      description:
        'Empowers the driver to explore DB12’s rear-biased 48:52 balance with seamless electronic differential torque distribution.',
    },
    {
      id: 'db-lights',
      code: 'SW // 07',
      name: 'Dual-10.25" Pure Black HMI & Night Illumination',
      shortLabel: 'NIGHT / HMI',
      zone: 'bridge',
      material: 'Optically Bonded Gorilla Glass & Knurled Rollers',
      actuationForce: '2.8 N Smooth Roller',
      tactileNote: 'Synchronizes Matrix LED beams & Bowers & Wilkins cabin glow',
      actionType: 'lights',
      anchor: [-0.5, 0.85, -0.18],
      description:
        'Pairs Aston Martin’s first in-house Pure Black touchscreen architecture with permanent physical rollers for climate, audio, and lighting.',
    },
  ],
};

export const DRIVE_PHYSICS_PROFILES: Record<string, DrivePhysicsProfile> = {
  valkyrie: {
    gearRatios: [3.12, 2.28, 1.74, 1.38, 1.13, 0.94, 0.79],
    finalDrive: 3.85,
    idleRpm: 1600,
    shiftUpRpm: 10650,
    redlineRpm: 11100,
    peakPowerRpm: 10500,
    tireRadiusM: 0.355,
    maxLateralG: 2.35,
    brakeDecelG: 1.95,
    hasHybridBoost: true,
    hasTurbo: false,
    shiftCutMs: 42,
    driveModes: ['GT', 'SPORT', 'SPORT+', 'TRACK'],
  },
  valhalla: {
    gearRatios: [3.68, 2.55, 1.88, 1.44, 1.14, 0.92, 0.76, 0.64],
    finalDrive: 3.65,
    idleRpm: 1100,
    shiftUpRpm: 7250,
    redlineRpm: 7500,
    peakPowerRpm: 7200,
    tireRadiusM: 0.36,
    maxLateralG: 1.85,
    brakeDecelG: 1.72,
    hasHybridBoost: true,
    hasTurbo: true,
    shiftCutMs: 36,
    driveModes: ['GT', 'SPORT', 'SPORT+', 'TRACK'],
  },
  vanquish: {
    gearRatios: [4.71, 3.14, 2.11, 1.67, 1.29, 1.0, 0.84, 0.67],
    finalDrive: 2.93,
    idleRpm: 850,
    shiftUpRpm: 6750,
    redlineRpm: 7000,
    peakPowerRpm: 6500,
    tireRadiusM: 0.365,
    maxLateralG: 1.32,
    brakeDecelG: 1.38,
    hasHybridBoost: false,
    hasTurbo: true,
    shiftCutMs: 55,
    driveModes: ['GT', 'SPORT', 'SPORT+', 'TRACK'],
  },
  db12: {
    gearRatios: [4.71, 3.14, 2.11, 1.67, 1.29, 1.0, 0.84, 0.67],
    finalDrive: 3.083,
    idleRpm: 800,
    shiftUpRpm: 6700,
    redlineRpm: 7000,
    peakPowerRpm: 6000,
    tireRadiusM: 0.355,
    maxLateralG: 1.24,
    brakeDecelG: 1.3,
    hasHybridBoost: false,
    hasTurbo: true,
    shiftCutMs: 60,
    driveModes: ['GT', 'SPORT', 'SPORT+', 'TRACK'],
  },
};
