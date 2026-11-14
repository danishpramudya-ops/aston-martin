export type EngineTopology = 'v12-na' | 'v8-hybrid' | 'v12-tt' | 'v8-tt';

export interface StudioFrame {
  deg: number; // 0..360
  label: string;
  src: string;
}

export interface EngineeringHotspot {
  id: string;
  code: string;
  azimuth: number; // Optimal viewing angle 0..360 (or unwrapped -90..90 matching car)
  azimuthWindow: [number, number];
  xPct: number;
  yPct: number;
  title: string;
  subsystem: string;
  metric: string;
  description: string;
}

export interface DynoPoint {
  rpm: number;
  powerPS: number;
  torqueNm: number;
}

export interface AeroProfile {
  bodyClass: 'hypercar' | 'mid-engine' | 'gt-coupe';
  lengthM: number;
  widthM: number;
  heightM: number;
  wheelbaseM: number;
  rideHeightMm: number;
  maxDownforceKg: number;
  downforceRefKmh: number;
  dragCd: number;
  hasActiveWing: boolean;
  rearWingAngleDeg: number;
  frontBiasPct: number;
  chassisType: string;
  brakeFrontMm: number;
  brakeRearMm: number;
}

export interface CabinElement {
  id: string;
  code: string;
  title: string;
  material: string;
  spec: string;
  detail: string;
}

export interface AstonCar {
  id: string;
  name: string;
  subtitle: string;
  category: string;
  tagline: string;
  chassisCode: string;
  origin: string;
  productionNote: string;
  isClosed360: boolean;
  defaultAzimuth: number;
  studioFrames: StudioFrame[];
  heroImage: string;
  specs: {
    engine: string;
    powerPS: number;
    powerLabel: string;
    torqueNm: number;
    torqueLabel: string;
    redlineRpm: number;
    zeroToHundred: string;
    topSpeedKmh: number;
    topSpeedMph: number;
    weightKg: number;
    weightLabel: string;
    gearbox: string;
    brakes: string;
    weightDist: string;
    dimensionsMm: string;
    wheelbaseMm: number;
  };
  topology: EngineTopology;
  dynoCurve: DynoPoint[];
  aero: AeroProfile;
  hotspots: EngineeringHotspot[];
  cabinElements: CabinElement[];
}

export interface QPaintFinish {
  id: string;
  name: string;
  collection: string;
  hex: string;
  sat: number;
  valueGain: number;
  contrast: number;
  isNeutral?: boolean;
  description: string;
}

export interface QCaliperFinish {
  id: string;
  name: string;
  hex: string;
}

export interface QCabinTrim {
  id: string;
  name: string;
  material: string;
  primaryHex: string;
  stitchHex: string;
  accentName: string;
}

export const Q_PAINT_FINISHES: QPaintFinish[] = [
  {
    id: 'aluminite-silver',
    name: 'Aluminite Silver',
    collection: 'Satin Studio Signature',
    hex: '#B8BFC2',
    sat: 0.04,
    valueGain: 1.0,
    contrast: 1.0,
    isNeutral: true,
    description: 'Liquid-metal fine metallic flake calibrated for zero distortion under Gaydon studio cycloramas.',
  },
  {
    id: 'aston-racing-green',
    name: 'Aston Martin Racing Green',
    collection: 'Heritage Motorsport',
    hex: '#0D4A33',
    sat: 0.78,
    valueGain: 0.84,
    contrast: 1.08,
    description: 'Deep Buckinghamshire emerald metallic paying direct tribute to the DBR1 Le Mans bloodline.',
  },
  {
    id: 'xenon-grey',
    name: 'Xenon Grey',
    collection: 'Q Contemporary Metallic',
    hex: '#4A545C',
    sat: 0.28,
    valueGain: 0.78,
    contrast: 1.09,
    description: 'Cool graphite-titanium coat infused with fine cyan-silver metallic interference particles.',
  },
  {
    id: 'liquid-crimson',
    name: 'Liquid Crimson',
    collection: 'Q Satin Lacquer',
    hex: '#841824',
    sat: 0.82,
    valueGain: 0.84,
    contrast: 1.1,
    description: 'Deep triple-layer carmine tint over an aluminum base coat for pronounced body-crease depth.',
  },
  {
    id: 'concours-bronze',
    name: 'Concours Bronze',
    collection: 'Q Bespoke Atelier',
    hex: '#947347',
    sat: 0.56,
    valueGain: 0.9,
    contrast: 1.06,
    description: 'Warm Savile Row champagne-bronze tint highlighting chamfered wheel arches and aero blades.',
  },
  {
    id: 'onyx-stealth',
    name: 'Onyx Stealth',
    collection: 'Satin Carbon Finish',
    hex: '#222726',
    sat: 0.08,
    valueGain: 0.58,
    contrast: 1.18,
    description: 'Low-gloss stealth coat accentuating raw twill carbon splitters and sculpted side strakes.',
  },
];

export const Q_CALIPER_FINISHES: QCaliperFinish[] = [
  { id: 'lime-essence', name: 'AMR Lime Essence', hex: '#C4D600' },
  { id: 'bronze-anodized', name: 'Anodized Bronze', hex: '#C8A96E' },
  { id: 'crimson-red', name: 'Bespoke Red', hex: '#B91C1C' },
  { id: 'obsidian-black', name: 'Satin Black', hex: '#262928' },
];

export const Q_CABIN_TRIMS: QCabinTrim[] = [
  {
    id: 'onyx-lime',
    name: 'Obsidian Monotone + Lime',
    material: 'Semi-Aniline Bridge of Weir Hide & Alcantara',
    primaryHex: '#151817',
    stitchHex: '#C4D600',
    accentName: 'AMR Lime Contrast Welt',
  },
  {
    id: 'oxford-tan',
    name: 'Oxford Tan + Titanium Twill',
    material: 'Full-Grain Saddle Leather & Matte Carbon',
    primaryHex: '#6F4428',
    stitchHex: '#D8C29D',
    accentName: 'Warm Champagne Contrast Stitch',
  },
  {
    id: 'cumbria-green',
    name: 'Cumbria Green + Brass',
    material: 'Heritage Aniline Hide & Brushed Brass Knurling',
    primaryHex: '#163024',
    stitchHex: '#C8A96E',
    accentName: 'Heritage Satin Brass Piping',
  },
];

export const ASTON_CARS: AstonCar[] = [
  {
    id: 'valkyrie',
    name: 'Valkyrie',
    subtitle: '6.5L Cosworth V12 Hypercar',
    category: 'Hypercar',
    tagline: 'As close to a Formula 1 car as road legislation allows.',
    chassisCode: 'AM-RB 001 // GAYDON',
    origin: 'Gaydon & Silverstone, UK',
    productionNote: 'Limited to 150 Road Coupés Worldwide',
    isClosed360: true,
    defaultAzimuth: 45,
    heroImage: './assets/cars/valkyrie/angle_045.jpg',
    studioFrames: [
      { deg: 0, label: 'Front', src: './assets/cars/valkyrie/angle_000.jpg' },
      { deg: 45, label: 'F-Left', src: './assets/cars/valkyrie/angle_045.jpg' },
      { deg: 90, label: 'L-Prof', src: './assets/cars/valkyrie/angle_090.jpg' },
      { deg: 135, label: 'R-Left', src: './assets/cars/valkyrie/angle_135.jpg' },
      { deg: 180, label: 'Rear', src: './assets/cars/valkyrie/angle_180.jpg' },
      { deg: 225, label: 'R-Right', src: './assets/cars/valkyrie/angle_225.jpg' },
      { deg: 270, label: 'R-Prof', src: './assets/cars/valkyrie/angle_270.jpg' },
      { deg: 315, label: 'F-Right', src: './assets/cars/valkyrie/angle_315.jpg' },
    ],
    specs: {
      engine: '6.5L Cosworth Naturally Aspirated 65° V12 + Rimac KERS',
      powerPS: 1155,
      powerLabel: '1,155 PS @ 10,500 rpm',
      torqueNm: 900,
      torqueLabel: '900 Nm @ 6,000 rpm',
      redlineRpm: 11100,
      zeroToHundred: '2.5 s',
      topSpeedKmh: 354,
      topSpeedMph: 220,
      weightKg: 1355,
      weightLabel: '1,355 kg DIN Kerb',
      gearbox: '7-Speed Ricardo Automated Single-Clutch',
      brakes: '420 mm F / 385 mm R CCM-R Carbon-Ceramic',
      weightDist: '46% F / 54% R',
      dimensionsMm: '4,500 × 1,970 × 1,070 mm',
      wheelbaseMm: 2770,
    },
    topology: 'v12-na',
    dynoCurve: [
      { rpm: 2000, powerPS: 195, torqueNm: 685 },
      { rpm: 3500, powerPS: 380, torqueNm: 762 },
      { rpm: 5000, powerPS: 605, torqueNm: 850 },
      { rpm: 6000, powerPS: 770, torqueNm: 900 },
      { rpm: 7500, powerPS: 940, torqueNm: 880 },
      { rpm: 9000, powerPS: 1085, torqueNm: 845 },
      { rpm: 10500, powerPS: 1155, torqueNm: 772 },
      { rpm: 11100, powerPS: 1125, torqueNm: 712 },
    ],
    aero: {
      bodyClass: 'hypercar',
      lengthM: 4.5,
      widthM: 1.97,
      heightM: 1.07,
      wheelbaseM: 2.77,
      rideHeightMm: 68,
      maxDownforceKg: 1100,
      downforceRefKmh: 350,
      dragCd: 0.34,
      hasActiveWing: true,
      rearWingAngleDeg: 14,
      frontBiasPct: 44,
      chassisType: 'Full Carbon-Fibre MonoCell (Zero Steel Structure)',
      brakeFrontMm: 420,
      brakeRearMm: 385,
    },
    hotspots: [
      {
        id: 'valk-venturi',
        code: '01 // UNDERFLOOR',
        azimuth: 45,
        azimuthWindow: [0, 105],
        xPct: 38,
        yPct: 68,
        title: 'Full-Length Venturi Tunnels',
        subsystem: 'Ground-Effect Aerodynamics',
        metric: '1,100 kg Peak Downforce',
        description:
          'Twin sculpted underbody channels accelerate airflow beneath the teardrop cabin, creating immense ground-effect suction without drag-heavy wings.',
      },
      {
        id: 'valk-scoop',
        code: '02 // INDUCTION',
        azimuth: 90,
        azimuthWindow: [35, 145],
        xPct: 56,
        yPct: 28,
        title: 'Roof-Mounted Airbox & Teardrop Canopy',
        subsystem: 'Cosworth 6.5L V12 Plenum',
        metric: '11,100 RPM Redline',
        description:
          'High-pressure ram air feeds directly into twelve individual throttle bodies above the driver’s helmet line inside an ultralight carbon tub.',
      },
      {
        id: 'valk-wheels',
        code: '03 // UNSPRUNG MASS',
        azimuth: 270,
        azimuthWindow: [215, 325],
        xPct: 32,
        yPct: 62,
        title: 'Forged Magnesium Aero Disc Wheels',
        subsystem: 'CCM-R Braking & WheelWake',
        metric: '420 mm F / 385 mm R',
        description:
          'Centre-lock forged magnesium rims fitted with carbon aero blades draw thermal air out of the Formula-spec carbon-ceramic brake assembly.',
      },
      {
        id: 'valk-exhaust',
        code: '04 // EXHAUST',
        azimuth: 180,
        azimuthWindow: [125, 235],
        xPct: 50,
        yPct: 42,
        title: 'Top-Exit Titanium Exhaust & Diffuser',
        subsystem: 'Inconel / Titanium Manifold',
        metric: '115 dB Harmonic Peak',
        description:
          'Short equal-length primary pipes exit above the rear deck immediately aft of the engine bay, keeping the massive Venturi exit unobstructed.',
      },
      {
        id: 'valk-badge',
        code: '05 // CREST',
        azimuth: 315,
        azimuthWindow: [280, 40],
        xPct: 68,
        yPct: 52,
        title: '70-Micron Etched Aluminium Wings',
        subsystem: 'Zero-Drag Coachwork',
        metric: '99.4% Lighter Than Enamel',
        description:
          'Even the iconic Aston Martin badge is chemically etched from titanium-thin aluminium and bonded directly under clear lacquer to save every gram.',
      },
    ],
    cabinElements: [
      {
        id: 'valk-tub',
        code: 'CABIN // 01',
        title: 'Reclined Feet-Up LMP1 Driving Tub',
        material: '3D-Scanned Moulded Carbon Seat Shell',
        spec: '1,355 kg Target Weight Architecture',
        detail: 'Occupants sit reclined directly inside the structural carbon MonoCell with heels raised above hip level.',
      },
      {
        id: 'valk-steering',
        code: 'CABIN // 02',
        title: 'Detachable Carbon Formula Steering Wheel',
        material: 'Alcantara Rim & Central OLED Telemetry',
        spec: 'Zero Stalks — All Switchgear On-Wheel',
        detail: 'Every driving mode, KERS deployment boost, and shift-light ladder lives directly at thumb reach.',
      },
      {
        id: 'valk-optics',
        code: 'CABIN // 03',
        title: 'A-Pillar Digital Rear-View OLED Pods',
        material: 'Flank Micro-Camera Optical Mirrors',
        spec: '120 Hz Zero-Glare Lateral Feed',
        detail: 'Replaces drag-inducing traditional mirrors with crisp internal pillar displays along the occupant sightline.',
      },
    ],
  },
  {
    id: 'valhalla',
    name: 'Valhalla',
    subtitle: 'F1-Derived Twin-Turbo V8 PHEV',
    category: 'Mid-Engine Supercar',
    tagline: 'Triple-motor torque vectoring meets active ground-effect aerodynamics.',
    chassisCode: 'AM-V8 // PHEV 999',
    origin: 'Gaydon, Warwickshire',
    productionNote: 'Limited to 999 Coupés Worldwide',
    isClosed360: false,
    defaultAzimuth: 45,
    heroImage: './assets/cars/valhalla/angle_045.jpg',
    studioFrames: [
      { deg: 270, label: 'R-Prof', src: './assets/cars/valhalla/angle_270.jpg' },
      { deg: 315, label: 'F-Right', src: './assets/cars/valhalla/angle_315.jpg' },
      { deg: 0, label: 'Front', src: './assets/cars/valhalla/angle_000.jpg' },
      { deg: 45, label: 'F-Left', src: './assets/cars/valhalla/angle_045.jpg' },
      { deg: 90, label: 'L-Prof', src: './assets/cars/valhalla/angle_090.jpg' },
    ],
    specs: {
      engine: '4.0L Flat-Plane Twin-Turbo V8 + Triple E-Motor PHEV',
      powerPS: 1079,
      powerLabel: '1,079 PS Combined',
      torqueNm: 1100,
      torqueLabel: '1,100 Nm Combined',
      redlineRpm: 7500,
      zeroToHundred: '2.5 s',
      topSpeedKmh: 350,
      topSpeedMph: 217,
      weightKg: 1655,
      weightLabel: '1,655 kg Dry Carbon Tub',
      gearbox: '8-Speed DCT (Front E-Axle Reverse)',
      brakes: '410 mm F / 390 mm R Carbon-Ceramic',
      weightDist: '44% F / 56% R',
      dimensionsMm: '4,728 × 2,014 × 1,161 mm',
      wheelbaseMm: 2760,
    },
    topology: 'v8-hybrid',
    dynoCurve: [
      { rpm: 1500, powerPS: 310, torqueNm: 980 },
      { rpm: 2500, powerPS: 520, torqueNm: 1060 },
      { rpm: 4000, powerPS: 785, torqueNm: 1100 },
      { rpm: 5500, powerPS: 965, torqueNm: 1030 },
      { rpm: 6500, powerPS: 1048, torqueNm: 945 },
      { rpm: 7200, powerPS: 1079, torqueNm: 878 },
      { rpm: 7500, powerPS: 1060, torqueNm: 830 },
    ],
    aero: {
      bodyClass: 'mid-engine',
      lengthM: 4.73,
      widthM: 2.01,
      heightM: 1.16,
      wheelbaseM: 2.76,
      rideHeightMm: 82,
      maxDownforceKg: 600,
      downforceRefKmh: 240,
      dragCd: 0.31,
      hasActiveWing: true,
      rearWingAngleDeg: 18,
      frontBiasPct: 45,
      chassisType: 'Autoclaved Carbon-Fibre Monocoque + Aluminium Subframes',
      brakeFrontMm: 410,
      brakeRearMm: 390,
    },
    hotspots: [
      {
        id: 'valh-grille',
        code: '01 // ACTIVE FRONT AERO',
        azimuth: 0,
        azimuthWindow: [310, 50],
        xPct: 50,
        yPct: 68,
        title: 'Concealed Active Front Air-Dams & Splitter',
        subsystem: 'IVC Integrated Vehicle Dynamics',
        metric: '600+ kg Downforce @ 240 km/h',
        description:
          'Active surfaces ahead of the front axle adjust dynamically in Race Mode to balance the hydraulic 255 mm rear T-wing without stalling flow.',
      },
      {
        id: 'valh-doors',
        code: '02 // DIHEDRAL S-DUCT',
        azimuth: 90,
        azimuthWindow: [35, 110],
        xPct: 52,
        yPct: 56,
        title: 'Forward-Hinged Dihedral Carbon Doors',
        subsystem: 'Boundary-Layer Side Intake',
        metric: 'Deep Door Air-Curtain Channeling',
        description:
          'Sculpted carbon doors guide dense high-pressure air directly into side-mounted twin-turbo intercoolers and oil radiators.',
      },
      {
        id: 'valh-eaxle',
        code: '03 // TORQUE VECTORING',
        azimuth: 45,
        azimuthWindow: [315, 75],
        xPct: 48,
        yPct: 62,
        title: 'Dual Front-Axle Axial Flux E-Motors',
        subsystem: 'Active AWD Torque Vectoring',
        metric: '251 PS Electric Supplement',
        description:
          'Independent left/right front e-motors pull the nose into apexes instantaneously while enabling silent 130 km/h pure-EV urban running.',
      },
      {
        id: 'valh-roof',
        code: '04 // ROOF SNORKEL',
        azimuth: 315,
        azimuthWindow: [260, 15],
        xPct: 60,
        yPct: 30,
        title: 'Carbon Roof Snorkel & Hot-V V8 Plenum',
        subsystem: '828 PS Flat-Plane Crank V8',
        metric: '1,079 PS System Output',
        description:
          'Feeds cool clean air straight down the spine into the dry-sump flat-plane 4.0L V8 nestled low behind the driver bulkhead.',
      },
    ],
    cabinElements: [
      {
        id: 'valh-amphitheatre',
        code: 'CABIN // 01',
        title: 'F1-Inspired Raised Carbon Footwell',
        material: 'Exposed Twill Carbon Fibre & Microsuede',
        spec: 'Fixed Shell + Sliding Pedal Box',
        detail: 'One-piece carbon bucket seats bolt solidly to the floor while the steering column and pedals translate to fit the driver.',
      },
      {
        id: 'valh-beam',
        code: 'CABIN // 02',
        title: 'Structural Carbon Wing Instrument Beam',
        material: 'Unpainted Satin Carbon Bridge',
        spec: 'Dual Telemetry & EV/Race Displays',
        detail: 'Spans door-to-door in exposed carbon fibre, presenting battery SoC, aero load, and G-force traces at a glance.',
      },
      {
        id: 'valh-audio',
        code: 'CABIN // 03',
        title: 'Pure Black Acoustic HMI Integration',
        material: 'Anodized Rotary Switches & Bowers & Wilkins',
        spec: '4-Mode PHEV / EV / Sport+ / Race Selector',
        detail: 'Blends motorsport-grade physical tactility with seamless wireless smartphone projection.',
      },
    ],
  },
  {
    id: 'vanquish',
    name: 'Vanquish',
    subtitle: '5.2L Twin-Turbo V12 Flagship',
    category: 'V12 Flagship GT',
    tagline: 'Long-bonnet supremacy propelled by 1,000 Nm of effortless V12 thunder.',
    chassisCode: 'AM-V12 // KAMM-TAIL',
    origin: 'Gaydon, Warwickshire',
    productionNote: 'Strictly Capped Under 1,000 Units Annually',
    isClosed360: false,
    defaultAzimuth: 45,
    heroImage: './assets/cars/vanquish/angle_045.jpg',
    studioFrames: [
      { deg: 270, label: 'R-Prof', src: './assets/cars/vanquish/angle_270.jpg' },
      { deg: 315, label: 'F-Right', src: './assets/cars/vanquish/angle_315.jpg' },
      { deg: 0, label: 'Front', src: './assets/cars/vanquish/angle_000.jpg' },
      { deg: 45, label: 'F-Left', src: './assets/cars/vanquish/angle_045.jpg' },
      { deg: 90, label: 'L-Prof', src: './assets/cars/vanquish/angle_090.jpg' },
    ],
    specs: {
      engine: '5.2L Twin-Turbocharged 60° V12 (Reinforced Block)',
      powerPS: 835,
      powerLabel: '835 PS @ 6,500 rpm',
      torqueNm: 1000,
      torqueLabel: '1,000 Nm @ 2,500–5,000 rpm',
      redlineRpm: 7000,
      zeroToHundred: '3.3 s',
      topSpeedKmh: 345,
      topSpeedMph: 214,
      weightKg: 1910,
      weightLabel: '1,910 kg EU Unladen',
      gearbox: '8-Speed ZF Transaxle + Electronic Rear Diff',
      brakes: '410 mm F / 360 mm R Carbon-Ceramic (-27 kg)',
      weightDist: '50% F / 50% R',
      dimensionsMm: '4,850 × 2,044 × 1,290 mm',
      wheelbaseMm: 2885,
    },
    topology: 'v12-tt',
    dynoCurve: [
      { rpm: 1500, powerPS: 250, torqueNm: 820 },
      { rpm: 2500, powerPS: 410, torqueNm: 1000 },
      { rpm: 3500, powerPS: 560, torqueNm: 1000 },
      { rpm: 5000, powerPS: 745, torqueNm: 1000 },
      { rpm: 6000, powerPS: 815, torqueNm: 955 },
      { rpm: 6500, powerPS: 835, torqueNm: 902 },
      { rpm: 7000, powerPS: 805, torqueNm: 808 },
    ],
    aero: {
      bodyClass: 'gt-coupe',
      lengthM: 4.85,
      widthM: 2.04,
      heightM: 1.29,
      wheelbaseM: 2.89,
      rideHeightMm: 105,
      maxDownforceKg: 145,
      downforceRefKmh: 345,
      dragCd: 0.28,
      hasActiveWing: false,
      rearWingAngleDeg: 4,
      frontBiasPct: 48,
      chassisType: 'Bonded Aluminium Monocoque (+75% Lateral Stiffness)',
      brakeFrontMm: 410,
      brakeRearMm: 360,
    },
    hotspots: [
      {
        id: 'vanq-grille',
        code: '01 // VANED COOLING',
        azimuth: 0,
        azimuthWindow: [315, 45],
        xPct: 50,
        yPct: 60,
        title: '5.2L V12 Vaned Grille & Carbon Splitter',
        subsystem: 'High-Flow Twin-Turbo Induction',
        metric: '+13% Cooling Surface Area',
        description:
          'Traditional horizontal metal vanes frame the wide nose, channeling dense air over enlarged charge coolers and bumper corner curtains.',
      },
      {
        id: 'vanq-louvres',
        code: '02 // THERMOS-LOUVRES',
        azimuth: 45,
        azimuthWindow: [0, 100],
        xPct: 36,
        yPct: 38,
        title: 'F1-Inspired Carbon Bonnet Thermos-Louvres',
        subsystem: '5.2L V12 Thermal Extraction',
        metric: '+80 mm Extended Wheelbase',
        description:
          'Extended A-pillar-to-axle proportions cradle twelve cylinders, venting radiator heat cleanly across the sweeping clam bonnet.',
      },
      {
        id: 'vanq-brakes',
        code: '03 // CARBON CERAMIC',
        azimuth: 90,
        azimuthWindow: [45, 110],
        xPct: 24,
        yPct: 62,
        title: 'Standard 410 mm Carbon-Ceramic Rotors',
        subsystem: '21-Inch Forged Alloy + Pirelli P Zero AML',
        metric: '-27 kg Unsprung Mass Saving',
        description:
          'Standard CCB discs eliminate fade up to 800°C while reducing rotating mass for effortless turn-in across continental mountain passes.',
      },
      {
        id: 'vanq-profile',
        code: '04 // KAMM-TAIL',
        azimuth: 270,
        azimuthWindow: [260, 325],
        xPct: 20,
        yPct: 52,
        title: '2,885 mm Wheelbase & Kamm-Tail Silhouette',
        subsystem: '0.28 Cd Continental Stability',
        metric: '345 km/h (214 mph) Vmax',
        description:
          'Stretching the front-axle-to-A-pillar dash creates unmistakable grand touring poise culminating in an abruptly cut aerodynamic Kamm-tail.',
      },
    ],
    cabinElements: [
      {
        id: 'vanq-bridge',
        code: 'CABIN // 01',
        title: 'Lowered Horizontal Knurled Metal Bridge',
        material: 'Machined Aluminium Rollers & Illuminated Crystal Start',
        spec: 'Dedicated Physical Chassis & Exhaust Toggles',
        detail: 'Lowers the visual beltline across a two-seat sanctuary while putting immediate tactile control under the hand.',
      },
      {
        id: 'vanq-glass',
        code: 'CABIN // 02',
        title: 'Full-Length Panoramic Tinted Glass Roof',
        material: '6% Tint Low-Emissivity Glazing',
        spec: 'Blocks 94% Solar Infrared Radiation',
        detail: 'Extends continuously from windscreen header to rear tailgate without heavy mechanical roller blinds.',
      },
      {
        id: 'vanq-sound',
        code: 'CABIN // 03',
        title: 'Bowers & Wilkins 1,170W 15-Speaker System',
        material: 'Double-Dome Aluminium Nautilus Tweeters',
        spec: 'Acoustically Mapped to Two-Seat Cabin',
        detail: 'Delivers studio-reference fidelity even at high continental cruising velocities.',
      },
    ],
  },
  {
    id: 'db12',
    name: 'DB12',
    subtitle: 'The World’s First Super Tourer',
    category: 'Super Tourer',
    tagline: 'Seventy-five years of the DB bloodline distilled into pure continental velocity.',
    chassisCode: 'AM-DB12 // SUPER TOURER',
    origin: 'Gaydon, Warwickshire',
    productionNote: 'Hand-Assembled 4.0L V8 Signature Flagship',
    isClosed360: true,
    defaultAzimuth: 315,
    heroImage: './assets/cars/db12/angle_315.jpg',
    studioFrames: [
      { deg: 0, label: 'Front', src: './assets/cars/db12/angle_000.jpg' },
      { deg: 45, label: 'F-Left', src: './assets/cars/db12/angle_045.jpg' },
      { deg: 135, label: 'R-Left', src: './assets/cars/db12/angle_135.jpg' },
      { deg: 180, label: 'Rear', src: './assets/cars/db12/angle_180.jpg' },
      { deg: 225, label: 'R-Right', src: './assets/cars/db12/angle_225.jpg' },
      { deg: 315, label: 'F-Right', src: './assets/cars/db12/angle_315.jpg' },
    ],
    specs: {
      engine: '4.0L Hand-Built Twin-Turbocharged V8 (Cam & Turbo Revised)',
      powerPS: 680,
      powerLabel: '680 PS @ 6,000 rpm',
      torqueNm: 800,
      torqueLabel: '800 Nm @ 2,750–6,000 rpm',
      redlineRpm: 7000,
      zeroToHundred: '3.6 s',
      topSpeedKmh: 325,
      topSpeedMph: 202,
      weightKg: 1685,
      weightLabel: '1,685 kg Dry / 1,788 kg Kerb',
      gearbox: '8-Speed ZF Automatic (Shorter Final Drive)',
      brakes: '400 mm F / 360 mm R (CCB Option -27 kg)',
      weightDist: '48% F / 52% R',
      dimensionsMm: '4,725 × 1,980 × 1,295 mm',
      wheelbaseMm: 2805,
    },
    topology: 'v8-tt',
    dynoCurve: [
      { rpm: 1500, powerPS: 205, torqueNm: 680 },
      { rpm: 2750, powerPS: 380, torqueNm: 800 },
      { rpm: 4000, powerPS: 515, torqueNm: 800 },
      { rpm: 5500, powerPS: 645, torqueNm: 790 },
      { rpm: 6000, powerPS: 680, torqueNm: 796 },
      { rpm: 6750, powerPS: 660, torqueNm: 688 },
      { rpm: 7000, powerPS: 642, torqueNm: 645 },
    ],
    aero: {
      bodyClass: 'gt-coupe',
      lengthM: 4.73,
      widthM: 1.98,
      heightM: 1.3,
      wheelbaseM: 2.81,
      rideHeightMm: 108,
      maxDownforceKg: 120,
      downforceRefKmh: 325,
      dragCd: 0.3,
      hasActiveWing: false,
      rearWingAngleDeg: 3,
      frontBiasPct: 48,
      chassisType: 'Bonded Aluminium Architecture (+7% Torsional Rigidity)',
      brakeFrontMm: 400,
      brakeRearMm: 360,
    },
    hotspots: [
      {
        id: 'db12-grille',
        code: '01 // VANED APERTURE',
        azimuth: 0,
        azimuthWindow: [310, 50],
        xPct: 50,
        yPct: 58,
        title: '56% Larger Six-Vane Heritage Grille',
        subsystem: 'High-Flow Charge Cooling',
        metric: '+56% Thermal Airflow Aperture',
        description:
          'Frameless horizontal brightwork vanes feed two enlarged charge-air coolers and the sculpted carbon front splitter.',
      },
      {
        id: 'db12-mirrors',
        code: '02 // FRAMELESS OPTICS',
        azimuth: 45,
        azimuthWindow: [15, 95],
        xPct: 68,
        yPct: 36,
        title: 'Frameless Swan-Neck Door Mirrors',
        subsystem: 'Aero Drag & Wind Noise Trim',
        metric: 'Zero Bezel Glass Profile',
        description:
          'Smaller, razor-clean frameless mirrors reduce high-speed cabin wind roar while framing the muscular rear haunches.',
      },
      {
        id: 'db12-ediff',
        code: '03 // E-DIFF & DTX',
        azimuth: 180,
        azimuthWindow: [130, 230],
        xPct: 50,
        yPct: 64,
        title: 'First-Ever DB Electronic Rear Differential',
        subsystem: 'Bilstein DTX Adaptive Dampers',
        metric: '0% to 100% Lock in 135 ms',
        description:
          'Predictive stability algorithms coordinate the E-Diff with Bilstein DTX dampers across GT, Sport, and Sport+ modes.',
      },
      {
        id: 'db12-wheels',
        code: '04 // MICHELIN AML',
        azimuth: 315,
        azimuthWindow: [265, 355],
        xPct: 54,
        yPct: 64,
        title: '21-Inch Forged Multi-Spoke + Pilot Sport 5 S',
        subsystem: 'Bespoke Acoustic Foam Tyres',
        metric: '-20% Interior Cavity Noise',
        description:
          'First production application of Michelin Pilot Sport 5 S tyres engineered specifically to Aston Martin AML compound specs.',
      },
    ],
    cabinElements: [
      {
        id: 'db12-hmi',
        code: 'CABIN // 01',
        title: 'Bespoke Aston Martin Dual-10.25" HMI',
        material: 'Pure Black Capacitive Glass & Physical Knurling',
        spec: 'Sub-30 ms Touch Response + Tactile Dials',
        detail: 'In-house infotainment balances clean screen integration with permanent metal rotaries for climate, chassis, and gear selection.',
      },
      {
        id: 'db12-bw',
        code: 'CABIN // 02',
        title: 'Bowers & Wilkins 1,170W Acoustic Suite',
        material: 'Stainless Steel Nautilus Double-Dome Tweeters',
        spec: '15 Speakers + QuantumLogic Surround',
        detail: 'Acoustic aluminium grilles seamlessly flush-mounted into Bridge of Weir aniline door cards.',
      },
      {
        id: 'db12-craft',
        code: 'CABIN // 03',
        title: 'Hand-Stitched Bridge of Weir Architecture',
        material: 'Scottish Full-Grain Aromatic Leather',
        spec: '2+2 Grand Touring Ergonomics',
        detail: 'Hand-trimmed across more than 50 hours in Gaydon with signature quilting and heated/ventilated bolstered seating.',
      },
    ],
  },
];
