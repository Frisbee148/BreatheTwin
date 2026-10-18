'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Patient } from '@/lib/data';
import { createPatient, CreatePatientInput } from '@/lib/api';

interface NewPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPatientCreated: (patient: Patient) => void;
}

const CITY_STATION_MAP: Record<string, string> = {
  'New Delhi': 'Anand Vihar, Delhi DPCC',
  'Bengaluru': 'Bengaluru Central CPCB',
  'Mumbai': 'Bandra Kurla Complex, Mumbai',
  'Kolkata': 'Victoria Memorial CPCB',
  'Chennai': 'Alandur, Chennai CPCB',
  'Hyderabad': 'Sanathnagar, Hyderabad PCB',
};

const ALLERGEN_TAGS = [
  'PM2.5 Smog',
  'Dust Mites',
  'Vehicle Exhaust',
  'Biomass Smoke',
  'Grass Pollen',
  'Cold Air',
  'Humidity Fungi',
  'Pet Dander',
];

const PRESET_TEMPLATES = [
  {
    id: 'smoker-delhi',
    label: '🏢 High-Risk Smoker (Delhi)',
    subtitle: 'Current smoker, severe persistent, 45% reported adherence',
    data: {
      age: 46,
      gender: 'Male',
      city: 'New Delhi',
      station: CITY_STATION_MAP['New Delhi'],
      asthma_severity: 'Severe_Persistent',
      simulated_device_profile: 'restless_sleeper',
      baseline_fev1_pct: 52.0,
      baseline_fev1_fvc: 0.62,
      baseline_pef_lmin: 280.0,
      controller_medication: 'Budesonide_Formoterol_200_6',
      reported_adherence: 45,
      smoking_status: 'Active',
      pack_years: 18,
      flare_ups_last_year: 4,
      hospitalized: true,
      allergens: ['PM2.5 Smog', 'Biomass Smoke', 'Dust Mites', 'Vehicle Exhaust'],
    } satisfies CreatePatientInput,
  },
  {
    id: 'athlete-blr',
    label: '🏃 Low-Risk Athlete (Bengaluru)',
    subtitle: 'Never smoked, intermittent, 95% reported adherence',
    data: {
      age: 26,
      gender: 'Female',
      city: 'Bengaluru',
      station: CITY_STATION_MAP['Bengaluru'],
      asthma_severity: 'Intermittent',
      simulated_device_profile: 'typical',
      baseline_fev1_pct: 94.0,
      baseline_fev1_fvc: 0.82,
      baseline_pef_lmin: 460.0,
      controller_medication: 'Budesonide_Formoterol_200_6',
      reported_adherence: 95,
      smoking_status: 'Never',
      pack_years: 0,
      flare_ups_last_year: 0,
      hospitalized: false,
      allergens: ['Grass Pollen'],
    } satisfies CreatePatientInput,
  },
  {
    id: 'senior-mumbai',
    label: '🏠 Compliant Senior (Mumbai)',
    subtitle: 'Former smoker, moderate persistent, 88% reported adherence',
    data: {
      age: 64,
      gender: 'Male',
      city: 'Mumbai',
      station: CITY_STATION_MAP['Mumbai'],
      asthma_severity: 'Moderate_Persistent',
      simulated_device_profile: 'low_activity',
      baseline_fev1_pct: 68.0,
      baseline_fev1_fvc: 0.70,
      baseline_pef_lmin: 340.0,
      controller_medication: 'Fluticasone_Salmeterol_250_50',
      reported_adherence: 88,
      smoking_status: 'Former',
      pack_years: 8,
      flare_ups_last_year: 1,
      hospitalized: false,
      allergens: ['Dust Mites', 'Humidity Fungi'],
    } satisfies CreatePatientInput,
  },
];

const DEFAULT_FORM: CreatePatientInput = {
  age: 38,
  gender: 'Male',
  city: 'New Delhi',
  station: CITY_STATION_MAP['New Delhi'],
  asthma_severity: 'Moderate_Persistent',
  simulated_device_profile: 'typical',
  baseline_fev1_pct: 72.0,
  baseline_fev1_fvc: undefined,
  baseline_pef_lmin: undefined,
  controller_medication: 'Budesonide_Formoterol_200_6',
  reported_adherence: 75,
  smoking_status: 'Never',
  pack_years: 0,
  flare_ups_last_year: 1,
  hospitalized: false,
  allergens: ['Dust Mites', 'PM2.5 Smog'],
};

export default function NewPatientModal({ isOpen, onClose, onPatientCreated }: NewPatientModalProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<CreatePatientInput>({ ...DEFAULT_FORM });
  const [activeStep, setActiveStep] = useState<'profile' | 'clinical'>('profile');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPatient, setCreatedPatient] = useState<Patient | null>(null);

  if (!isOpen) return null;

  const selectedAllergens: string[] = Array.isArray(formData.allergens)
    ? formData.allergens
    : formData.allergens
    ? formData.allergens.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const handleToggleAllergen = (tag: string) => {
    const exists = selectedAllergens.includes(tag);
    const updated = exists
      ? selectedAllergens.filter((t) => t !== tag)
      : [...selectedAllergens, tag];
    setFormData({ ...formData, allergens: updated.length > 0 ? updated : ['PM2.5 Smog'] });
  };

  const handleApplyPreset = (preset: typeof PRESET_TEMPLATES[0]) => {
    setFormData({ ...preset.data });
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const payload: CreatePatientInput = {
        ...formData,
        controller_adherence: formData.reported_adherence ?? 75,
        pack_years:
          formData.smoking_status === 'Never' ? 0 : formData.pack_years ?? 5,
      };
      const newTwin = await createPatient(payload);
      setCreatedPatient(newTwin);
      onPatientCreated(newTwin);
    } catch (err: any) {
      console.error('Failed to create patient twin:', err);
      setError(err?.message || 'Failed to initialize digital twin forward pass.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNavigateToTwin = (subpath = '') => {
    if (!createdPatient) return;
    onClose();
    router.push(`/patients/${createdPatient.id}${subpath}`);
  };

  const showPackYears =
    formData.smoking_status === 'Former' ||
    formData.smoking_status === 'Active' ||
    formData.smoking_status === 'Current';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl border border-[#B4E3C5] dark:border-[#12612F] bg-[#FFFFFF] dark:bg-[#04130A] shadow-2xl my-6 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-[#B4E3C5] dark:border-[#12612F] bg-[#F4F8F5] dark:bg-[#061C0E] flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#0A602F] dark:text-[#2FBF63]">
              // SYNTHETIC CLINICAL ONBOARDING &bull; DILATED TCN + XGBOOST + MLP META-LEARNER
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#0E2E1B] dark:text-[#B6FFCC] tracking-wide mt-0.5">
              Enroll New Synthetic Asthma Twin
            </h2>
            <p className="text-xs text-[#4A755A] dark:text-[#A7E8BD] mt-0.5">
              2-step clinical intake (~10 fields). Wearable vitals are generated by the mechanistic simulator while the twin learns personal baselines (PRD FR-16).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#4A755A] dark:text-[#2FBF63] hover:text-[#0E2E1B] dark:hover:text-[#4CFF8A] p-2 font-mono text-lg leading-none"
            title="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {createdPatient ? (
            /* Success State with FR-16 Learning Baseline & Ensemble Breakdown */
            <div className="border border-[#0E793C] dark:border-[#4CFF8A] bg-[#EAF8EF] dark:bg-[#061C0E] p-5 sm:p-6 space-y-5">
              <div className="flex items-start justify-between gap-4 border-b border-[#B4E3C5] dark:border-[#12612F] pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#0E793C] dark:bg-[#4CFF8A] text-white dark:text-black font-bold text-lg flex items-center justify-center shrink-0">
                    ✓
                  </div>
                  <div>
                    <span className="text-[10px] font-bold tracking-widest uppercase text-[#0A602F] dark:text-[#2FBF63]">
                      3-STAGE ENSEMBLE FORWARD PASS COMPLETE
                    </span>
                    <h3 className="text-xl font-bold text-[#0E2E1B] dark:text-[#B6FFCC]">
                      {createdPatient.name} ({createdPatient.id})
                    </h3>
                    <p className="text-xs text-[#4A755A] dark:text-[#A7E8BD]">
                      Auto-generated synthetic ID &bull; {createdPatient.city} ({createdPatient.station})
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 text-[10px] font-mono font-bold border border-[#0E793C] dark:border-[#4CFF8A] text-[#0E793C] dark:text-[#4CFF8A]">
                  SIMULATED STREAM: {(createdPatient.simulatedDeviceProfile || 'typical').toUpperCase()}
                </span>
              </div>

              {/* Scored Metrics & Base Model Stack Preview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
                <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-3">
                  <div className="text-[10px] uppercase font-bold text-[#4A755A] dark:text-[#2FBF63]">MLP 48H RISK</div>
                  <div className={`text-xl font-bold font-mono mt-0.5 ${
                    createdPatient.risk48h >= 70 ? 'text-[#DC2626] dark:text-[#FF2A1A]' :
                    createdPatient.risk48h >= 50 ? 'text-[#B45309] dark:text-[#FFE14A]' :
                    'text-[#0D7A3E] dark:text-[#4CFF8A]'
                  }`}>
                    {createdPatient.risk48h}%
                  </div>
                  <div className="text-[10px] font-mono text-[#4A755A] dark:text-[#A7E8BD]">
                    CI: {createdPatient.risk48hInterval[0]}%–{createdPatient.risk48hInterval[1]}%
                  </div>
                </div>

                <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-3">
                  <div className="text-[10px] uppercase font-bold text-[#4A755A] dark:text-[#2FBF63]">DILATED TCN</div>
                  <div className="text-lg font-bold font-mono text-[#0E2E1B] dark:text-[#B6FFCC] mt-0.5">
                    {createdPatient.basePredictions?.tcnRisk48h ?? createdPatient.risk48h}%
                  </div>
                  <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63]">Stage-1 Temporal</div>
                </div>

                <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-3">
                  <div className="text-[10px] uppercase font-bold text-[#4A755A] dark:text-[#2FBF63]">XGBOOST 48H</div>
                  <div className="text-lg font-bold font-mono text-[#0E2E1B] dark:text-[#B6FFCC] mt-0.5">
                    {createdPatient.basePredictions?.gradientBoostingRisk48h ?? createdPatient.risk48h}%
                  </div>
                  <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63]">Stage-1 Tabular</div>
                </div>

                <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-3">
                  <div className="text-[10px] uppercase font-bold text-[#4A755A] dark:text-[#2FBF63]">REPORTED ADHERENCE</div>
                  <div className="text-lg font-bold font-mono text-[#0E793C] dark:text-[#4CFF8A] mt-0.5">
                    {createdPatient.controllerAdherence}%
                  </div>
                  <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63]">Controller Estimate</div>
                </div>
              </div>

              {/* PRD FR-16: Learning Baseline & Narrowing Conformal Uncertainty Bands */}
              <div className="border border-[#D97706] dark:border-[#FFE14A] bg-[#FFFBEB] dark:bg-[#1E1904] p-4 space-y-2.5 text-left">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold font-mono uppercase text-[#B45309] dark:text-[#FFE14A]">
                    [FR-16] {createdPatient.learningBaseline?.statusLabel || 'LEARNING PERSONAL BASELINE (DAY 1 OF 7)'}
                  </div>
                  <span className="text-[11px] font-mono font-bold text-[#B45309] dark:text-[#FFE14A]">
                    Initial Uncertainty Band: &plusmn;{createdPatient.learningBaseline?.uncertaintyHalfWidthPct ?? 22}%
                  </span>
                </div>
                <p className="text-xs text-[#4A755A] dark:text-[#A7E8BD]">
                  No physical wearable required at intake. The simulator synthesizes continuous respiratory rate, heart rate, and SpO2 streams while conformal prediction bands narrow over Days 1&ndash;7:
                </p>
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {[
                    { day: 'Day 1 (Now)', width: '±22%', active: true },
                    { day: 'Day 3', width: '±16%', active: false },
                    { day: 'Day 5', width: '±11%', active: false },
                    { day: 'Day 7 (Calibrated)', width: '±7%', active: false },
                  ].map((step) => (
                    <div
                      key={step.day}
                      className={`p-2 border text-center font-mono ${
                        step.active
                          ? 'border-[#D97706] dark:border-[#FFE14A] bg-white dark:bg-[#04130A] text-[#B45309] dark:text-[#FFE14A] font-bold'
                          : 'border-[#B4E3C5] dark:border-[#12612F] bg-white/60 dark:bg-[#04130A]/60 text-[#4A755A] dark:text-[#A7E8BD]'
                      }`}
                    >
                      <div className="text-[10px]">{step.day}</div>
                      <div className="text-xs font-bold mt-0.5">{step.width}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Navigation Buttons */}
              <div className="pt-2 flex flex-wrap gap-2 justify-center">
                <button
                  type="button"
                  onClick={() => handleNavigateToTwin('')}
                  className="px-4 py-2 text-xs font-bold font-mono border border-[#0E793C] dark:border-[#4CFF8A] bg-[#0E793C] dark:bg-[#4CFF8A] text-white dark:text-black hover:opacity-90 transition-all cursor-pointer shadow-sm"
                >
                  [01] VIEW DIGITAL TWIN &rarr;
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateToTwin('/forecast')}
                  className="px-4 py-2 text-xs font-bold font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-[#FFFFFF] dark:bg-[#061C0E] text-[#0E793C] dark:text-[#4CFF8A] hover:border-[#0E793C] dark:hover:border-[#4CFF8A] transition-all cursor-pointer"
                >
                  [02] 48H FORECAST &rarr;
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateToTwin('/what-if')}
                  className="px-4 py-2 text-xs font-bold font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-[#FFFFFF] dark:bg-[#061C0E] text-[#0E793C] dark:text-[#4CFF8A] hover:border-[#0E793C] dark:hover:border-[#4CFF8A] transition-all cursor-pointer"
                >
                  [03] WHAT-IF SANDBOX &rarr;
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* One-Click Scenario Templates */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#4A755A] dark:text-[#2FBF63]">
                  ⚡ QUICK ONE-CLICK SCENARIO TEMPLATES:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {PRESET_TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => handleApplyPreset(tmpl)}
                      className="p-2.5 text-left border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E] hover:border-[#0E793C] dark:hover:border-[#4CFF8A] transition-all cursor-pointer"
                    >
                      <div className="text-xs font-bold text-[#0E2E1B] dark:text-[#B6FFCC] truncate">
                        {tmpl.label}
                      </div>
                      <div className="text-[10px] text-[#4A755A] dark:text-[#A7E8BD] truncate mt-0.5">
                        {tmpl.subtitle}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 2-Step Navigation Tabs */}
              <div className="grid grid-cols-2 border-b border-[#B4E3C5] dark:border-[#12612F] text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setActiveStep('profile')}
                  className={`py-2.5 px-4 border-b-2 font-bold cursor-pointer transition-all text-left ${
                    activeStep === 'profile'
                      ? 'border-[#0E793C] dark:border-[#4CFF8A] text-[#0E793C] dark:text-[#4CFF8A] bg-[#F4F8F5] dark:bg-[#061C0E]'
                      : 'border-transparent text-[#4A755A] dark:text-[#2FBF63] hover:text-[#0E2E1B] dark:hover:text-[#B6FFCC]'
                  }`}
                >
                  STEP 1: PROFILE &amp; SIMULATED STREAM
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStep('clinical')}
                  className={`py-2.5 px-4 border-b-2 font-bold cursor-pointer transition-all text-left ${
                    activeStep === 'clinical'
                      ? 'border-[#0E793C] dark:border-[#4CFF8A] text-[#0E793C] dark:text-[#4CFF8A] bg-[#F4F8F5] dark:bg-[#061C0E]'
                      : 'border-transparent text-[#4A755A] dark:text-[#2FBF63] hover:text-[#0E2E1B] dark:hover:text-[#B6FFCC]'
                  }`}
                >
                  STEP 2: CLINICAL HISTORY &amp; TREATMENT
                </button>
              </div>

              {/* STEP 1: Profile */}
              {activeStep === 'profile' && (
                <div className="space-y-4">
                  {/* Privacy / Synthetic Identifier Notice */}
                  <div className="p-2.5 border border-[#B4E3C5] dark:border-[#12612F] bg-[#F4F8F5] dark:bg-[#061C0E] flex items-center justify-between text-xs font-mono">
                    <span className="text-[#4A755A] dark:text-[#A7E8BD]">
                      SYNTHETIC IDENTITY POLICY: Patient ID &amp; fictional label are auto-generated (no real PII collected).
                    </span>
                    <span className="font-bold text-[#0E793C] dark:text-[#4CFF8A] shrink-0 ml-2">
                      AUTO-ID: PT-XXXX
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* 1. Age & 2. Sex */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1">
                          Age (Years)
                        </label>
                        <input
                          type="number"
                          min="5"
                          max="100"
                          value={formData.age}
                          onChange={(e) => setFormData({ ...formData, age: parseInt(e.target.value) || 30 })}
                          className="w-full px-3 py-2 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#4CFF8A] focus:outline-none focus:border-[#0E793C] dark:focus:border-[#4CFF8A]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1">
                          Sex
                        </label>
                        <select
                          value={formData.gender}
                          onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                          className="w-full px-3 py-2 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#4CFF8A] focus:outline-none focus:border-[#0E793C] dark:focus:border-[#4CFF8A]"
                        >
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                        </select>
                      </div>
                    </div>

                    {/* 3. GINA Severity */}
                    <div>
                      <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1">
                        GINA Asthma Severity (Doctor-Entered)
                      </label>
                      <select
                        value={formData.asthma_severity}
                        onChange={(e) => setFormData({ ...formData, asthma_severity: e.target.value })}
                        className="w-full px-3 py-2 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#4CFF8A] focus:outline-none focus:border-[#0E793C] dark:focus:border-[#4CFF8A]"
                      >
                        <option value="Intermittent">Intermittent (GINA Step 1)</option>
                        <option value="Mild_Persistent">Mild Persistent (GINA Step 2)</option>
                        <option value="Moderate_Persistent">Moderate Persistent (GINA Step 3-4)</option>
                        <option value="Severe_Persistent">Severe Persistent (GINA Step 5)</option>
                      </select>
                    </div>

                    {/* 4. City */}
                    <div>
                      <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1">
                        City (Selects Air-Quality Feed)
                      </label>
                      <select
                        value={formData.city}
                        onChange={(e) => {
                          const city = e.target.value;
                          setFormData({
                            ...formData,
                            city,
                            station: CITY_STATION_MAP[city] || `${city} Central CPCB`,
                          });
                        }}
                        className="w-full px-3 py-2 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#4CFF8A] focus:outline-none focus:border-[#0E793C] dark:focus:border-[#4CFF8A]"
                      >
                        <option value="New Delhi">New Delhi (High Winter PM2.5)</option>
                        <option value="Bengaluru">Bengaluru (Moderate AQI, Pollen)</option>
                        <option value="Mumbai">Mumbai (Coastal Humidity, Traffic)</option>
                        <option value="Kolkata">Kolkata (Industrial &amp; Biomass)</option>
                        <option value="Chennai">Chennai (Coastal Humid)</option>
                        <option value="Hyderabad">Hyderabad (Dust &amp; Urban Traffic)</option>
                      </select>
                    </div>

                    {/* CPCB Station (Auto-filled from City, Read-Only) */}
                    <div>
                      <label className="block text-xs font-bold uppercase text-[#4A755A] dark:text-[#2FBF63] mb-1">
                        CPCB Station (Auto-Filled &bull; Read-Only)
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={formData.station || CITY_STATION_MAP[formData.city] || ''}
                        className="w-full px-3 py-2 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-[#F4F8F5] dark:bg-[#04130A] text-[#4A755A] dark:text-[#A7E8BD] cursor-not-allowed"
                      />
                    </div>

                    {/* 5. Optional Simulated Device Profile */}
                    <div className="sm:col-span-2 p-3.5 border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E]">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <label className="text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC]">
                          Simulated Device Profile (Optional &bull; Simulated Wearable Stream)
                        </label>
                        <span className="text-[10px] font-mono px-2 py-0.5 bg-[#EAF8EF] dark:bg-[#04130A] border border-[#0E793C] dark:border-[#4CFF8A] text-[#0E793C] dark:text-[#4CFF8A]">
                          NO PHYSICAL WATCH REQUIRED
                        </span>
                      </div>
                      <select
                        value={formData.simulated_device_profile || 'typical'}
                        onChange={(e) => setFormData({ ...formData, simulated_device_profile: e.target.value })}
                        className="w-full px-3 py-2 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] text-[#0E2E1B] dark:text-[#4CFF8A]"
                      >
                        <option value="typical">Typical — Standard circadian HR, SpO2, and sleep telemetry (Simulated)</option>
                        <option value="restless_sleeper">Restless Sleeper — Elevated nocturnal awakenings &amp; RR variability (Simulated)</option>
                        <option value="low_activity">Low Activity — Sedentary daytime step count &amp; autonomic baseline (Simulated)</option>
                      </select>
                      <div className="text-[10px] text-[#4A755A] dark:text-[#A7E8BD] mt-1.5">
                        Resting SpO2, heart rate, and respiratory rate are generated by the simulator and learned over the first 7 days with narrowing conformal uncertainty bands (FR-16).
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Clinical History & Treatment */}
              {activeStep === 'clinical' && (
                <div className="space-y-4">
                  {/* 6. Clinic Spirometry (FEV1 % predicted required, FEV1/FVC & PEF optional) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3.5 border border-[#B4E3C5] dark:border-[#12612F] bg-[#F6FBF7] dark:bg-[#061C0E]">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC]">
                          FEV1 (% Predicted)
                        </label>
                        <span className="font-mono text-xs font-bold text-[#0E793C] dark:text-[#4CFF8A]">
                          {formData.baseline_fev1_pct}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="30"
                        max="115"
                        step="1"
                        value={formData.baseline_fev1_pct}
                        onChange={(e) => setFormData({ ...formData, baseline_fev1_pct: parseFloat(e.target.value) })}
                        className="w-full accent-[#0E793C] dark:accent-[#4CFF8A]"
                      />
                      <div className="text-[10px] text-[#4A755A] dark:text-[#A7E8BD]">
                        Clinic spirometry (&ge;80% normal)
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1">
                        FEV1/FVC (Optional)
                      </label>
                      <input
                        type="number"
                        min="0.30"
                        max="1.0"
                        step="0.01"
                        placeholder="Auto-derived if blank"
                        value={formData.baseline_fev1_fvc ?? ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            baseline_fev1_fvc: e.target.value ? parseFloat(e.target.value) : undefined,
                          })
                        }
                        className="w-full px-3 py-1.5 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] text-[#0E2E1B] dark:text-[#4CFF8A]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1">
                        Personal Best PEF (Optional)
                      </label>
                      <input
                        type="number"
                        min="100"
                        max="700"
                        placeholder="L/min (Handheld meter)"
                        value={formData.baseline_pef_lmin ?? ''}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            baseline_pef_lmin: e.target.value ? parseFloat(e.target.value) : undefined,
                          })
                        }
                        className="w-full px-3 py-1.5 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] text-[#0E2E1B] dark:text-[#4CFF8A]"
                      />
                    </div>
                  </div>

                  {/* 7. Controller Medication & 8. Reported Adherence */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1">
                        Controller Medication
                      </label>
                      <select
                        value={formData.controller_medication}
                        onChange={(e) => setFormData({ ...formData, controller_medication: e.target.value })}
                        className="w-full px-3 py-2 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#4CFF8A]"
                      >
                        <option value="Budesonide_Formoterol_200_6">Budesonide / Formoterol 200/6 µg (ICS/LABA)</option>
                        <option value="Fluticasone_Salmeterol_250_50">Fluticasone / Salmeterol 250/50 µg</option>
                        <option value="Beclomethasone_200">Beclomethasone Dipropionate 200 µg (ICS)</option>
                        <option value="None">None (Unmedicated / PRN Only)</option>
                      </select>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC]">
                          Reported Adherence (%)
                        </label>
                        <span className="font-mono text-sm font-bold text-[#0E793C] dark:text-[#4CFF8A]">
                          {formData.reported_adherence ?? 75}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={formData.reported_adherence ?? 75}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            reported_adherence: parseInt(e.target.value) || 0,
                          })
                        }
                        className="w-full accent-[#0E793C] dark:accent-[#4CFF8A]"
                      />
                      <div className="text-[10px] text-[#4A755A] dark:text-[#A7E8BD]">
                        Self-reported estimate that parameterizes simulator clearance (&gamma; &middot; M(t)).
                      </div>
                    </div>
                  </div>

                  {/* 9. Prior Flare-Ups (12m), Hospitalized (2y), and Smoking Status (+ Conditional Pack-Years) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1">
                        Flare-Ups in 12 Months
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="15"
                        value={formData.flare_ups_last_year}
                        onChange={(e) => setFormData({ ...formData, flare_ups_last_year: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#4CFF8A]"
                      />
                    </div>

                    <div className="flex items-center space-x-2.5 pt-5">
                      <input
                        id="hosp-toggle"
                        type="checkbox"
                        checked={formData.hospitalized}
                        onChange={(e) => setFormData({ ...formData, hospitalized: e.target.checked })}
                        className="w-4 h-4 accent-[#0E793C] dark:accent-[#4CFF8A] cursor-pointer"
                      />
                      <label htmlFor="hosp-toggle" className="text-xs text-[#0E2E1B] dark:text-[#B6FFCC] cursor-pointer font-bold">
                        Hospitalized in Past 2 Years
                      </label>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      <div>
                        <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1">
                          Smoking Status
                        </label>
                        <select
                          value={formData.smoking_status}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              smoking_status: e.target.value,
                              pack_years: e.target.value === 'Never' ? 0 : formData.pack_years || 8,
                            })
                          }
                          className="w-full px-3 py-2 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#4CFF8A]"
                        >
                          <option value="Never">Never Smoked</option>
                          <option value="Former">Former Smoker</option>
                          <option value="Active">Current Smoker</option>
                        </select>
                      </div>

                      {showPackYears && (
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-[#4A755A] dark:text-[#2FBF63] mb-0.5">
                            Pack-Years
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="80"
                            value={formData.pack_years || 5}
                            onChange={(e) => setFormData({ ...formData, pack_years: parseInt(e.target.value) || 1 })}
                            className="w-full px-3 py-1.5 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#4CFF8A]"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 10. Multi-Select Allergen & Trigger Tags */}
                  <div>
                    <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1.5">
                      Allergens &amp; Environmental Triggers (Multi-Select Tags)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {ALLERGEN_TAGS.map((tag) => {
                        const active = selectedAllergens.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => handleToggleAllergen(tag)}
                            className={`px-2.5 py-1 text-xs font-mono border transition-all cursor-pointer ${
                              active
                                ? 'border-[#0E793C] dark:border-[#4CFF8A] bg-[#0E793C] dark:bg-[#4CFF8A] text-white dark:text-black font-bold'
                                : 'border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] text-[#4A755A] dark:text-[#A7E8BD] hover:border-[#0E793C]'
                            }`}
                          >
                            {active ? `✓ ${tag}` : `+ ${tag}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="p-3 text-xs font-mono border border-[#DC2626] dark:border-[#FF2A1A] bg-[#FEF2F2] dark:bg-[#320808] text-[#DC2626] dark:text-[#FF2A1A]">
                  &gt; ERROR: {error}
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-3 border-t border-[#B4E3C5] dark:border-[#12612F] flex items-center justify-between">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold font-mono border border-[#B4E3C5] dark:border-[#12612F] text-[#4A755A] dark:text-[#2FBF63] hover:text-[#0E2E1B] dark:hover:text-[#B6FFCC] cursor-pointer"
                >
                  CANCEL
                </button>

                <div className="flex items-center gap-2">
                  {activeStep === 'profile' ? (
                    <button
                      type="button"
                      onClick={() => setActiveStep('clinical')}
                      className="px-5 py-2 text-xs font-bold font-mono border border-[#0E793C] dark:border-[#4CFF8A] bg-[#0E793C] dark:bg-[#4CFF8A] text-white dark:text-black hover:opacity-90 transition-all cursor-pointer"
                    >
                      NEXT: CLINICAL HISTORY &amp; TREATMENT &rarr;
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setActiveStep('profile')}
                        className="px-3 py-2 text-xs font-bold font-mono border border-[#B4E3C5] dark:border-[#12612F] text-[#4A755A] dark:text-[#2FBF63] cursor-pointer"
                      >
                        &larr; BACK
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-5 py-2 text-xs font-bold font-mono border border-[#0E793C] dark:border-[#4CFF8A] bg-[#0E793C] dark:bg-[#4CFF8A] text-white dark:text-black hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer shadow-sm flex items-center gap-2"
                      >
                        {isSubmitting ? (
                          <>
                            <span className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
                            <span>RUNNING TCN + XGBOOST + MLP...</span>
                          </>
                        ) : (
                          <span>[ ⚡ INITIALIZE TWIN &amp; LEARN BASELINE ]</span>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
