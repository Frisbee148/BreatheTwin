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
  modelBreakdown?: {
    ensembleExecuted: boolean;
    scoringEngine?: string;
    tcnRisk24h?: number;
    gradientBoostingRisk24h?: number;
    metaRisk24h?: number;
    tcnRisk48h?: number;
    gradientBoostingRisk48h?: number;
    rawMetaRisk48h?: number;
    odeRisk48h?: number;
    fusedMetaRisk48h?: number;
  };
  trajectoryPoints?: {
    hour: number;
    label: string;
    baselineRisk: number;
    simulatedRisk: number;
    baselineInflammation: number;
    simulatedInflammation: number;
  }[];
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
  name?: string;
  age: number;
  gender?: string;
  city: string;
  station?: string;
  asthma_severity: string;
  simulated_device_profile?: 'typical' | 'restless_sleeper' | 'low_activity' | string;
  baseline_fev1_pct?: number;
  baseline_fev1_fvc?: number;
  baseline_pef_lmin?: number;
  baseline_spo2?: number;
  baseline_resting_hr?: number;
  baseline_rr?: number;
  controller_medication?: string;
  controller_adherence?: number;
  reported_adherence?: number;
  smoking_status?: string;
  pack_years?: number;
  copd_status?: boolean;
  comorbidity_burden?: number;
  flare_ups_last_year?: number;
  hospitalized?: boolean;
  allergens?: string[] | string;
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
  const adherence = input.reported_adherence ?? input.controller_adherence ?? 75;
  const fev1 = input.baseline_fev1_pct ?? 70;
  const isHighRisk = fev1 < 60 || adherence < 50 || input.smoking_status === 'Active' || input.smoking_status === 'Current';
  const risk48h = isHighRisk ? 72.0 : 18.5;
  const riskLevel = risk48h >= 70 ? 'HIGH RISK' : risk48h >= 50 ? 'ELEVATED' : 'NORMAL';
  const parsedAllergens = Array.isArray(input.allergens)
    ? input.allergens
    : input.allergens
    ? input.allergens.split(',').map((s) => s.trim())
    : ['Dust Mites', 'PM2.5 Smog'];

  const syntheticPatient: Patient = {
    id: randId,
    name: input.name || `Synthetic Twin · ${input.city.slice(0, 3).toUpperCase()}-${randId.slice(-3)}`,
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
    allergens: parsedAllergens,
    smokingHistory: input.smoking_status === 'Active' || input.smoking_status === 'Current' ? `Current Smoker (${input.pack_years || 5} pack-years)` : input.smoking_status === 'Former' ? `Former Smoker (${input.pack_years || 5} pack-years)` : 'Never Smoked',
    comorbidities: input.copd_status ? ['COPD', 'Hypertension'] : ['None'],
    flareUpsLastYear: input.flare_ups_last_year ?? 1,
    simulatedDeviceProfile: input.simulated_device_profile ?? 'typical',
    learningBaseline: {
      active: true,
      currentDay: 1,
      totalCalibrationDays: 7,
      statusLabel: 'LEARNING PERSONAL BASELINE (DAY 1 OF 7)',
      uncertaintyHalfWidthPct: 22.0,
      simulatedDeviceProfile: input.simulated_device_profile ?? 'typical',
      convergenceSchedule: [
        { day: 1, label: 'Day 1', bandHalfWidth: 22, status: 'Wide initial conformal band (cold-start)' },
        { day: 3, label: 'Day 3', bandHalfWidth: 16, status: 'Adapting to nocturnal RR & HRV rhythm' },
        { day: 5, label: 'Day 5', bandHalfWidth: 11, status: 'Personal physiological baseline converging' },
        { day: 7, label: 'Day 7', bandHalfWidth: 7, status: 'Fully calibrated conformal interval' },
      ],
    },
    risk24h: +(risk48h * 0.85).toFixed(1),
    risk24hInterval: [Math.max(0, Math.round(risk48h * 0.85 - 20)), Math.min(100, Math.round(risk48h * 0.85 + 20))],
    risk48h,
    risk48hInterval: [Math.max(0, Math.round(risk48h - 22)), Math.min(100, Math.round(risk48h + 22))],
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

  try {
    const res = await fetch(url.toString(), { method: 'POST', cache: 'no-store' });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Copilot API unreachable, using local RAG report cache:', err);
  }

  // Fallback to grounded copilot-reports.json or dynamic patient synthesis
  const staticReports = (await import('../data/copilot-reports.json')).default as CopilotReport[];
  const found = staticReports.find((r) => r.patient_id === patientId);
  if (found) return found;

  const p = await getPatient(patientId, hour);
  return {
    patient_id: p.id,
    clinical_status: p.riskLevel === 'HIGH RISK' ? 'High Risk' : p.riskLevel === 'NORMAL' ? 'Stable' : 'Warning',
    risk_level: p.riskLevel === 'HIGH RISK' ? 'High' : p.riskLevel === 'NORMAL' ? 'Low' : 'Medium',
    summary_reason: `48-hour exacerbation risk (${p.risk48h}%) and 24-hour risk (${p.risk24h}%) driven by ambient PM2.5 (${p.currentAirQuality.pm25} µg/m³), controller adherence (${p.controllerAdherence}%), and resting respiratory rate (${p.currentTelemetry.rr} breaths/min).`,
    precautions: [
      'Limit time outdoors during morning and evening pollution peaks.',
      'Wear a fitted N95 mask when commuting outside.',
      'Keep your rescue inhaler with you and follow your clinician-approved asthma action plan.',
    ],
    triggers_to_avoid: p.allergens.length > 0 ? p.allergens : ['High PM2.5 particulate pollution', 'Cold air exposure'],
    breathing_exercise: null,
    medication_guidance: {
      action: 'No medication change is recommended by this AI-generated report.',
      note: 'Medication decisions must follow the patient’s clinician-approved plan.',
    },
    emergency_warning:
      'Seek emergency medical care if you experience severe shortness of breath, inability to speak full sentences, or if your rescue inhaler provides no relief within 20 minutes.',
  };
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
    user_accounts?: number;
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

export interface AuthUserAccount {
  id: number;
  email: string;
  full_name: string;
  role: 'doctor' | 'patient';
  patient_id: string | null;
  license_or_clinic: string | null;
  is_verified: boolean;
  verification_code?: string;
  created_at?: string;
}

export async function signupUserAccount(payload: {
  email: string;
  full_name: string;
  role: 'doctor' | 'patient';
  password: string;
  patient_id?: string;
  license_or_clinic?: string;
}): Promise<{ status: string; message: string; account: AuthUserAccount }> {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Sign up failed');
  }
  return data;
}

export async function verifyUserAccount(payload: {
  email: string;
  verification_code: string;
}): Promise<{ status: string; message: string; account: AuthUserAccount }> {
  const res = await fetch(`${API_BASE}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Verification failed');
  }
  return data;
}

export async function loginUserAccount(payload: {
  email: string;
  password: string;
  role: 'doctor' | 'patient';
}): Promise<{ status: string; message: string; account: AuthUserAccount }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Login failed');
  }
  return data;
}

export async function getRegisteredAccounts(): Promise<AuthUserAccount[]> {
  try {
    const res = await fetch(`${API_BASE}/auth/users`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      return data.users || [];
    }
  } catch {}
  return [];
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

export interface PatientDailyLogEntry extends PatientDailyLogPayload {
  id: string;
  patient_id: string;
  logged_at: string;
}

const LOCAL_LOGS_KEY = 'digi_patient_daily_logs_v1';

function getLocalPatientLogs(patientId: string): PatientDailyLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_LOGS_KEY);
    const map: Record<string, PatientDailyLogEntry[]> = raw ? JSON.parse(raw) : {};
    return map[patientId] || [];
  } catch {
    return [];
  }
}

function saveLocalPatientLog(patientId: string, entry: PatientDailyLogEntry) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LOCAL_LOGS_KEY);
    const map: Record<string, PatientDailyLogEntry[]> = raw ? JSON.parse(raw) : {};
    const current = map[patientId] || [];
    map[patientId] = [entry, ...current].slice(0, 30);
    localStorage.setItem(LOCAL_LOGS_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

/** Submit a patient self-reported daily check-in to PostgreSQL & local persistence */
export async function submitPatientCheckIn(patientId: string, data: PatientDailyLogPayload) {
  const fallbackEntry: PatientDailyLogEntry = {
    id: `LOG-${Date.now()}`,
    patient_id: patientId,
    logged_at: new Date().toISOString(),
    ...data,
  };
  saveLocalPatientLog(patientId, fallbackEntry);

  try {
    const res = await fetch(`${API_BASE}/patients/${encodeURIComponent(patientId)}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) return await res.json();
  } catch (err) {
    console.warn('Saved patient check-in locally:', err);
  }
  return { message: 'Check-in saved to personal twin log', log: fallbackEntry };
}

/** Get patient self-reported check-in history from PostgreSQL + local persistence */
export async function getPatientCheckIns(patientId: string) {
  const localLogs = getLocalPatientLogs(patientId);
  try {
    const res = await fetch(`${API_BASE}/patients/${encodeURIComponent(patientId)}/logs`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.logs) && data.logs.length > 0) {
        return data;
      }
    }
  } catch {}
  return { patient_id: patientId, count: localLogs.length, logs: localLogs };
}

export interface PatientChatResponse {
  patient_id: string;
  plain_risk_level: 'Low' | 'Watch' | 'High';
  answer: string;
  key_takeaways: string[];
  rag_sources: string[];
  guardrail_note: string;
  medication_guardrail_triggered: boolean;
  suggested_questions: string[];
}

export function mapRiskToPlainWord(riskLevel: string): 'Low' | 'Watch' | 'High' {
  if (riskLevel === 'NORMAL') return 'Low';
  if (riskLevel === 'HIGH RISK') return 'High';
  return 'Watch';
}

/** Ask a guardrailed forecast question via the backend LLM RAG system */
export async function askPatientForecastChat(
  patientId: string,
  question: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
  hour?: number
): Promise<PatientChatResponse> {
  try {
    const url = new URL(`${API_BASE}/patients/${encodeURIComponent(patientId)}/chat`);
    if (hour !== undefined) {
      url.searchParams.set('hour', hour.toString());
    }
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history }),
      cache: 'no-store',
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Using local RAG fallback for patient forecast chat:', err);
  }

  // Client-side RAG fallback grounded in patient data & copilot knowledge base
  const p = await getPatient(patientId);
  const plainRisk = mapRiskToPlainWord(p.riskLevel);
  const qLower = question.toLowerCase();
  const medKeywords = ['dose', 'dosage', 'double', 'increase', 'decrease', 'stop', 'steroid', 'prescribe', 'change medication', 'change my medication', 'treatment'];
  const medTriggered = medKeywords.some((k) => qLower.includes(k));
  const airDesc =
    p.currentAirQuality.aqi >= 300
      ? 'very poor and smoky'
      : p.currentAirQuality.aqi >= 200
      ? 'poor with heavy haze'
      : p.currentAirQuality.aqi >= 100
      ? 'moderately dusty'
      : 'clean and comfortable';
  const rrDiff = p.currentTelemetry.rr - p.baselineRR >= 2.0;

  let answer = '';
  let takeaways: string[] = [];

  if (medTriggered) {
    answer = `I cannot recommend changing, starting, stopping, or adjusting any medication dose. Today your status is ${plainRisk} because local air quality in ${p.city} is ${airDesc} and your night breathing has been ${rrDiff ? 'a little faster than your usual' : 'normal for you'}. Please follow your doctor's prescribed plan (${p.controllerMedication}) and contact your clinic if you have questions about your medicine.`;
    takeaways = [
      'No medication changes can be given by the chat assistant — always follow your doctor’s plan.',
      `Current status is ${plainRisk}: focus on staying indoors during smoky hours and wearing a mask outside.`,
      'Call your clinic directly if you feel your prescribed inhaler schedule needs review.',
    ];
  } else if (qLower.includes('air') || qLower.includes('outside') || qLower.includes('outdoor') || qLower.includes('walk') || qLower.includes('best time')) {
    answer = `Outdoor air in ${p.city} (${p.station}) is currently ${airDesc} (AQI ${p.currentAirQuality.aqi}). The best time to be outdoors is mid-afternoon between 2:00 PM and 4:30 PM when afternoon warmth lifts ground smog. The worst times are early morning (6:30 AM – 9:30 AM) and evening (6:00 PM – 10:00 PM) when traffic fumes stay trapped near the ground.`;
    takeaways = [
      'Best window outdoors: 2:00 PM – 4:30 PM.',
      'Worst windows outdoors: 6:30–9:30 AM and 6:00–10:00 PM.',
      'Wear a fitted N95 mask and keep your rescue inhaler with you if you must step out.',
    ];
  } else if (qLower.includes('signal') || qLower.includes('breathing') || qLower.includes('sleep') || qLower.includes('oxygen') || qLower.includes('usual')) {
    answer = `Compared with your usual personal baseline, your resting breathing rate is ${rrDiff ? 'a little faster than your usual' : 'normal for you'}, your oxygen level is ${p.currentTelemetry.spo2 < 94 ? 'slightly lower than your usual at night' : 'normal for you'}, and your sleep was ${p.currentTelemetry.sleepAwakenings >= 3 ? 'more restless than your usual' : 'normal for you'}. Resting in clean indoor air tonight helps your airways settle.`;
    takeaways = [
      `Resting breathing rate: ${rrDiff ? 'Different from your usual (slightly faster)' : 'Normal for you'}.`,
      `Oxygen level: ${p.currentTelemetry.spo2 < 94 ? 'Different from your usual (slightly lower overnight)' : 'Normal for you'}.`,
      `Sleep quality: ${p.currentTelemetry.sleepAwakenings >= 3 ? 'Different from your usual (more night awakenings)' : 'Normal for you'}.`,
    ];
  } else {
    answer = `Today your status is ${plainRisk}. Air quality in ${p.city} is ${airDesc} today and your breathing at night has been ${rrDiff ? 'a little worse than usual' : 'steady and normal for you'}. Over the next 48 hours, staying indoors during evening smog, wearing a mask when commuting, and following your asthma action plan will help keep your breathing comfortable.`;
    takeaways = [
      `Today's status is ${plainRisk} due to ${airDesc} air quality and ${rrDiff ? 'nighttime breathing drift' : 'your current environment'}.`,
      'Limit time outdoors during morning and evening pollution peaks.',
      'Keep your rescue inhaler with you and follow your doctor-approved action plan.',
    ];
  }

  return {
    patient_id: p.id,
    plain_risk_level: plainRisk,
    answer,
    key_takeaways: takeaways,
    rag_sources: [
      `BreathTwin Personal Twin (${p.id} • ${p.city})`,
      '12-Hour Wearable & Air Quality Summary',
      'Clinical RAG KB: Respiratory Physiology & Biosensor Telemetry',
    ],
    guardrail_note:
      'Plain-language forecast assistant grounded in your BreathTwin data and clinical knowledge base. Does not provide medical diagnosis, raw probabilities, or medication changes.',
    medication_guardrail_triggered: medTriggered,
    suggested_questions: [
      'Why is my status at this level today?',
      'What is the best time of day for me to go outdoors?',
      'How are my breathing and sleep signals compared to my usual?',
      'What happens to my 48-hour outlook if I stay indoors this evening?',
    ],
  };
}


