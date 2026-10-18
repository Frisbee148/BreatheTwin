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

// ============================================================================
// SECTION 5: 48-HOUR FORECAST UNIFIED PAYLOAD CONTRACT & WHAT-IF OVERLAY
// ============================================================================

export interface ForecastCurvePoint {
  h: number;
  t?: string;
  p: number;  // 0 to 1
  lo: number; // 0 to 1
  hi: number; // 0 to 1
}

export interface ForecastDriverItem {
  id: string;
  group: 'medication' | 'air_quality' | 'wearable' | 'history';
  label: string;
  deltaPp: number;
  change24hPp: number;
  modifiable: boolean;
  text: string;
}

export interface ForecastSignalPoint {
  t: string;
  v: number | null;
}

export interface ForecastSignal {
  id: string;
  label?: string;
  unit: string;
  limit?: number | null;
  limitDirection?: 'above' | 'below';
  twinAnchor?: string;
  baseline: {
    mean: number;
    sd: number;
  };
  points: ForecastSignalPoint[];
  expected: { t: string; v: number }[] | null;
}

export interface CpcbBin {
  min: number;
  max: number;
  aqiMin: number;
  aqiMax: number;
  category: string;
}

export interface ForecastAirQualityPoint {
  t: string;
  h?: number;
  pm25: number;
  kind: 'observed' | 'forecast';
}

export interface ForecastPayload {
  patientId: string;
  asOf: string;
  simulationHour?: number;
  modelVersion: string;
  seed: number;
  status: 'normal' | 'watch' | 'alert';
  statusLabel?: 'Normal' | 'Watch' | 'Alert';
  alertPolicy: {
    threshold: number;
    maxIntervalWidth: number;
  };
  curve: ForecastCurvePoint[];
  drivers: {
    baseline: number; // fraction e.g. 0.30
    items: ForecastDriverItem[];
    other: {
      deltaPp: number;
    };
  };
  signals: ForecastSignal[];
  airQuality: {
    source: string;
    station: string;
    whoGuideline?: number;
    bins?: CpcbBin[];
    points: ForecastAirQualityPoint[];
    current?: {
      pm25: number;
      pm10: number;
      temp: number;
      humidity: number;
    };
    aqi: {
      value: number;
      category: string;
    };
  };
  dataQuality: {
    missingHours7d: number;
    baselineDays: number;
    coldStart: boolean;
  };
  // Present when returned by POST /api/patients/:id/what-if (V5 overlay)
  scenarioId?: string;
  scenarioLabel?: string;
  delta48hPp?: number;
}

export interface ActiveWhatIfScenario {
  scenarioId: string;
  scenarioLabel: string;
  outdoor_hours: number;
  wear_n95: boolean;
  target_adherence_pct: number;
  hepa_purifier: boolean;
}

const ACTIVE_WHATIF_PREFIX = 'digi_active_whatif_v1_';

export function getActiveWhatIfScenario(patientId: string): ActiveWhatIfScenario | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${ACTIVE_WHATIF_PREFIX}${patientId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveActiveWhatIfScenario(patientId: string, scenario: ActiveWhatIfScenario) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${ACTIVE_WHATIF_PREFIX}${patientId}`, JSON.stringify(scenario));
  } catch {
    // ignore storage errors
  }
}

export function clearActiveWhatIfScenario(patientId: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(`${ACTIVE_WHATIF_PREFIX}${patientId}`);
  } catch {
    // ignore storage errors
  }
}

export function getForecastStreamUrl(patientId: string): string {
  return `${API_BASE}/patients/${encodeURIComponent(patientId)}/forecast/stream`;
}

const DEFAULT_CPCB_BINS: CpcbBin[] = [
  { min: 0, max: 30, aqiMin: 0, aqiMax: 50, category: 'Good' },
  { min: 30, max: 60, aqiMin: 51, aqiMax: 100, category: 'Satisfactory' },
  { min: 60, max: 90, aqiMin: 101, aqiMax: 200, category: 'Moderate' },
  { min: 90, max: 120, aqiMin: 201, aqiMax: 300, category: 'Poor' },
  { min: 120, max: 250, aqiMin: 301, aqiMax: 400, category: 'Very Poor' },
  { min: 250, max: 500, aqiMin: 401, aqiMax: 500, category: 'Severe' },
];

function computeFallbackCpcbAqi(pm25: number): { value: number; category: string } {
  const clamped = Math.max(0, pm25);
  for (const b of DEFAULT_CPCB_BINS) {
    if (clamped <= b.max || b === DEFAULT_CPCB_BINS[DEFAULT_CPCB_BINS.length - 1]) {
      const span = Math.max(1, b.max - b.min);
      const frac = Math.min(1, Math.max(0, (clamped - b.min) / span));
      const value = Math.round(b.aqiMin + frac * (b.aqiMax - b.aqiMin));
      return { value, category: b.category };
    }
  }
  return { value: 500, category: 'Severe' };
}

/** Synthesize unified Section 5 ForecastPayload from local Patient & Telemetry when backend is offline */
export function buildFallbackForecastPayload(patient: Patient, hour: number = 168): ForecastPayload {
  const baseMs = new Date('2026-10-07T00:00:00+05:30').getTime();
  const asOfMs = baseMs + hour * 3600 * 1000;
  const toIsoIst = (ms: number) => {
    const istOffsetMs = 5.5 * 3600 * 1000;
    const d = new Date(ms + istOffsetMs);
    return d.toISOString().replace('Z', '+05:30');
  };

  const p24 = +(patient.risk24h / 100).toFixed(4);
  const p48 = +(Math.max(patient.risk48h, patient.risk24h) / 100).toFixed(4);
  const lo24 = +(patient.risk24hInterval[0] / 100).toFixed(4);
  const hi24 = +(patient.risk24hInterval[1] / 100).toFixed(4);
  const lo48 = +(Math.max(patient.risk48hInterval[0] / 100, lo24)).toFixed(4);
  const hi48 = +(Math.max(patient.risk48hInterval[1] / 100, hi24, p48)).toFixed(4);

  const threshold = 0.70;
  const maxIntervalWidth = 0.30;
  const status: 'normal' | 'watch' | 'alert' =
    p48 >= threshold ? 'alert' : p48 >= 0.35 || hi48 - lo48 > maxIntervalWidth ? 'watch' : 'normal';
  const statusLabel: 'Normal' | 'Watch' | 'Alert' =
    status === 'alert' ? 'Alert' : status === 'watch' ? 'Watch' : 'Normal';

  const curve: ForecastCurvePoint[] = [];
  let prevP = 0;
  let prevLo = 0;
  let prevHi = 0;
  for (let h = 0; h <= 48; h++) {
    let pH = 0;
    let loH = 0;
    let hiH = 0;
    if (h === 0) {
      pH = 0;
      loH = 0;
      hiH = 0;
    } else if (h <= 24) {
      const frac = Math.pow(h / 24, 0.85);
      pH = +(p24 * frac).toFixed(4);
      loH = +(lo24 * frac).toFixed(4);
      hiH = +(hi24 * frac).toFixed(4);
    } else {
      const frac = Math.pow((h - 24) / 24, 0.9);
      pH = +(p24 + (p48 - p24) * frac).toFixed(4);
      loH = +(lo24 + (lo48 - lo24) * frac).toFixed(4);
      hiH = +(hi24 + (hi48 - hi24) * frac).toFixed(4);
    }
    if (h === 24) {
      pH = p24;
      loH = lo24;
      hiH = hi24;
    } else if (h === 48) {
      pH = p48;
      loH = lo48;
      hiH = hi48;
    }
    pH = Math.max(prevP, Math.min(1, pH));
    loH = Math.min(pH, Math.max(prevLo, Math.min(1, loH)));
    hiH = Math.max(pH, Math.max(prevHi, Math.min(1, hiH)));
    prevP = pH;
    prevLo = loH;
    prevHi = hiH;
    curve.push({
      h,
      t: toIsoIst(asOfMs + h * 3600 * 1000),
      p: +pH.toFixed(4),
      lo: +loH.toFixed(4),
      hi: +hiH.toFixed(4),
    });
  }

  const dailySeries = PATIENT_TELEMETRY_SERIES[patient.id] || PATIENT_TELEMETRY_SERIES['PT-8821'];
  const gapSet = new Set([114, 115, 149]);

  const buildHourlyFromDaily = (
    getter: (d: TelemetryPoint) => number,
    latestVal: number,
    decimals: number
  ): ForecastSignalPoint[] => {
    const pts: ForecastSignalPoint[] = [];
    for (let i = 0; i < 168; i++) {
      const hOffset = i - 167;
      const tIso = toIsoIst(asOfMs + hOffset * 3600 * 1000);
      if (gapSet.has(i)) {
        pts.push({ t: tIso, v: null });
        continue;
      }
      const dayPos = (i / 167) * (dailySeries.length - 1);
      const d0 = Math.floor(dayPos);
      const d1 = Math.min(dailySeries.length - 1, d0 + 1);
      const frac = dayPos - d0;
      const baseV = getter(dailySeries[d0]) * (1 - frac) + getter(dailySeries[d1]) * frac;
      const wave = Math.sin(i / 3.8) * (decimals === 2 ? 0.015 : 0.35);
      const val = i === 167 ? latestVal : +(baseV + wave).toFixed(decimals);
      pts.push({ t: tIso, v: val });
    }
    return pts;
  };

  const infMean = +(dailySeries[0]?.inflammationState ?? 0.30).toFixed(2);
  const rrMean = +(patient.baselineRR || 15.0).toFixed(1);
  const spo2Mean = +(dailySeries[0]?.spo2 ?? 96.5).toFixed(1);

  const expectedInf: { t: string; v: number }[] = [];
  let simI = patient.estimatedInflammationState;
  for (let h = 0; h <= 48; h++) {
    if (h > 0) {
      const dI =
        -0.08 * simI +
        0.0009 * (patient.currentAirQuality.pm25 * 0.68) -
        0.10 * (patient.controllerAdherence / 100);
      simI = Math.max(0.12, Math.min(0.96, simI + dI));
    }
    expectedInf.push({
      t: toIsoIst(asOfMs + h * 3600 * 1000),
      v: +simI.toFixed(2),
    });
  }

  const signals: ForecastSignal[] = [
    {
      id: 'inflammation',
      label: 'Inflammation state I(t)',
      unit: 'I(t)',
      limit: patient.inflammationThreshold,
      limitDirection: 'above',
      twinAnchor: 'chart-inflammation',
      baseline: { mean: infMean, sd: 0.06 },
      points: buildHourlyFromDaily((d) => d.inflammationState, patient.estimatedInflammationState, 2),
      expected: expectedInf,
    },
    {
      id: 'resp_rate',
      label: 'Resting respiratory rate',
      unit: 'breaths/min',
      limit: 18.0,
      limitDirection: 'above',
      twinAnchor: 'chart-rr',
      baseline: { mean: rrMean, sd: 1.1 },
      points: buildHourlyFromDaily((d) => d.rr, patient.currentTelemetry.rr, 1),
      expected: null,
    },
    {
      id: 'spo2',
      label: 'Nocturnal SpO2',
      unit: '%',
      limit: 92.0,
      limitDirection: 'below',
      twinAnchor: 'chart-spo2',
      baseline: { mean: spo2Mean, sd: 0.9 },
      points: buildHourlyFromDaily((d) => d.spo2, patient.currentTelemetry.spo2, 1),
      expected: null,
    },
  ];

  const currPm25 = patient.currentAirQuality.pm25;
  const cpcbAqi = computeFallbackCpcbAqi(currPm25);
  const aqPoints: ForecastAirQualityPoint[] = [];
  for (let h = -24; h <= 48; h++) {
    const tIso = toIsoIst(asOfMs + h * 3600 * 1000);
    const hod = ((hour + h) % 24 + 24) % 24;
    const rush = hod === 8 || hod === 9 || hod === 19 || hod === 20 || hod === 21 ? 1.2 : hod >= 13 && hod <= 15 ? 0.86 : 1.0;
    const wave = Math.sin(h / 5.0) * (currPm25 * 0.08);
    const pmVal = h === 0 ? currPm25 : Math.max(12, Math.round(currPm25 * rush + wave));
    aqPoints.push({
      t: tIso,
      h,
      pm25: pmVal,
      kind: h <= 0 ? 'observed' : 'forecast',
    });
  }

  const cohortBaseline = 0.30;
  const targetDiffPp = +((p48 - cohortBaseline) * 100).toFixed(1);
  const rawDrivers: {
    id: string;
    group: 'medication' | 'air_quality' | 'wearable' | 'history';
    label: string;
    raw: number;
    change24hPp: number;
    modifiable: boolean;
    text: string;
  }[] = [
    {
      id: 'ambient_pm25',
      group: 'air_quality',
      label: 'Ambient PM2.5 exposure',
      raw: (currPm25 - 55) * 0.16,
      change24hPp: +((currPm25 - (dailySeries[dailySeries.length - 2]?.pm25 ?? currPm25)) * 0.12).toFixed(1),
      modifiable: true,
      text: `Current PM2.5 at ${patient.station} is ${currPm25} ug/m3 against the 15 ug/m3 WHO 24-hour guideline.`,
    },
    {
      id: 'inflammation_state',
      group: 'wearable',
      label: 'Latent airway inflammation I(t)',
      raw: (patient.estimatedInflammationState - 0.38) * 38,
      change24hPp: +((patient.estimatedInflammationState - infMean) * 18).toFixed(1),
      modifiable: false,
      text: `Latent airway inflammation I(t) is ${patient.estimatedInflammationState.toFixed(2)} relative to baseline ${infMean.toFixed(2)} (limit ${patient.inflammationThreshold.toFixed(2)}).`,
    },
    {
      id: 'controller_adherence',
      group: 'medication',
      label: 'Controller adherence',
      raw: (80 - patient.controllerAdherence) * 0.42,
      change24hPp: 0.0,
      modifiable: true,
      text: `Recorded controller adherence is ${patient.controllerAdherence}% (${patient.controllerMedication}).`,
    },
    {
      id: 'resp_rate',
      group: 'wearable',
      label: 'Resting respiratory rate',
      raw: (patient.currentTelemetry.rr - rrMean) * 3.4,
      change24hPp: +((patient.currentTelemetry.rr - (dailySeries[dailySeries.length - 2]?.rr ?? patient.currentTelemetry.rr)) * 2.2).toFixed(1),
      modifiable: false,
      text: `Resting respiratory rate is ${patient.currentTelemetry.rr.toFixed(1)} breaths/min vs personal baseline ${rrMean.toFixed(1)} breaths/min (limit 18 breaths/min).`,
    },
    {
      id: 'nocturnal_spo2',
      group: 'wearable',
      label: 'Nocturnal SpO2 saturation',
      raw: (spo2Mean - patient.currentTelemetry.spo2) * 3.2,
      change24hPp: +(((dailySeries[dailySeries.length - 2]?.spo2 ?? patient.currentTelemetry.spo2) - patient.currentTelemetry.spo2) * 2.4).toFixed(1),
      modifiable: false,
      text: `Nocturnal SpO2 is ${patient.currentTelemetry.spo2.toFixed(1)}% vs personal baseline ${spo2Mean.toFixed(1)}% (limit 92%).`,
    },
    {
      id: 'baseline_fev1',
      group: 'history',
      label: 'Baseline FEV1 & prior flare history',
      raw: (76 - patient.baselineFEV1Percent) * 0.36 + (patient.flareUpsLastYear - 1.5) * 2.2,
      change24hPp: 0.0,
      modifiable: false,
      text: `Baseline FEV1 is ${patient.baselineFEV1Percent}% predicted with ${patient.flareUpsLastYear} recorded flare-up(s) in the past year.`,
    },
    {
      id: 'rescue_inhaler',
      group: 'medication',
      label: 'Rescue inhaler actuations (24h)',
      raw: (patient.currentTelemetry.rescuePuffs24h - 1) * 2.5,
      change24hPp: +((patient.currentTelemetry.rescuePuffs24h - 1) * 1.0).toFixed(1),
      modifiable: false,
      text: `Patient recorded ${patient.currentTelemetry.rescuePuffs24h} rescue puffs in the last 24 hours.`,
    },
    {
      id: 'coarse_pm10',
      group: 'air_quality',
      label: 'Coarse particulate PM10 load',
      raw: (patient.currentAirQuality.pm10 - 110) * 0.04,
      change24hPp: 0.5,
      modifiable: true,
      text: `Ambient PM10 is ${patient.currentAirQuality.pm10} ug/m3 with station AQI ${cpcbAqi.value} (${cpcbAqi.category}).`,
    },
  ];

  let posSum = rawDrivers.reduce((acc, c) => acc + (c.raw > 0 ? c.raw : 0), 0);
  let negSum = rawDrivers.reduce((acc, c) => acc + (c.raw < 0 ? -c.raw : 0), 0);
  let kPos = 1;
  let kNeg = 1;
  if (targetDiffPp >= 0) {
    if (posSum < 1e-3) {
      rawDrivers[0].raw = Math.max(1, targetDiffPp);
      posSum = rawDrivers[0].raw;
    }
    kNeg = negSum > 0 ? 0.75 : 1;
    kPos = (targetDiffPp + kNeg * negSum) / Math.max(posSum, 1e-6);
  } else {
    if (negSum < 1e-3) {
      rawDrivers[2].raw = Math.min(-1, targetDiffPp);
      negSum = -rawDrivers[2].raw;
    }
    kPos = posSum > 0 ? 0.75 : 1;
    kNeg = (kPos * posSum - targetDiffPp) / Math.max(negSum, 1e-6);
  }

  const scaled = rawDrivers.map((c) => {
    let val = c.raw * (c.raw >= 0 ? kPos : kNeg);
    if (Math.abs(val) < 0.4) val = val >= 0 ? 0.5 : -0.5;
    return {
      id: c.id,
      group: c.group,
      label: c.label,
      deltaPp: +val.toFixed(1),
      change24hPp: c.change24hPp,
      modifiable: c.modifiable,
      text: c.text,
    };
  });

  scaled.sort((a, b) => Math.abs(b.deltaPp) - Math.abs(a.deltaPp));
  const top6 = scaled.slice(0, 6);
  const top6Sum = +top6.reduce((acc, d) => acc + d.deltaPp, 0).toFixed(1);
  const otherPp = +(targetDiffPp - top6Sum).toFixed(1);

  if (status === 'watch' || status === 'alert') {
    top6.sort((a, b) => {
      const aPos = a.deltaPp > 0 ? 0 : 1;
      const bPos = b.deltaPp > 0 ? 0 : 1;
      if (aPos !== bPos) return aPos - bPos;
      return Math.abs(b.deltaPp) - Math.abs(a.deltaPp);
    });
  }

  return {
    patientId: patient.id,
    asOf: toIsoIst(asOfMs),
    simulationHour: hour,
    modelVersion: 'twin-0.3.1',
    seed: 42,
    status,
    statusLabel,
    alertPolicy: {
      threshold,
      maxIntervalWidth,
    },
    curve,
    drivers: {
      baseline: cohortBaseline,
      items: top6,
      other: { deltaPp: otherPp },
    },
    signals,
    airQuality: {
      source: 'CPCB',
      station: patient.station,
      whoGuideline: 15,
      bins: DEFAULT_CPCB_BINS,
      points: aqPoints,
      current: {
        pm25: patient.currentAirQuality.pm25,
        pm10: patient.currentAirQuality.pm10,
        temp: patient.currentAirQuality.temp,
        humidity: patient.currentAirQuality.humidity,
      },
      aqi: cpcbAqi,
    },
    dataQuality: {
      missingHours7d: 3,
      baselineDays: patient.learningBaseline?.active ? patient.learningBaseline.currentDay : 14,
      coldStart: Boolean(patient.learningBaseline?.active),
    },
  };
}

/** Fetch unified Section 5 ForecastPayload from GET /api/patients/:id/forecast */
export async function getPatientForecast(
  patientId: string,
  options?: { asOf?: string; hour?: number }
): Promise<ForecastPayload> {
  try {
    const url = new URL(`${API_BASE}/patients/${encodeURIComponent(patientId)}/forecast`);
    if (options?.asOf) url.searchParams.set('asOf', options.asOf);
    if (options?.hour !== undefined) url.searchParams.set('hour', options.hour.toString());
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn(`Using fallback forecast payload for ${patientId}:`, e);
  }
  const p = await getPatient(patientId, options?.hour);
  return buildFallbackForecastPayload(p, options?.hour ?? 168);
}

/** Fetch scenario counterfactual in the same ForecastPayload shape via POST /api/patients/:id/what-if */
export async function simulatePatientForecastWhatIf(
  patientId: string,
  scenario: ActiveWhatIfScenario,
  options?: { asOf?: string; hour?: number }
): Promise<ForecastPayload> {
  try {
    const res = await fetch(`${API_BASE}/patients/${encodeURIComponent(patientId)}/what-if`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...scenario,
        asOf: options?.asOf,
        hour: options?.hour,
      }),
      cache: 'no-store',
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn(`Using fallback what-if forecast payload for ${patientId}:`, e);
  }

  const basePayload = await getPatientForecast(patientId, options);
  const p = await getPatient(patientId, options?.hour);
  const outdoorReduction = Math.max(0, (2.5 - scenario.outdoor_hours) * 6.5);
  const n95Reduction = scenario.wear_n95 ? 18 : 0;
  const adhDiff = Math.max(0, scenario.target_adherence_pct - p.controllerAdherence);
  const adhReduction = (adhDiff / 100) * 24;
  const hepaReduction = scenario.hepa_purifier ? 8 : 0;
  const totalReductionPp = +(outdoorReduction + n95Reduction + adhReduction + hepaReduction).toFixed(1);

  const base48 = basePayload.curve[basePayload.curve.length - 1].p;
  const sim48 = Math.max(0.08, Math.min(0.99, +(base48 - totalReductionPp / 100).toFixed(4)));
  const ratio = base48 > 0 ? sim48 / base48 : 1;

  const cfCurve: ForecastCurvePoint[] = basePayload.curve.map((pt) => {
    const pVal = +(pt.p * ratio).toFixed(4);
    const halfLo = Math.max(0.02, pt.p - pt.lo) * 0.9;
    const halfHi = Math.max(0.02, pt.hi - pt.p) * 0.9;
    return {
      h: pt.h,
      t: pt.t,
      p: pVal,
      lo: +Math.max(0, pVal - halfLo).toFixed(4),
      hi: +Math.min(1, pVal + halfHi).toFixed(4),
    };
  });

  return {
    ...basePayload,
    scenarioId: scenario.scenarioId,
    scenarioLabel: scenario.scenarioLabel,
    curve: cfCurve,
    delta48hPp: +((sim48 - base48) * 100).toFixed(1),
  };
}



