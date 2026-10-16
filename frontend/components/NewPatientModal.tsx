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

const PRESET_TEMPLATES = [
  {
    id: 'smoker-delhi',
    label: '🏢 High-Risk Smoker (Delhi)',
    subtitle: 'Active smoker, severe persistent, 45% adherence',
    data: {
      name: 'Rajesh Malhotra',
      age: 46,
      gender: 'Male',
      city: 'New Delhi',
      station: 'Anand Vihar, Delhi DPCC',
      asthma_severity: 'Severe_Persistent',
      baseline_fev1_pct: 52.0,
      baseline_fev1_fvc: 0.62,
      baseline_pef_lmin: 280.0,
      baseline_spo2: 92.0,
      baseline_resting_hr: 88,
      baseline_rr: 22,
      controller_medication: 'Budesonide_Formoterol_200_6',
      controller_adherence: 45,
      smoking_status: 'Active',
      pack_years: 18,
      copd_status: true,
      comorbidity_burden: 2,
      flare_ups_last_year: 4,
      hospitalized: true,
      allergens: 'Biomass Smoke, Dust Mites, Vehicle Exhaust',
    },
  },
  {
    id: 'athlete-blr',
    label: '🏃 Low-Risk Athlete (Bengaluru)',
    subtitle: 'Never smoked, mild intermittent, 95% adherence',
    data: {
      name: 'Pooja Hegde',
      age: 26,
      gender: 'Female',
      city: 'Bengaluru',
      station: 'Bengaluru Central CPCB',
      asthma_severity: 'Intermittent',
      baseline_fev1_pct: 94.0,
      baseline_fev1_fvc: 0.82,
      baseline_pef_lmin: 460.0,
      baseline_spo2: 98.0,
      baseline_resting_hr: 62,
      baseline_rr: 14,
      controller_medication: 'Budesonide_Formoterol_200_6',
      controller_adherence: 95,
      smoking_status: 'Never',
      pack_years: 0,
      copd_status: false,
      comorbidity_burden: 0,
      flare_ups_last_year: 0,
      hospitalized: false,
      allergens: 'Grass Pollen',
    },
  },
  {
    id: 'senior-mumbai',
    label: '🏠 Strict-Compliance Senior (Mumbai)',
    subtitle: 'Former smoker, moderate persistent, 88% adherence',
    data: {
      name: 'Dr. K. N. Sen',
      age: 64,
      gender: 'Male',
      city: 'Mumbai',
      station: 'Bandra Kurla Complex, Mumbai',
      asthma_severity: 'Moderate_Persistent',
      baseline_fev1_pct: 68.0,
      baseline_fev1_fvc: 0.70,
      baseline_pef_lmin: 340.0,
      baseline_spo2: 95.0,
      baseline_resting_hr: 74,
      baseline_rr: 17,
      controller_medication: 'Fluticasone_Salmeterol_250_50',
      controller_adherence: 88,
      smoking_status: 'Former',
      pack_years: 8,
      copd_status: false,
      comorbidity_burden: 1,
      flare_ups_last_year: 1,
      hospitalized: false,
      allergens: 'Dust Mites, Humidity Fungi',
    },
  },
];

const DEFAULT_FORM: CreatePatientInput = {
  name: '',
  age: 38,
  gender: 'Male',
  city: 'New Delhi',
  station: 'Anand Vihar, Delhi DPCC',
  asthma_severity: 'Moderate_Persistent',
  baseline_fev1_pct: 72.0,
  baseline_fev1_fvc: 0.72,
  baseline_pef_lmin: 380.0,
  baseline_spo2: 96.0,
  baseline_resting_hr: 74,
  baseline_rr: 16,
  controller_medication: 'Budesonide_Formoterol_200_6',
  controller_adherence: 75,
  smoking_status: 'Never',
  pack_years: 0,
  copd_status: false,
  comorbidity_burden: 1,
  flare_ups_last_year: 1,
  hospitalized: false,
  allergens: 'Dust Mites, Vehicle Exhaust',
};

export default function NewPatientModal({ isOpen, onClose, onPatientCreated }: NewPatientModalProps) {
  const router = useRouter();
  const [formData, setFormData] = useState<CreatePatientInput>({ ...DEFAULT_FORM });
  const [activeTab, setActiveTab] = useState<'profile' | 'spirometry' | 'medication' | 'history'>('profile');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPatient, setCreatedPatient] = useState<Patient | null>(null);

  if (!isOpen) return null;

  const handleApplyPreset = (preset: typeof PRESET_TEMPLATES[0]) => {
    setFormData({ ...preset.data });
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Please provide a patient name.');
      setActiveTab('profile');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const newTwin = await createPatient(formData);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl border border-[#B4E3C5] dark:border-[#12612F] bg-[#FFFFFF] dark:bg-[#04130A] shadow-2xl my-6 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-[#B4E3C5] dark:border-[#12612F] bg-[#F4F8F5] dark:bg-[#061C0E] flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#0A602F] dark:text-[#2FBF63]">
              // CLINICAL ONBOARDING &bull; MULTIMODAL TWIN SYNTHESIS
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#0E2E1B] dark:text-[#B6FFCC] tracking-wide mt-0.5">
              Enroll New Asthma Patient Twin
            </h2>
            <p className="text-xs text-[#4A755A] dark:text-[#A7E8BD] mt-0.5">
              Enter clinical profile &amp; baseline vitals. The neural network generates 7-day continuous telemetry and 48h risk forecast.
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
            /* Success State */
            <div className="border border-[#0E793C] dark:border-[#4CFF8A] bg-[#EAF8EF] dark:bg-[#061C0E] p-6 space-y-5 text-center">
              <div className="w-12 h-12 rounded-full bg-[#0E793C] dark:bg-[#4CFF8A] text-white dark:text-black font-bold text-xl flex items-center justify-center mx-auto">
                ✓
              </div>
              <div>
                <span className="text-[10px] font-bold tracking-widest uppercase text-[#0A602F] dark:text-[#2FBF63]">
                  NEURAL FORWARD PASS SUCCESSFUL
                </span>
                <h3 className="text-2xl font-bold text-[#0E2E1B] dark:text-[#B6FFCC] mt-1">
                  {createdPatient.name} ({createdPatient.id})
                </h3>
                <p className="text-xs text-[#4A755A] dark:text-[#A7E8BD] mt-1">
                  Digital twin initialized with baseline wearable telemetry &amp; multimodal risk calibrated.
                </p>
              </div>

              {/* Scored Metrics Preview */}
              <div className="grid grid-cols-3 gap-3 max-w-lg mx-auto py-2 text-left">
                <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-3">
                  <div className="text-[10px] uppercase font-bold text-[#4A755A] dark:text-[#2FBF63]">48H RISK</div>
                  <div className={`text-xl font-bold font-mono mt-0.5 ${
                    createdPatient.risk48h >= 70 ? 'text-[#DC2626] dark:text-[#FF2A1A]' :
                    createdPatient.risk48h >= 50 ? 'text-[#B45309] dark:text-[#FFE14A]' :
                    'text-[#0D7A3E] dark:text-[#4CFF8A]'
                  }`}>
                    {createdPatient.risk48h}%
                  </div>
                  <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63]">{createdPatient.riskLevel}</div>
                </div>

                <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-3">
                  <div className="text-[10px] uppercase font-bold text-[#4A755A] dark:text-[#2FBF63]">LOCATION</div>
                  <div className="text-sm font-semibold text-[#0E2E1B] dark:text-[#B6FFCC] mt-0.5 truncate">
                    {createdPatient.city}
                  </div>
                  <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63]">AQI {createdPatient.currentAirQuality?.aqi || 'N/A'}</div>
                </div>

                <div className="border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#04130A] p-3">
                  <div className="text-[10px] uppercase font-bold text-[#4A755A] dark:text-[#2FBF63]">ADHERENCE</div>
                  <div className="text-xl font-bold font-mono text-[#0E793C] dark:text-[#4CFF8A] mt-0.5">
                    {createdPatient.controllerAdherence}%
                  </div>
                  <div className="text-[10px] text-[#4A755A] dark:text-[#2FBF63]">Controller Rx</div>
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
              {/* One-Click Presets */}
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

              {/* Navigation Tabs */}
              <div className="flex border-b border-[#B4E3C5] dark:border-[#12612F] text-xs font-mono">
                {[
                  { id: 'profile', label: '1. Demographics & City' },
                  { id: 'spirometry', label: '2. Spirometry & Vitals' },
                  { id: 'medication', label: '3. Inhaler & Adherence' },
                  { id: 'history', label: '4. Lifestyle & Triggers' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`py-2 px-3 border-b-2 font-bold cursor-pointer transition-all ${
                      activeTab === tab.id
                        ? 'border-[#0E793C] dark:border-[#4CFF8A] text-[#0E793C] dark:text-[#4CFF8A] bg-[#F4F8F5] dark:bg-[#061C0E]'
                        : 'border-transparent text-[#4A755A] dark:text-[#2FBF63] hover:text-[#0E2E1B] dark:hover:text-[#B6FFCC]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab 1: Profile */}
              {activeTab === 'profile' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1">
                      Full Patient Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Kabir Sharma"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#4CFF8A] focus:outline-none focus:border-[#0E793C] dark:focus:border-[#4CFF8A]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
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
                        Gender
                      </label>
                      <select
                        value={formData.gender}
                        onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                        className="w-full px-3 py-2 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#4CFF8A] focus:outline-none focus:border-[#0E793C] dark:focus:border-[#4CFF8A]"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1">
                      City / Geography
                    </label>
                    <select
                      value={formData.city}
                      onChange={(e) => {
                        const city = e.target.value;
                        const defaultStations: Record<string, string> = {
                          'New Delhi': 'Anand Vihar, Delhi DPCC',
                          'Bengaluru': 'Bengaluru Central CPCB',
                          'Mumbai': 'Bandra Kurla Complex, Mumbai',
                          'Kolkata': 'Victoria Memorial CPCB',
                          'Chennai': 'Alandur, Chennai CPCB',
                          'Hyderabad': 'Sanathnagar, Hyderabad PCB',
                        };
                        setFormData({
                          ...formData,
                          city,
                          station: defaultStations[city] || `${city} Central`,
                        });
                      }}
                      className="w-full px-3 py-2 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#4CFF8A] focus:outline-none focus:border-[#0E793C] dark:focus:border-[#4CFF8A]"
                    >
                      <option value="New Delhi">New Delhi (High Winter PM2.5)</option>
                      <option value="Bengaluru">Bengaluru (Moderate AQI, Pollen)</option>
                      <option value="Mumbai">Mumbai (Coastal Humidity, Vehicle)</option>
                      <option value="Kolkata">Kolkata (Industrial &amp; Biomass)</option>
                      <option value="Chennai">Chennai (Coastal Humid)</option>
                      <option value="Hyderabad">Hyderabad (Dust &amp; Traffic)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1">
                      CPCB Air Quality Station
                    </label>
                    <input
                      type="text"
                      value={formData.station}
                      onChange={(e) => setFormData({ ...formData, station: e.target.value })}
                      className="w-full px-3 py-2 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#4CFF8A] focus:outline-none focus:border-[#0E793C] dark:focus:border-[#4CFF8A]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1">
                      GINA Asthma Severity Classification
                    </label>
                    <select
                      value={formData.asthma_severity}
                      onChange={(e) => setFormData({ ...formData, asthma_severity: e.target.value })}
                      className="w-full px-3 py-2 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#4CFF8A] focus:outline-none focus:border-[#0E793C] dark:focus:border-[#4CFF8A]"
                    >
                      <option value="Intermittent">Intermittent (Step 1)</option>
                      <option value="Mild_Persistent">Mild Persistent (Step 2)</option>
                      <option value="Moderate_Persistent">Moderate Persistent (Step 3-4)</option>
                      <option value="Severe_Persistent">Severe Persistent (Step 5)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Tab 2: Spirometry & Vitals */}
              {activeTab === 'spirometry' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC]">
                        Baseline FEV1 (% Predicted)
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
                    <div className="text-[10px] text-[#4A755A] dark:text-[#A7E8BD] mt-0.5">
                      Normal: &ge; 80% &bull; Mild: 70-79% &bull; Moderate: 60-69% &bull; Severe: &lt; 60%
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1">
                      FEV1 / FVC Ratio
                    </label>
                    <input
                      type="number"
                      min="0.30"
                      max="1.0"
                      step="0.01"
                      value={formData.baseline_fev1_fvc}
                      onChange={(e) => setFormData({ ...formData, baseline_fev1_fvc: parseFloat(e.target.value) || 0.75 })}
                      className="w-full px-3 py-2 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#4CFF8A]"
                    />
                    <div className="text-[10px] text-[#4A755A] dark:text-[#A7E8BD] mt-0.5">
                      Obstruction indicated if &lt; 0.70
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1">
                      Peak Expiratory Flow (PEF L/min)
                    </label>
                    <input
                      type="number"
                      min="100"
                      max="700"
                      value={formData.baseline_pef_lmin}
                      onChange={(e) => setFormData({ ...formData, baseline_pef_lmin: parseFloat(e.target.value) || 350 })}
                      className="w-full px-3 py-2 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#4CFF8A]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1">
                      Resting SpO2 (%)
                    </label>
                    <input
                      type="number"
                      min="80"
                      max="100"
                      step="0.5"
                      value={formData.baseline_spo2}
                      onChange={(e) => setFormData({ ...formData, baseline_spo2: parseFloat(e.target.value) || 96 })}
                      className="w-full px-3 py-2 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#4CFF8A]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1">
                      Resting Heart Rate (BPM)
                    </label>
                    <input
                      type="number"
                      min="50"
                      max="130"
                      value={formData.baseline_resting_hr}
                      onChange={(e) => setFormData({ ...formData, baseline_resting_hr: parseInt(e.target.value) || 72 })}
                      className="w-full px-3 py-2 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#4CFF8A]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1">
                      Baseline Respiratory Rate (breaths/min)
                    </label>
                    <input
                      type="number"
                      min="10"
                      max="35"
                      value={formData.baseline_rr}
                      onChange={(e) => setFormData({ ...formData, baseline_rr: parseInt(e.target.value) || 16 })}
                      className="w-full px-3 py-2 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#4CFF8A]"
                    />
                  </div>
                </div>
              )}

              {/* Tab 3: Medication */}
              {activeTab === 'medication' && (
                <div className="space-y-4">
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
                      <option value="Beclomethasone_200">Beclomethasone Dipropionate 200 µg (ICS Monotherapy)</option>
                      <option value="None">None (Unmedicated / Irregular)</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC]">
                        Smart Inhaler Controller Adherence (%)
                      </label>
                      <span className="font-mono text-base font-bold text-[#0E793C] dark:text-[#4CFF8A]">
                        {formData.controller_adherence}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={formData.controller_adherence}
                      onChange={(e) => setFormData({ ...formData, controller_adherence: parseInt(e.target.value) || 0 })}
                      className="w-full accent-[#0E793C] dark:accent-[#4CFF8A]"
                    />
                    <div className="text-[10px] text-[#4A755A] dark:text-[#A7E8BD] mt-0.5">
                      Sub-60% adherence is the leading driver of nocturnal inflammation rebound.
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1">
                        Flare-Ups in Past 12 Months
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

                    <div className="flex items-center space-x-3 pt-6">
                      <input
                        id="hosp-toggle"
                        type="checkbox"
                        checked={formData.hospitalized}
                        onChange={(e) => setFormData({ ...formData, hospitalized: e.target.checked })}
                        className="w-4 h-4 accent-[#0E793C] dark:accent-[#4CFF8A] cursor-pointer"
                      />
                      <label htmlFor="hosp-toggle" className="text-xs text-[#0E2E1B] dark:text-[#B6FFCC] cursor-pointer font-bold">
                        Hospitalized for Asthma in Past 2 Years
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 4: Lifestyle & Triggers */}
              {activeTab === 'history' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1">
                      Smoking Status
                    </label>
                    <select
                      value={formData.smoking_status}
                      onChange={(e) => setFormData({ ...formData, smoking_status: e.target.value })}
                      className="w-full px-3 py-2 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#4CFF8A]"
                    >
                      <option value="Never">Never Smoked</option>
                      <option value="Former">Former Smoker</option>
                      <option value="Active">Active Smoker</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1">
                      Pack-Years History
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="80"
                      value={formData.pack_years}
                      onChange={(e) => setFormData({ ...formData, pack_years: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#4CFF8A]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold uppercase text-[#0E2E1B] dark:text-[#B6FFCC] mb-1">
                      Environmental Allergens &amp; Known Triggers
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Dust Mites, Vehicle Exhaust, Crop Residue"
                      value={formData.allergens}
                      onChange={(e) => setFormData({ ...formData, allergens: e.target.value })}
                      className="w-full px-3 py-2 text-xs font-mono border border-[#B4E3C5] dark:border-[#12612F] bg-white dark:bg-[#061C0E] text-[#0E2E1B] dark:text-[#4CFF8A]"
                    />
                  </div>

                  <div className="flex items-center space-x-3 pt-2">
                    <input
                      id="copd-toggle"
                      type="checkbox"
                      checked={formData.copd_status}
                      onChange={(e) => setFormData({ ...formData, copd_status: e.target.checked })}
                      className="w-4 h-4 accent-[#0E793C] dark:accent-[#4CFF8A] cursor-pointer"
                    />
                    <label htmlFor="copd-toggle" className="text-xs text-[#0E2E1B] dark:text-[#B6FFCC] cursor-pointer font-bold">
                      COPD / Asthma-COPD Overlap (ACO)
                    </label>
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

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold font-mono border border-[#0E793C] dark:border-[#4CFF8A] bg-[#0E793C] dark:bg-[#4CFF8A] text-white dark:text-black hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer shadow-sm flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      <span>SYNTHESIZING TELEMETRY &amp; RUNNING INFERENCE...</span>
                    </>
                  ) : (
                    <span>[ ⚡ INITIALIZE MULTIMODAL TWIN &amp; RUN FORWARD PASS ]</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
