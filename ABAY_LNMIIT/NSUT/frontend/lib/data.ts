export type RiskLevel = 'NORMAL' | 'CAUTION' | 'ELEVATED' | 'HIGH RISK';

export interface Patient {
  id: string;
  name: string;
  age: number;
  gender: 'M' | 'F';
  city: string;
  station: string;
  severity: 'Mild Intermittent' | 'Moderate Persistent' | 'Severe Persistent' | 'Severe Refractory';
  controllerMedication: string;
  controllerAdherence: number; // percentage
  rescueMedication: string;
  baselineFEV1: number; // Liters
  baselineFEV1Percent: number; // % predicted
  baselineFEV1FVC: number; // %
  baselineRR: number; // breaths / min
  baselineRHR: number; // bpm
  allergens: string[];
  smokingHistory: string;
  comorbidities: string[];
  flareUpsLastYear: number;
  
  // Current Live State (Day 7 / Now)
  risk24h: number; // %
  risk24hInterval: [number, number]; // conformal range
  risk48h: number; // %
  risk48hInterval: [number, number]; // conformal range
  riskLevel: RiskLevel;
  activeAlert: boolean;
  alertHeadline: string;
  alertTriggerTime: string;
  leadTimeHours: number;
  estimatedInflammationState: number; // I(t) 0.0 to 1.0 scale
  inflammationThreshold: number;

  currentTelemetry: {
    spo2: number;
    rr: number;
    rhr: number;
    hrv: number;
    sleepAwakenings: number;
    deepSleepPercent: number;
    steps: number;
    rescuePuffs24h: number;
  };
  currentAirQuality: {
    pm25: number;
    pm10: number;
    aqi: number;
    aqiCategory: 'Good' | 'Moderate' | 'Poor' | 'Very Poor' | 'Severe';
    temp: number;
    humidity: number;
  };
  shapReasons: {
    rank: number;
    feature: string;
    impactPercent: number; // e.g. +34%
    direction: 'up' | 'down';
    description: string;
    targetStream: 'AIR_QUALITY' | 'WEARABLE' | 'EHR' | 'MEDICATION';
  }[];
  simulatedDeviceProfile?: 'typical' | 'restless_sleeper' | 'low_activity' | string;
  basePredictions?: {
    tcnRisk24h: number;
    gradientBoostingRisk24h: number;
    tcnRisk48h: number;
    gradientBoostingRisk48h: number;
    metaRisk24h: number;
    metaRisk48h: number;
    xgbRisk48h?: number;
    mlpRisk48h?: number;
  };
  learningBaseline?: {
    active: boolean;
    currentDay: number;
    totalCalibrationDays: number;
    statusLabel: string;
    uncertaintyHalfWidthPct: number;
    simulatedDeviceProfile?: string;
    convergenceSchedule?: {
      day: string | number;
      label?: string;
      bandHalfWidth: number;
      status: string;
    }[];
  };
  whatIfPreview?: any;
}

export interface TelemetryPoint {
  day: string; // e.g. "Day 1", "Day 2", ... "Day 7 (Now)"
  dayShort: string;
  date: string;
  spo2: number;
  rr: number;
  rhr: number;
  hrv: number;
  sleepAwakenings: number;
  rescuePuffs: number;
  pm25: number;
  inflammationState: number;
  threshold: number;
}

export interface SimulatorAssumption {
  id: string;
  parameter: string;
  symbol: string;
  value: string;
  unit: string;
  physiologicalRole: string;
  citation: string;
  citationDoi: string;
  year: number;
}

export interface BenchmarkModel {
  name: string;
  category: 'Baseline' | 'BreathTwin Core' | 'Ablation';
  prAuc: number;
  rocAuc: number;
  brierScore: number;
  leadTimeHours: number;
  falseAlarmsPerWeek: number;
  notes: string;
}

export const PATIENTS: Patient[] = [
  {
    id: 'PT-8821',
    name: 'Aarush Sen',
    age: 34,
    gender: 'M',
    city: 'New Delhi',
    station: 'Anand Vihar CPCB',
    severity: 'Moderate Persistent',
    controllerMedication: 'Budesonide/Formoterol 200/6 µg (2 puffs BID)',
    controllerAdherence: 68,
    rescueMedication: 'Levosalbutamol 50 µg MDI',
    baselineFEV1: 2.85,
    baselineFEV1Percent: 74,
    baselineFEV1FVC: 68,
    baselineRR: 15,
    baselineRHR: 66,
    allergens: ['Dust Mites', 'Biomass Smoke', 'Grass Pollen'],
    smokingHistory: 'Never smoker',
    comorbidities: ['Allergic Rhinitis'],
    flareUpsLastYear: 3,
    
    risk24h: 76,
    risk24hInterval: [68, 83],
    risk48h: 82,
    risk48hInterval: [74, 89],
    riskLevel: 'HIGH RISK',
    activeAlert: true,
    alertHeadline: 'Imminent flare-up predicted within 36-48h: PM2.5 spike + Nocturnal tachypnea',
    alertTriggerTime: '2026-10-13 06:00 IST',
    leadTimeHours: 38,
    estimatedInflammationState: 0.84,
    inflammationThreshold: 0.65,

    currentTelemetry: {
      spo2: 91.5,
      rr: 19.4,
      rhr: 78,
      hrv: 24,
      sleepAwakenings: 4,
      deepSleepPercent: 9.5,
      steps: 4210,
      rescuePuffs24h: 5,
    },
    currentAirQuality: {
      pm25: 184,
      pm10: 312,
      aqi: 349,
      aqiCategory: 'Severe',
      temp: 29.4,
      humidity: 71,
    },
    shapReasons: [
      {
        rank: 1,
        feature: 'Commute PM2.5 Exposure Surge',
        impactPercent: 36,
        direction: 'up',
        description: 'Ambient PM2.5 surged from 68 to 184 µg/m³ during daily 1.5h outdoor commute.',
        targetStream: 'AIR_QUALITY'
      },
      {
        rank: 2,
        feature: 'Resting Respiratory Rate Drift',
        impactPercent: 28,
        direction: 'up',
        description: 'Nocturnal RR elevated +4.4 breaths/min above 14-day rolling baseline.',
        targetStream: 'WEARABLE'
      },
      {
        rank: 3,
        feature: 'Sub-Optimal Inhaler Adherence',
        impactPercent: 21,
        direction: 'up',
        description: 'Missed 3 of last 6 scheduled Budesonide controller doses in past 72h.',
        targetStream: 'MEDICATION'
      },
      {
        rank: 4,
        feature: 'Nighttime SpO2 Micro-Desaturations',
        impactPercent: 15,
        direction: 'up',
        description: '4 episodes below 92% SpO2 accompanied by sleep fragmentation.',
        targetStream: 'WEARABLE'
      }
    ]
  },
  {
    id: 'PT-4409',
    name: 'Priya Nair',
    age: 28,
    gender: 'F',
    city: 'Mumbai',
    station: 'Chembur MPCB',
    severity: 'Mild Intermittent',
    controllerMedication: 'Fluticasone Propionate 125 µg (1 puff daily)',
    controllerAdherence: 84,
    rescueMedication: 'Salbutamol 100 µg MDI',
    baselineFEV1: 2.60,
    baselineFEV1Percent: 88,
    baselineFEV1FVC: 78,
    baselineRR: 14,
    baselineRHR: 64,
    allergens: ['Coastal Mold', 'Vehicle Exhaust'],
    smokingHistory: 'Never smoker',
    comorbidities: ['None'],
    flareUpsLastYear: 1,
    
    risk24h: 38,
    risk24hInterval: [31, 46],
    risk48h: 44,
    risk48hInterval: [36, 52],
    riskLevel: 'CAUTION',
    activeAlert: false,
    alertHeadline: 'Elevated humidity & coastal particulate shift; watch airway reactivity',
    alertTriggerTime: '2026-10-13 08:30 IST',
    leadTimeHours: 48,
    estimatedInflammationState: 0.49,
    inflammationThreshold: 0.60,

    currentTelemetry: {
      spo2: 95.2,
      rr: 15.8,
      rhr: 69,
      hrv: 42,
      sleepAwakenings: 1,
      deepSleepPercent: 18.2,
      steps: 8450,
      rescuePuffs24h: 1,
    },
    currentAirQuality: {
      pm25: 78,
      pm10: 142,
      aqi: 162,
      aqiCategory: 'Moderate',
      temp: 31.8,
      humidity: 84,
    },
    shapReasons: [
      {
        rank: 1,
        feature: 'High Relative Humidity (84%)',
        impactPercent: 32,
        direction: 'up',
        description: 'Persistent warm coastal humidity promotes bronchial smooth muscle hyperreactivity.',
        targetStream: 'AIR_QUALITY'
      },
      {
        rank: 2,
        feature: 'Mild RR Baseline Elevation',
        impactPercent: 24,
        direction: 'up',
        description: 'Resting respiratory rate +1.8 breaths/min over personal baseline.',
        targetStream: 'WEARABLE'
      },
      {
        rank: 3,
        feature: 'Consistent Controller Compliance',
        impactPercent: 22,
        direction: 'down',
        description: 'High adherence (84%) counteracts acute exposure accumulation.',
        targetStream: 'MEDICATION'
      },
      {
        rank: 4,
        feature: 'Preserved HRV Autonomic Tone',
        impactPercent: 22,
        direction: 'down',
        description: 'rMSSD maintained at 42ms indicating stable autonomic nervous balance.',
        targetStream: 'WEARABLE'
      }
    ]
  },
  {
    id: 'PT-1923',
    name: 'Rajesh Sharma',
    age: 52,
    gender: 'M',
    city: 'New Delhi',
    station: 'RK Puram DPCC',
    severity: 'Severe Persistent',
    controllerMedication: 'Fluticasone/Salmeterol 500/50 µg DPI (1 puff BID)',
    controllerAdherence: 72,
    rescueMedication: 'Ipratropium + Levosalbutamol Rotacaps',
    baselineFEV1: 1.95,
    baselineFEV1Percent: 58,
    baselineFEV1FVC: 61,
    baselineRR: 17,
    baselineRHR: 74,
    allergens: ['Nitrogen Dioxide', 'Particulate Matter', 'Cold Air'],
    smokingHistory: 'Former smoker (10 pack-years, quit 2018)',
    comorbidities: ['Hypertension', 'GERD'],
    flareUpsLastYear: 4,
    
    risk24h: 62,
    risk24hInterval: [54, 70],
    risk48h: 69,
    risk48hInterval: [61, 76],
    riskLevel: 'ELEVATED',
    activeAlert: true,
    alertHeadline: 'Prolonged cold inversion layer in Delhi NCR driving steady inflammation drift',
    alertTriggerTime: '2026-10-12 21:00 IST',
    leadTimeHours: 32,
    estimatedInflammationState: 0.68,
    inflammationThreshold: 0.62,

    currentTelemetry: {
      spo2: 92.8,
      rr: 19.8,
      rhr: 81,
      hrv: 21,
      sleepAwakenings: 3,
      deepSleepPercent: 11.0,
      steps: 3100,
      rescuePuffs24h: 3,
    },
    currentAirQuality: {
      pm25: 192,
      pm10: 340,
      aqi: 362,
      aqiCategory: 'Severe',
      temp: 21.0,
      humidity: 64,
    },
    shapReasons: [
      {
        rank: 1,
        feature: 'Reduced Baseline FEV1 Reserve (58%)',
        impactPercent: 38,
        direction: 'up',
        description: 'Low chronic airway caliber amplifies clinical consequences of mild inflammatory shifts.',
        targetStream: 'EHR'
      },
      {
        rank: 2,
        feature: 'Severe Ambient PM2.5 (192 µg/m³)',
        impactPercent: 30,
        direction: 'up',
        description: 'High wintertime particle density in RK Puram monitoring station.',
        targetStream: 'AIR_QUALITY'
      },
      {
        rank: 3,
        feature: 'Heart Rate Drift (+7 bpm)',
        impactPercent: 18,
        direction: 'up',
        description: 'Systemic sympathetic activation from heightened work of breathing.',
        targetStream: 'WEARABLE'
      },
      {
        rank: 4,
        feature: 'GERD Reflux Episodes',
        impactPercent: 14,
        direction: 'up',
        description: 'Vagal microaspiration risk during nocturnal supine sleep periods.',
        targetStream: 'EHR'
      }
    ]
  },
  {
    id: 'PT-6031',
    name: 'Ananya Gupta',
    age: 19,
    gender: 'F',
    city: 'Bengaluru',
    station: 'Silk Board KSPCB',
    severity: 'Moderate Persistent',
    controllerMedication: 'Beclomethasone 200 µg (1 puff BID)',
    controllerAdherence: 92,
    rescueMedication: 'Salbutamol 100 µg MDI',
    baselineFEV1: 2.70,
    baselineFEV1Percent: 82,
    baselineFEV1FVC: 75,
    baselineRR: 15,
    baselineRHR: 62,
    allergens: ['Parthenium Pollen', 'Animal Dander'],
    smokingHistory: 'Never smoker',
    comorbidities: ['Eczema'],
    flareUpsLastYear: 1,
    
    risk24h: 18,
    risk24hInterval: [12, 24],
    risk48h: 22,
    risk48hInterval: [15, 29],
    riskLevel: 'NORMAL',
    activeAlert: false,
    alertHeadline: 'Airway physiology well-controlled; low ambient pollution profile',
    alertTriggerTime: '2026-10-13 10:00 IST',
    leadTimeHours: 48,
    estimatedInflammationState: 0.28,
    inflammationThreshold: 0.65,

    currentTelemetry: {
      spo2: 97.5,
      rr: 14.8,
      rhr: 63,
      hrv: 56,
      sleepAwakenings: 0,
      deepSleepPercent: 22.4,
      steps: 10200,
      rescuePuffs24h: 0,
    },
    currentAirQuality: {
      pm25: 42,
      pm10: 74,
      aqi: 95,
      aqiCategory: 'Good',
      temp: 24.2,
      humidity: 62,
    },
    shapReasons: [
      {
        rank: 1,
        feature: 'High Controller Adherence (92%)',
        impactPercent: 44,
        direction: 'down',
        description: 'Consistent inhaled corticosteroid suppression maintains normal airway caliber.',
        targetStream: 'MEDICATION'
      },
      {
        rank: 2,
        feature: 'Clean Ambient Air (PM2.5: 42 µg/m³)',
        impactPercent: 30,
        direction: 'down',
        description: 'Post-monsoon Bengaluru air quality remains well below regional trigger cutoffs.',
        targetStream: 'AIR_QUALITY'
      },
      {
        rank: 3,
        feature: 'Restorative Sleep Architecture',
        impactPercent: 16,
        direction: 'down',
        description: '22.4% deep slow-wave sleep without nighttime micro-arousals.',
        targetStream: 'WEARABLE'
      },
      {
        rank: 4,
        feature: 'High Baseline HRV Reserve',
        impactPercent: 10,
        direction: 'down',
        description: 'rMSSD 56ms reflects excellent vagal buffer against bronchospasm.',
        targetStream: 'WEARABLE'
      }
    ]
  },
  {
    id: 'PT-3118',
    name: 'Vikram Malhotra',
    age: 45,
    gender: 'M',
    city: 'Kolkata',
    station: 'Victoria Memorial WBPCB',
    severity: 'Severe Refractory',
    controllerMedication: 'Fluticasone/Vilanterol 200/25 µg + Tiotropium',
    controllerAdherence: 58,
    rescueMedication: 'Formoterol/Budesonide SMART therapy',
    baselineFEV1: 1.62,
    baselineFEV1Percent: 51,
    baselineFEV1FVC: 58,
    baselineRR: 18,
    baselineRHR: 76,
    allergens: ['Industrial Particulates', 'Dust Mite', 'Aspergillus'],
    smokingHistory: 'Former smoker (5 pack-years, quit 2012)',
    comorbidities: ['Obstructive Sleep Apnea', 'Type 2 Diabetes'],
    flareUpsLastYear: 5,
    
    risk24h: 88,
    risk24hInterval: [82, 94],
    risk48h: 93,
    risk48hInterval: [87, 98],
    riskLevel: 'HIGH RISK',
    activeAlert: true,
    alertHeadline: 'Critical Exacerbation Window: Airway inflammation exceeds threshold by 42%',
    alertTriggerTime: '2026-10-13 04:15 IST',
    leadTimeHours: 24,
    estimatedInflammationState: 0.92,
    inflammationThreshold: 0.60,

    currentTelemetry: {
      spo2: 89.4,
      rr: 22.1,
      rhr: 87,
      hrv: 18,
      sleepAwakenings: 6,
      deepSleepPercent: 6.2,
      steps: 2400,
      rescuePuffs24h: 7,
    },
    currentAirQuality: {
      pm25: 165,
      pm10: 280,
      aqi: 318,
      aqiCategory: 'Severe',
      temp: 28.5,
      humidity: 78,
    },
    shapReasons: [
      {
        rank: 1,
        feature: 'Severe Drop in Resting SpO2 (89.4%)',
        impactPercent: 38,
        direction: 'up',
        description: 'Persistent hypoxemia and 7 rescue puffs consumed within last 24 hours.',
        targetStream: 'WEARABLE'
      },
      {
        rank: 2,
        feature: 'High Airway Inflammation State I(t)=0.92',
        impactPercent: 31,
        direction: 'up',
        description: 'Kalman filter latent airway model confirms near-complete loss of mucosal clearance.',
        targetStream: 'EHR'
      },
      {
        rank: 3,
        feature: 'Heavy Commute & Industrial Particulates',
        impactPercent: 18,
        direction: 'up',
        description: 'Exposure to Hooghly basin particulate plumes with zero N95 protection.',
        targetStream: 'AIR_QUALITY'
      },
      {
        rank: 4,
        feature: 'Severe Controller Non-Adherence (58%)',
        impactPercent: 13,
        direction: 'up',
        description: 'Intermittent steroid tapering has cleared steroid receptor occupancy.',
        targetStream: 'MEDICATION'
      }
    ]
  },
  {
    id: 'PT-5290',
    name: 'Sunita Patel',
    age: 61,
    gender: 'F',
    city: 'Ahmedabad',
    station: 'Maninagar GPCB',
    severity: 'Moderate Persistent',
    controllerMedication: 'Ciclesonide 160 µg (1 puff daily)',
    controllerAdherence: 76,
    rescueMedication: 'Levosalbutamol 50 µg MDI',
    baselineFEV1: 1.88,
    baselineFEV1Percent: 69,
    baselineFEV1FVC: 66,
    baselineRR: 16,
    baselineRHR: 70,
    allergens: ['Construction Dust', 'Pollen'],
    smokingHistory: 'Biomass cookstove exposure (20 years)',
    comorbidities: ['Osteoporosis'],
    flareUpsLastYear: 2,
    
    risk24h: 49,
    risk24hInterval: [41, 56],
    risk48h: 55,
    risk48hInterval: [48, 63],
    riskLevel: 'CAUTION',
    activeAlert: true,
    alertHeadline: 'Rising particulate index; moderate nighttime awakenings reported',
    alertTriggerTime: '2026-10-12 18:30 IST',
    leadTimeHours: 42,
    estimatedInflammationState: 0.58,
    inflammationThreshold: 0.64,

    currentTelemetry: {
      spo2: 93.6,
      rr: 17.2,
      rhr: 75,
      hrv: 33,
      sleepAwakenings: 2,
      deepSleepPercent: 14.1,
      steps: 5120,
      rescuePuffs24h: 2,
    },
    currentAirQuality: {
      pm25: 124,
      pm10: 210,
      aqi: 245,
      aqiCategory: 'Poor',
      temp: 34.0,
      humidity: 52,
    },
    shapReasons: [
      {
        rank: 1,
        feature: 'Construction Particulate Exposure (PM10: 210)',
        impactPercent: 34,
        direction: 'up',
        description: 'Elevated coarse particles irritating upper bronchial airways.',
        targetStream: 'AIR_QUALITY'
      },
      {
        rank: 2,
        feature: 'Biomass Exposure Airway Remodeling',
        impactPercent: 28,
        direction: 'up',
        description: 'Historical biomass exposure predisposes patient to accelerated cytokine release.',
        targetStream: 'EHR'
      },
      {
        rank: 3,
        feature: 'Stable Daytime Mobility (5.1k Steps)',
        impactPercent: 20,
        direction: 'down',
        description: 'Physical activity preservation shows functional compensation.',
        targetStream: 'WEARABLE'
      },
      {
        rank: 4,
        feature: 'Rescue Inhaler Infrequent Use (2 puffs)',
        impactPercent: 18,
        direction: 'down',
        description: 'Symptom load currently contained within safety buffer.',
        targetStream: 'MEDICATION'
      }
    ]
  }
];

export const PATIENT_TELEMETRY_SERIES: Record<string, TelemetryPoint[]> = {
  'PT-8821': [
    { day: 'Day 1', dayShort: 'D-6', date: 'Oct 07', spo2: 96.2, rr: 15.1, rhr: 66, hrv: 46, sleepAwakenings: 1, rescuePuffs: 0, pm25: 54, inflammationState: 0.28, threshold: 0.65 },
    { day: 'Day 2', dayShort: 'D-5', date: 'Oct 08', spo2: 95.8, rr: 15.4, rhr: 67, hrv: 44, sleepAwakenings: 1, rescuePuffs: 1, pm25: 68, inflammationState: 0.34, threshold: 0.65 },
    { day: 'Day 3', dayShort: 'D-4', date: 'Oct 09', spo2: 95.0, rr: 16.0, rhr: 69, hrv: 39, sleepAwakenings: 2, rescuePuffs: 1, pm25: 92, inflammationState: 0.44, threshold: 0.65 },
    { day: 'Day 4', dayShort: 'D-3', date: 'Oct 10', spo2: 94.2, rr: 16.8, rhr: 71, hrv: 35, sleepAwakenings: 2, rescuePuffs: 2, pm25: 128, inflammationState: 0.55, threshold: 0.65 },
    { day: 'Day 5', dayShort: 'D-2', date: 'Oct 11', spo2: 93.1, rr: 17.6, rhr: 74, hrv: 29, sleepAwakenings: 3, rescuePuffs: 3, pm25: 155, inflammationState: 0.67, threshold: 0.65 },
    { day: 'Day 6', dayShort: 'D-1', date: 'Oct 12', spo2: 92.4, rr: 18.5, rhr: 76, hrv: 26, sleepAwakenings: 4, rescuePuffs: 4, pm25: 176, inflammationState: 0.77, threshold: 0.65 },
    { day: 'Day 7 (Now)', dayShort: 'Now', date: 'Oct 13', spo2: 91.5, rr: 19.4, rhr: 78, hrv: 24, sleepAwakenings: 4, rescuePuffs: 5, pm25: 184, inflammationState: 0.84, threshold: 0.65 },
  ],
  'PT-4409': [
    { day: 'Day 1', dayShort: 'D-6', date: 'Oct 07', spo2: 97.0, rr: 14.0, rhr: 63, hrv: 52, sleepAwakenings: 0, rescuePuffs: 0, pm25: 48, inflammationState: 0.22, threshold: 0.60 },
    { day: 'Day 2', dayShort: 'D-5', date: 'Oct 08', spo2: 96.8, rr: 14.2, rhr: 64, hrv: 50, sleepAwakenings: 0, rescuePuffs: 0, pm25: 55, inflammationState: 0.26, threshold: 0.60 },
    { day: 'Day 3', dayShort: 'D-4', date: 'Oct 09', spo2: 96.5, rr: 14.5, rhr: 65, hrv: 48, sleepAwakenings: 1, rescuePuffs: 0, pm25: 62, inflammationState: 0.32, threshold: 0.60 },
    { day: 'Day 4', dayShort: 'D-3', date: 'Oct 10', spo2: 96.0, rr: 14.9, rhr: 66, hrv: 46, sleepAwakenings: 1, rescuePuffs: 1, pm25: 71, inflammationState: 0.38, threshold: 0.60 },
    { day: 'Day 5', dayShort: 'D-2', date: 'Oct 11', spo2: 95.8, rr: 15.2, rhr: 67, hrv: 45, sleepAwakenings: 1, rescuePuffs: 1, pm25: 75, inflammationState: 0.42, threshold: 0.60 },
    { day: 'Day 6', dayShort: 'D-1', date: 'Oct 12', spo2: 95.5, rr: 15.5, rhr: 68, hrv: 43, sleepAwakenings: 1, rescuePuffs: 1, pm25: 76, inflammationState: 0.46, threshold: 0.60 },
    { day: 'Day 7 (Now)', dayShort: 'Now', date: 'Oct 13', spo2: 95.2, rr: 15.8, rhr: 69, hrv: 42, sleepAwakenings: 1, rescuePuffs: 1, pm25: 78, inflammationState: 0.49, threshold: 0.60 },
  ],
  'PT-1923': [
    { day: 'Day 1', dayShort: 'D-6', date: 'Oct 07', spo2: 94.8, rr: 17.2, rhr: 73, hrv: 32, sleepAwakenings: 2, rescuePuffs: 1, pm25: 110, inflammationState: 0.45, threshold: 0.62 },
    { day: 'Day 2', dayShort: 'D-5', date: 'Oct 08', spo2: 94.5, rr: 17.5, rhr: 74, hrv: 30, sleepAwakenings: 2, rescuePuffs: 1, pm25: 125, inflammationState: 0.49, threshold: 0.62 },
    { day: 'Day 3', dayShort: 'D-4', date: 'Oct 09', spo2: 94.1, rr: 18.0, rhr: 76, hrv: 28, sleepAwakenings: 2, rescuePuffs: 2, pm25: 140, inflammationState: 0.54, threshold: 0.62 },
    { day: 'Day 4', dayShort: 'D-3', date: 'Oct 10', spo2: 93.8, rr: 18.5, rhr: 77, hrv: 26, sleepAwakenings: 3, rescuePuffs: 2, pm25: 160, inflammationState: 0.59, threshold: 0.62 },
    { day: 'Day 5', dayShort: 'D-2', date: 'Oct 11', spo2: 93.4, rr: 19.0, rhr: 79, hrv: 24, sleepAwakenings: 3, rescuePuffs: 3, pm25: 178, inflammationState: 0.63, threshold: 0.62 },
    { day: 'Day 6', dayShort: 'D-1', date: 'Oct 12', spo2: 93.0, rr: 19.4, rhr: 80, hrv: 22, sleepAwakenings: 3, rescuePuffs: 3, pm25: 188, inflammationState: 0.66, threshold: 0.62 },
    { day: 'Day 7 (Now)', dayShort: 'Now', date: 'Oct 13', spo2: 92.8, rr: 19.8, rhr: 81, hrv: 21, sleepAwakenings: 3, rescuePuffs: 3, pm25: 192, inflammationState: 0.68, threshold: 0.62 },
  ],
  'PT-6031': [
    { day: 'Day 1', dayShort: 'D-6', date: 'Oct 07', spo2: 98.0, rr: 14.5, rhr: 61, hrv: 62, sleepAwakenings: 0, rescuePuffs: 0, pm25: 35, inflammationState: 0.20, threshold: 0.65 },
    { day: 'Day 2', dayShort: 'D-5', date: 'Oct 08', spo2: 98.1, rr: 14.6, rhr: 61, hrv: 60, sleepAwakenings: 0, rescuePuffs: 0, pm25: 38, inflammationState: 0.22, threshold: 0.65 },
    { day: 'Day 3', dayShort: 'D-4', date: 'Oct 09', spo2: 97.8, rr: 14.7, rhr: 62, hrv: 58, sleepAwakenings: 0, rescuePuffs: 0, pm25: 40, inflammationState: 0.24, threshold: 0.65 },
    { day: 'Day 4', dayShort: 'D-3', date: 'Oct 10', spo2: 97.6, rr: 14.8, rhr: 62, hrv: 57, sleepAwakenings: 0, rescuePuffs: 0, pm25: 41, inflammationState: 0.25, threshold: 0.65 },
    { day: 'Day 5', dayShort: 'D-2', date: 'Oct 11', spo2: 97.5, rr: 14.8, rhr: 63, hrv: 56, sleepAwakenings: 0, rescuePuffs: 0, pm25: 42, inflammationState: 0.26, threshold: 0.65 },
    { day: 'Day 6', dayShort: 'D-1', date: 'Oct 12', spo2: 97.4, rr: 14.9, rhr: 63, hrv: 55, sleepAwakenings: 0, rescuePuffs: 0, pm25: 42, inflammationState: 0.27, threshold: 0.65 },
    { day: 'Day 7 (Now)', dayShort: 'Now', date: 'Oct 13', spo2: 97.5, rr: 14.8, rhr: 63, hrv: 56, sleepAwakenings: 0, rescuePuffs: 0, pm25: 42, inflammationState: 0.28, threshold: 0.65 },
  ],
  'PT-3118': [
    { day: 'Day 1', dayShort: 'D-6', date: 'Oct 07', spo2: 93.0, rr: 18.2, rhr: 78, hrv: 26, sleepAwakenings: 3, rescuePuffs: 2, pm25: 110, inflammationState: 0.52, threshold: 0.60 },
    { day: 'Day 2', dayShort: 'D-5', date: 'Oct 08', spo2: 92.5, rr: 18.8, rhr: 79, hrv: 24, sleepAwakenings: 3, rescuePuffs: 3, pm25: 122, inflammationState: 0.59, threshold: 0.60 },
    { day: 'Day 3', dayShort: 'D-4', date: 'Oct 09', spo2: 91.8, rr: 19.5, rhr: 81, hrv: 22, sleepAwakenings: 4, rescuePuffs: 4, pm25: 135, inflammationState: 0.66, threshold: 0.60 },
    { day: 'Day 4', dayShort: 'D-3', date: 'Oct 10', spo2: 91.2, rr: 20.2, rhr: 83, hrv: 21, sleepAwakenings: 5, rescuePuffs: 5, pm25: 148, inflammationState: 0.74, threshold: 0.60 },
    { day: 'Day 5', dayShort: 'D-2', date: 'Oct 11', spo2: 90.5, rr: 21.0, rhr: 85, hrv: 19, sleepAwakenings: 5, rescuePuffs: 6, pm25: 156, inflammationState: 0.82, threshold: 0.60 },
    { day: 'Day 6', dayShort: 'D-1', date: 'Oct 12', spo2: 89.8, rr: 21.7, rhr: 86, hrv: 18, sleepAwakenings: 6, rescuePuffs: 7, pm25: 162, inflammationState: 0.88, threshold: 0.60 },
    { day: 'Day 7 (Now)', dayShort: 'Now', date: 'Oct 13', spo2: 89.4, rr: 22.1, rhr: 87, hrv: 18, sleepAwakenings: 6, rescuePuffs: 7, pm25: 165, inflammationState: 0.92, threshold: 0.60 },
  ],
  'PT-5290': [
    { day: 'Day 1', dayShort: 'D-6', date: 'Oct 07', spo2: 95.5, rr: 16.0, rhr: 71, hrv: 40, sleepAwakenings: 1, rescuePuffs: 1, pm25: 85, inflammationState: 0.38, threshold: 0.64 },
    { day: 'Day 2', dayShort: 'D-5', date: 'Oct 08', spo2: 95.0, rr: 16.2, rhr: 72, hrv: 39, sleepAwakenings: 1, rescuePuffs: 1, pm25: 94, inflammationState: 0.42, threshold: 0.64 },
    { day: 'Day 3', dayShort: 'D-4', date: 'Oct 09', spo2: 94.6, rr: 16.5, rhr: 72, hrv: 37, sleepAwakenings: 1, rescuePuffs: 1, pm25: 104, inflammationState: 0.47, threshold: 0.64 },
    { day: 'Day 4', dayShort: 'D-3', date: 'Oct 10', spo2: 94.2, rr: 16.8, rhr: 73, hrv: 35, sleepAwakenings: 2, rescuePuffs: 2, pm25: 112, inflammationState: 0.51, threshold: 0.64 },
    { day: 'Day 5', dayShort: 'D-2', date: 'Oct 11', spo2: 94.0, rr: 17.0, rhr: 74, hrv: 34, sleepAwakenings: 2, rescuePuffs: 2, pm25: 118, inflammationState: 0.54, threshold: 0.64 },
    { day: 'Day 6', dayShort: 'D-1', date: 'Oct 12', spo2: 93.8, rr: 17.1, rhr: 74, hrv: 33, sleepAwakenings: 2, rescuePuffs: 2, pm25: 122, inflammationState: 0.56, threshold: 0.64 },
    { day: 'Day 7 (Now)', dayShort: 'Now', date: 'Oct 13', spo2: 93.6, rr: 17.2, rhr: 75, hrv: 33, sleepAwakenings: 2, rescuePuffs: 2, pm25: 124, inflammationState: 0.58, threshold: 0.64 },
  ]
};

export const SIMULATOR_ASSUMPTIONS: SimulatorAssumption[] = [
  {
    id: 'ASM-01',
    parameter: 'Airway Recovery Rate Constant',
    symbol: 'k',
    value: '0.12 ± 0.03',
    unit: 'day⁻¹',
    physiologicalRole: 'Governs natural spontaneous resolution rate of subclinical eosinophilic and neutrophilic mucosal inflammation once acute trigger is withdrawn.',
    citation: 'Barnes PJ. "Mechanisms and resistance in glucocorticoid action in asthma." Lancet Respir Med.',
    citationDoi: '10.1016/S2213-2600(13)70172-8',
    year: 2013
  },
  {
    id: 'ASM-02',
    parameter: 'Particulate Inhaled Dose Sensitivity',
    symbol: 'a',
    value: '0.0042',
    unit: 'µg⁻¹·m³·day⁻¹',
    physiologicalRole: 'Relates inhaled ambient PM2.5 dose (scaled by minute ventilation and hours outdoors) to daily increment in latent inflammation state I(t).',
    citation: 'Darrow LA, et al. "Air pollution and acute asthma exacerbations among urban children." Am J Respir Crit Care Med.',
    citationDoi: '10.1164/rccm.201312-2238OC',
    year: 2014
  },
  {
    id: 'ASM-03',
    parameter: 'Controller Medication Efficacy Scalar',
    symbol: 'c',
    value: '0.45',
    unit: 'adherence_ratio·day⁻¹',
    physiologicalRole: 'Suppressive rate of inhaled corticosteroids (ICS) on mucosal cytokine transcription factor NF-κB, scaled by recorded prescription adherence.',
    citation: 'GINA Executive Committee. "Global Strategy for Asthma Management and Prevention: Evidence Review."',
    citationDoi: '10.1183/13993003.00615-2022',
    year: 2022
  },
  {
    id: 'ASM-04',
    parameter: 'Secondary Meteorological Trigger Sensitivity',
    symbol: 'b',
    value: '0.085',
    unit: 'dimensionless',
    physiologicalRole: 'Co-modulator capturing cold dry air hyperpnea and rapid barometric swings triggering mast cell degranulation.',
    citation: 'Donaldson GC, et al. "Effect of temperature and air pollution on respiratory admissions." Thorax.',
    citationDoi: '10.1136/thx.2005.048348',
    year: 2006
  },
  {
    id: 'ASM-05',
    parameter: 'SpO2 Sensor Gaussian Noise Variance',
    symbol: 'σ_SpO2',
    value: '1.4',
    unit: '% saturation',
    physiologicalRole: 'Photoplethysmography noise reflecting wrist motion artifacts, skin pigmentation optical absorption bias, and peripheral vasoconstriction.',
    citation: 'Sjoding MW, et al. "Racial Bias in Pulse Oximetry Measurement." New England Journal of Medicine.',
    citationDoi: '10.1056/NEJMc2029240',
    year: 2020
  },
  {
    id: 'ASM-06',
    parameter: 'Respiratory Rate Latency Lag',
    symbol: 'τ_RR',
    value: '6.5 ± 2.0',
    unit: 'hours',
    physiologicalRole: 'Temporal delay between alveolar cytokine surge and compensatory chemoreceptor stimulation leading to elevated resting respiratory rate.',
    citation: 'ATS/ERS Statement. "Asthma control and exacerbations: standardizing endpoints for clinical trials."',
    citationDoi: '10.1164/rccm.200801-060ST',
    year: 2009
  },
  {
    id: 'ASM-07',
    parameter: 'N95 Respirator Particulate Penetration Factor',
    symbol: 'η_N95',
    value: '0.05 (95% filtration)',
    unit: 'filtration efficiency',
    physiologicalRole: 'Reduction factor applied to ambient PM2.5 concentration during outdoor transit when an N95 certified respirator is actively worn.',
    citation: 'NIOSH / CDC. "Evaluation of Particle Penetration and Breathing Resistance of Filtering Facepiece Respirators."',
    citationDoi: '10.26616/NIOSHPUB2020120',
    year: 2020
  }
];

export const BENCHMARKS: BenchmarkModel[] = [
  {
    name: 'Air Quality Threshold Rule (Baseline)',
    category: 'Baseline',
    prAuc: 0.42,
    rocAuc: 0.61,
    brierScore: 0.28,
    leadTimeHours: 14,
    falseAlarmsPerWeek: 4.8,
    notes: 'Triggers alert whenever ambient PM2.5 > 150 µg/m³. Ignores individual physiology, resulting in high false positives in winter months.'
  },
  {
    name: 'EHR-Only Logistic Regression (Baseline)',
    category: 'Baseline',
    prAuc: 0.49,
    rocAuc: 0.68,
    brierScore: 0.24,
    leadTimeHours: 0,
    falseAlarmsPerWeek: 3.1,
    notes: 'Static clinical profile only. Cannot detect acute intra-week deterioration between hospital visits.'
  },
  {
    name: 'Wearable-Only GRU (Baseline)',
    category: 'Baseline',
    prAuc: 0.68,
    rocAuc: 0.81,
    brierScore: 0.17,
    leadTimeHours: 21,
    falseAlarmsPerWeek: 1.9,
    notes: 'Recurrent model over wearable time series without environmental context or causal latent state.'
  },
  {
    name: 'Ablation: Full Twin minus EHR Stream',
    category: 'Ablation',
    prAuc: 0.72,
    rocAuc: 0.84,
    brierScore: 0.15,
    leadTimeHours: 26,
    falseAlarmsPerWeek: 1.5,
    notes: 'Proves EHR conditioning provides crucial baseline calibration (Δ PR-AUC -0.11).'
  },
  {
    name: 'Ablation: Full Twin minus Air Quality Stream',
    category: 'Ablation',
    prAuc: 0.70,
    rocAuc: 0.83,
    brierScore: 0.16,
    leadTimeHours: 19,
    falseAlarmsPerWeek: 1.8,
    notes: 'Proves real open environmental stream is essential for 36-48h early lead time (Δ Lead Time -17h).'
  },
  {
    name: 'Ablation: Full Twin minus State Estimator I(t)',
    category: 'Ablation',
    prAuc: 0.74,
    rocAuc: 0.85,
    brierScore: 0.14,
    leadTimeHours: 28,
    falseAlarmsPerWeek: 1.3,
    notes: 'Pure black-box neural model lacking mechanistic latent filter.'
  },
  {
    name: 'BreathTwin Hybrid Core (Proposed)',
    category: 'BreathTwin Core',
    prAuc: 0.83,
    rocAuc: 0.92,
    brierScore: 0.09,
    leadTimeHours: 36,
    falseAlarmsPerWeek: 0.7,
    notes: 'Full fused architecture: Synthea EHR conditioning + Latent Kalman filter I(t) + Temporal ConvNet + Conformal uncertainty.'
  }
];
