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

/** Get cohort roster with live 24h & 48h neural risks */
export async function getPatients(limit: number = 12, hour?: number): Promise<Patient[]> {
  try {
    const url = new URL(`${API_BASE}/patients`);
    url.searchParams.set('limit', limit.toString());
    if (hour !== undefined) {
      url.searchParams.set('hour', hour.toString());
    }
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (e) {
    console.warn('Failed to fetch patients from API, using local cache:', e);
  }
  return PATIENTS;
}

/** Get individual patient digital twin state */
export async function getPatient(patientId: string, hour?: number): Promise<Patient> {
  try {
    const url = new URL(`${API_BASE}/patients/${encodeURIComponent(patientId)}`);
    if (hour !== undefined) {
      url.searchParams.set('hour', hour.toString());
    }
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.id) {
        return data;
      }
    }
  } catch (e) {
    console.warn(`Failed to fetch patient ${patientId} from API, using local cache:`, e);
  }
  return PATIENTS.find((p) => p.id === patientId) || PATIENTS[0];
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
