import {
  Patient,
  TelemetryPoint,
  SimulatorAssumption,
  BenchmarkModel,
  PATIENTS,
  PATIENT_TELEMETRY_SERIES,
  SIMULATOR_ASSUMPTIONS,
  BENCHMARKS,
} from './data';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export interface ClockInfo {
  current_hour: number;
  day_number: number;
  hour_of_day: number;
  day_label: string;
  simulated_time_iso: string;
  formatted_time: string;
  min_hour: number;
  max_hour: number;
  is_playing: boolean;
  speed: number;
}

export interface WhatIfParams {
  patient_id?: string;
  base_risk_48h: number;
  base_inflammation: number;
  current_pm25: number;
  current_adherence_pct: number;
  outdoor_hours: number;
  wear_n95: boolean;
  target_adherence_pct?: number;
  hepa_purifier: boolean;
  horizon_hours?: number;
}

export interface WhatIfResponse {
  baseRisk: number;
  simulatedRisk: number;
  riskDelta: number;
  baseInflammation: number;
  simulatedInflammation: number;
  simulatedStatus: 'NORMAL' | 'CAUTION' | 'ELEVATED' | 'HIGH RISK';
  recommendedAction: string;
  recommendations?: string[];
  interventions: {
    outdoorHours: number;
    wearN95: boolean;
    targetAdherence: number;
    hepaPurifier: boolean;
  };
}

export interface CopilotReport {
  patient_id: string;
  clinical_status: 'Stable' | 'Warning' | 'High Risk';
  risk_level: 'Low' | 'Medium' | 'High';
  summary_reason: string;
  precautions: string[];
  triggers_to_avoid: string[];
  breathing_exercise: {
    name: string;
    purpose: string;
    how_to_do_it: string[];
    duration: string;
  } | null;
  medication_guidance: {
    action: string;
    note: string;
  };
  emergency_warning: string;
}

/** Check backend health */
export async function getHealth(): Promise<{ status: string; service: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Get current simulation clock */
export async function getClock(): Promise<ClockInfo> {
  try {
    const res = await fetch(`${API_BASE}/clock`, { cache: 'no-store' });
    if (res.ok) return await res.json();
  } catch {
    // fallback
  }
  return {
    current_hour: 168,
    day_number: 8,
    hour_of_day: 0,
    day_label: 'Day 8 (Now)',
    simulated_time_iso: '2026-10-14T00:00:00+05:30',
    formatted_time: '2026-10-14 00:00 IST',
    min_hour: 12,
    max_hour: 239,
    is_playing: false,
    speed: 1.0,
  };
}

/** Set simulation clock hour */
export async function setClockHour(hour: number): Promise<ClockInfo | null> {
  try {
    const res = await fetch(`${API_BASE}/clock/set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hour }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.clock;
    }
  } catch (e) {
    console.warn('Failed to set clock:', e);
  }
  return null;
}

/** Step simulation clock */
export async function stepClock(hours: number = 1): Promise<ClockInfo | null> {
  try {
    const res = await fetch(`${API_BASE}/clock/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hours }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.clock;
    }
  } catch (e) {
    console.warn('Failed to step clock:', e);
  }
  return null;
}

export interface CreatePatientInput {
  name: string;
  age: number;
  gender?: string;
  city: string;
  station?: string;
  asthma_severity: string;
  baseline_fev1_pct?: number;
  baseline_fev1_fvc?: number;
  baseline_pef_lmin?: number;
  baseline_spo2?: number;
  baseline_resting_hr?: number;
  baseline_rr?: number;
  controller_medication?: string;
  controller_adherence?: number;
  smoking_status?: string;
  pack_years?: number;
  copd_status?: boolean;
  comorbidity_burden?: number;
  flare_ups_last_year?: number;
  hospitalized?: boolean;
  allergens?: string;
}

const CUSTOM_PATIENTS_KEY = 'digi_custom_patients';

export function getStoredCustomPatients(): Patient[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_PATIENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('Failed to parse custom patients from localStorage:', e);
    return [];
  }
}

export function saveStoredCustomPatient(patient: Patient) {
  if (typeof window === 'undefined') return;
  try {
    const existing = getStoredCustomPatients().filter((p) => p.id !== patient.id);
    localStorage.setItem(CUSTOM_PATIENTS_KEY, JSON.stringify([patient, ...existing]));
  } catch (e) {
    console.warn('Failed to save custom patient to localStorage:', e);
  }
}

/** Enroll a new patient into the multimodal digital twin neural inference core */
export async function createPatient(input: CreatePatientInput): Promise<Patient> {
  try {
    const res = await fetch(`${API_BASE}/patients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (res.ok) {
      const data: Patient = await res.json();
      saveStoredCustomPatient(data);
      return data;
    }
  } catch (e) {
    console.warn('Failed to register patient with API, synthesizing local twin:', e);
  }

  // Resilient fallback: synthesize digital twin client-side if backend is offline
  const randId = `PT-${Math.floor(1000 + Math.random() * 9000)}`;
  const adherence = input.controller_adherence ?? 75;
  const fev1 = input.baseline_fev1_pct ?? 70;
  const isHighRisk = fev1 < 60 || adherence < 50 || input.smoking_status === 'Active';
  const risk48h = isHighRisk ? 72.0 : 18.5;
  const riskLevel = risk48h >= 70 ? 'HIGH RISK' : risk48h >= 50 ? 'ELEVATED' : 'NORMAL';

  const syntheticPatient: Patient = {
    id: randId,
    name: input.name,
    age: input.age,
    gender: (input.gender === 'Female' ? 'F' : 'M'),
    city: input.city,
    station: input.station || `${input.city} Central Monitor`,
    severity: (input.asthma_severity.replace('_', ' ') as any) || 'Moderate Persistent',
    controllerMedication: (input.controller_medication || 'Budesonide Formoterol 200 6').replace(/_/g, ' '),
    controllerAdherence: adherence,
    rescueMedication: 'Levosalbutamol 50 µg MDI',
    baselineFEV1: +(fev1 * 0.035).toFixed(2),
    baselineFEV1Percent: fev1,
    baselineFEV1FVC: Math.round((input.baseline_fev1_fvc ?? 0.72) * 100),
    baselineRR: input.baseline_rr ?? 16,
    baselineRHR: input.baseline_resting_hr ?? 74,
    allergens: input.allergens ? input.allergens.split(',').map(s => s.trim()) : ['Dust Mites', 'Vehicle Exhaust'],
    smokingHistory: input.smoking_status === 'Active' ? `Active Smoker (${input.pack_years || 5} pack-years)` : 'Never Smoked',
    comorbidities: input.copd_status ? ['COPD', 'Hypertension'] : ['None'],
    flareUpsLastYear: input.flare_ups_last_year ?? 1,
    risk24h: +(risk48h * 0.85).toFixed(1),
    risk24hInterval: [Math.max(0, Math.round(risk48h * 0.7)), Math.min(100, Math.round(risk48h * 0.95))],
    risk48h,
    risk48hInterval: [Math.max(0, Math.round(risk48h * 0.8)), Math.min(100, Math.round(risk48h * 1.15))],
    riskLevel,
    activeAlert: risk48h >= 70,
    alertHeadline: risk48h >= 70 ? 'Acute 48h flare-up risk elevation predicted' : 'Airway physiology stable; within baseline bounds',
    alertTriggerTime: '2026-10-14 06:00 IST',
    leadTimeHours: 48,
    estimatedInflammationState: risk48h >= 70 ? 0.78 : 0.22,
    inflammationThreshold: 0.65,
    currentTelemetry: {
      spo2: input.baseline_spo2 ?? 96.0,
      rr: input.baseline_rr ?? 16,
      rhr: input.baseline_resting_hr ?? 72,
      hrv: 48.0,
      sleepAwakenings: 1,
      deepSleepPercent: 18.0,
      steps: 5400,
      rescuePuffs24h: 1,
    },
    currentAirQuality: {
      pm25: 142.0,
      pm10: 210.0,
      aqi: 184,
      aqiCategory: 'Poor',
      temp: 26.5,
      humidity: 58.0,
    },
    shapReasons: [
      {
        rank: 1,
        feature: 'Environmental PM2.5 Exposure',
        impactPercent: 32,
        direction: 'up',
        description: `High localized PM2.5 in ${input.city} elevates airway oxidative stress.`,
        targetStream: 'AIR_QUALITY',
      },
      {
        rank: 2,
        feature: 'Controller Inhaler Adherence',
        impactPercent: 24,
        direction: adherence < 70 ? 'up' : 'down',
        description: `Adherence recorded at ${adherence}%.`,
        targetStream: 'MEDICATION',
      },
      {
        rank: 3,
        feature: 'Baseline Airway Obstruction (FEV1)',
        impactPercent: 18,
        direction: fev1 < 70 ? 'up' : 'down',
        description: `Baseline FEV1 at ${fev1}% of predicted.`,
        targetStream: 'EHR',
      },
    ],
  };

  saveStoredCustomPatient(syntheticPatient);
  return syntheticPatient;
}

/** Get cohort roster with live 24h & 48h neural risks */
export async function getPatients(limit: number = 12, hour?: number): Promise<Patient[]> {
  const localCustom = getStoredCustomPatients();
  try {
    const url = new URL(`${API_BASE}/patients`);
    url.searchParams.set('limit', limit.toString());
    if (hour !== undefined) {
      url.searchParams.set('hour', hour.toString());
    }
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (res.ok) {
      const data: Patient[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        // Merge any locally stored custom patients that aren't already present in backend roster
        const existingIds = new Set(data.map((p) => p.id));
        const missingCustom = localCustom.filter((p) => !existingIds.has(p.id));
        return [...missingCustom, ...data];
      }
    }
  } catch (e) {
    console.warn('Failed to fetch patients from API, using local cache:', e);
  }

  // Merge static PATIENTS with custom patients
  const existingIds = new Set(localCustom.map((p) => p.id));
  const combined = [...localCustom, ...PATIENTS.filter((p) => !existingIds.has(p.id))];
  return combined;
}

/** Get individual patient digital twin state */
export async function getPatient(patientId: string, hour?: number): Promise<Patient> {
  const localCustom = getStoredCustomPatients();
  const cachedMatch = localCustom.find((p) => p.id === patientId);

  try {
    const url = new URL(`${API_BASE}/patients/${encodeURIComponent(patientId)}`);
    if (hour !== undefined) {
      url.searchParams.set('hour', hour.toString());
    }
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (res.ok) {
      const data: Patient = await res.json();
      if (data && data.id) {
        // Update local cache with latest state from server
        saveStoredCustomPatient(data);
        return data;
      }
    }
  } catch (e) {
    console.warn(`Failed to fetch patient ${patientId} from API, using local cache:`, e);
  }

  if (cachedMatch) return cachedMatch;
  return PATIENTS.find((p) => p.id === patientId) || PATIENTS[0];
}

/** Request a patient-specific report from the backend model and LLM. */
export async function getPatientCopilotReport(
  patientId: string,
  hour?: number
): Promise<CopilotReport> {
  const url = new URL(`${API_BASE}/patients/${encodeURIComponent(patientId)}/copilot-report`);
  if (hour !== undefined) {
    url.searchParams.set('hour', hour.toString());
  }

  const res = await fetch(url.toString(), { method: 'POST', cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body && typeof body.detail === 'string' ? body.detail : 'Report generation failed.';
    throw new Error(detail);
  }

  return res.json();
}

/** Get patient telemetry stream replayed through simulation clock */
export async function getPatientTelemetry(
  patientId: string,
  hour?: number
): Promise<TelemetryPoint[]> {
  try {
    const url = new URL(`${API_BASE}/patients/${encodeURIComponent(patientId)}/telemetry`);
    if (hour !== undefined) {
      url.searchParams.set('hour', hour.toString());
    }
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.points) && data.points.length > 0) {
        return data.points;
      }
    }
  } catch (e) {
    console.warn(`Failed to fetch telemetry for ${patientId}, using local cache:`, e);
  }

  // If this is a custom registered patient, synthesize 8 daily telemetry points conditioned on their vitals
  const custom = getStoredCustomPatients().find((p) => p.id === patientId);
  if (custom) {
    const baseSpo2 = custom.currentTelemetry.spo2;
    const baseRR = custom.baselineRR;
    const baseRHR = custom.baselineRHR;
    return Array.from({ length: 8 }, (_, i) => {
      const dayNum = i + 1;
      const factor = i / 7;
      const rescuePuffs = custom.risk48h > 50 ? (i >= 5 ? 2 + (i - 5) : 0) : 0;
      const inflammationState = +(0.2 + (custom.risk48h / 100) * 0.6 * factor).toFixed(2);
      return {
        day: dayNum === 8 ? 'Day 8 (Now)' : `Day ${dayNum}`,
        dayShort: `D${dayNum}`,
        date: `2026-10-${String(7 + i).padStart(2, '0')}`,
        spo2: +(baseSpo2 - (custom.risk48h > 50 ? factor * 2.2 : 0)).toFixed(1),
        rr: +(baseRR + (custom.risk48h > 50 ? factor * 4.0 : 0)).toFixed(1),
        rhr: +(baseRHR + (custom.risk48h > 50 ? factor * 6.5 : 0)).toFixed(1),
        hrv: +(48.0 - (custom.risk48h > 50 ? factor * 14.0 : 0)).toFixed(1),
        sleepAwakenings: custom.risk48h > 50 ? Math.round(1 + factor * 3) : 1,
        rescuePuffs,
        pm25: custom.currentAirQuality.pm25,
        inflammationState,
        threshold: 0.65,
      };
    });
  }

  return PATIENT_TELEMETRY_SERIES[patientId] || PATIENT_TELEMETRY_SERIES['PT-8821'];
}

/** Run Mechanistic Counterfactual What-If ODE Simulation */
export async function simulateWhatIf(params: WhatIfParams): Promise<WhatIfResponse> {
  try {
    const res = await fetch(`${API_BASE}/what-if`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('Failed to run what-if simulation on API, computing local approximation:', e);
  }

  // Fallback local analytical ODE solver if backend is unreachable
  const outdoorReduction = Math.max(0, (2.5 - params.outdoor_hours) * 7.5);
  const n95Reduction = params.wear_n95 ? 18 : 0;
  const adherenceDiff = (params.target_adherence_pct ?? params.current_adherence_pct) - params.current_adherence_pct;
  const adherenceReduction = (adherenceDiff / 100) * 22;
  const hepaReduction = params.hepa_purifier ? 8 : 0;
  const totalReduction = Math.round(outdoorReduction + n95Reduction + adherenceReduction + hepaReduction);

  const simulatedRisk = Math.max(12, Math.min(99, Math.round(params.base_risk_48h - totalReduction)));
  const simulatedInflammation = Math.max(0.2, params.base_inflammation - (totalReduction / 100) * 0.45);
  const simulatedStatus =
    simulatedRisk >= 70
      ? 'HIGH RISK'
      : simulatedRisk >= 55
      ? 'ELEVATED'
      : simulatedRisk >= 35
      ? 'CAUTION'
      : 'NORMAL';

  return {
    baseRisk: params.base_risk_48h,
    simulatedRisk,
    riskDelta: simulatedRisk - params.base_risk_48h,
    baseInflammation: params.base_inflammation,
    simulatedInflammation: Math.round(simulatedInflammation * 100) / 100,
    simulatedStatus,
    recommendedAction:
      simulatedRisk < 40
        ? 'Counterfactual intervention successful. Low risk profile predicted.'
        : 'Partial risk reduction. Monitor closely.',
    interventions: {
      outdoorHours: params.outdoor_hours,
      wearN95: params.wear_n95,
      targetAdherence: params.target_adherence_pct ?? params.current_adherence_pct,
      hepaPurifier: params.hepa_purifier,
    },
  };
}

/** Get simulator clinical parameter assumptions and citations */
export async function getAssumptions(): Promise<SimulatorAssumption[]> {
  try {
    const res = await fetch(`${API_BASE}/assumptions`, { cache: 'no-store' });
    if (res.ok) return await res.json();
  } catch {}
  return SIMULATOR_ASSUMPTIONS;
}

/** Get model benchmark comparisons and ablation results */
export async function getBenchmarks(): Promise<BenchmarkModel[]> {
  try {
    const res = await fetch(`${API_BASE}/benchmarks`, { cache: 'no-store' });
    if (res.ok) return await res.json();
  } catch {}
  return BENCHMARKS;
}

export interface DatabaseStatus {
  status: string;
  database: string;
  version: string;
  counts: {
    patients: number;
    patient_history: number;
    clinical_events: number;
    timeseries_telemetry: number;
    patient_daily_logs: number;
  };
}

/** Get live PostgreSQL database status and row counts */
export async function getDatabaseStatus(): Promise<DatabaseStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/db/status`, { cache: 'no-store' });
    if (res.ok) return await res.json();
  } catch {}
  return null;
}

export interface PatientDailyLogPayload {
  rescue_puffs: number;
  controller_taken: boolean;
  cough_score: number;
  wheezing_score: number;
  chest_tightness_score: number;
  breathlessness_score: number;
  notes?: string;
}

/** Submit a patient self-reported daily check-in to PostgreSQL */
export async function submitPatientCheckIn(patientId: string, data: PatientDailyLogPayload) {
  try {
    const res = await fetch(`${API_BASE}/patients/${patientId}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) return await res.json();
  } catch (err) {
    console.error('Failed to submit patient check-in:', err);
  }
  return null;
}

/** Get patient self-reported check-in history from PostgreSQL */
export async function getPatientCheckIns(patientId: string) {
  try {
    const res = await fetch(`${API_BASE}/patients/${patientId}/logs`, { cache: 'no-store' });
    if (res.ok) return await res.json();
  } catch {}
  return { patient_id: patientId, count: 0, logs: [] };
}
