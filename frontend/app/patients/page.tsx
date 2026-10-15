'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import StatusChip from '@/components/StatusChip';
import { Patient } from '@/lib/data';
import { getPatients, getClock, stepClock, ClockInfo } from '@/lib/api';

export default function PatientsTriagePage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [clock, setClock] = useState<ClockInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [isClockStepping, setIsClockStepping] = useState(false);
const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('ALL');
  const [cityFilter, setCityFilter] = useState<string>('ALL');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    const load = async () => {
      try {
        const [pts, clk] = await Promise.all([getPatients(), getClock()]);
        if (isMounted) {
          if (pts && pts.length > 0) setPatients(pts);
          if (clk) setClock(clk);
        }
      } catch (err) {
        console.warn('Using local patients cache:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, []);

  const handleStepClock = async (hours: number) => {
    setIsClockStepping(true);
    try {
      const updatedClock = await stepClock(hours);
      if (updatedClock) {
        setClock(updatedClock);
        const updatedPatients = await getPatients(12, updatedClock.current_hour);
        if (updatedPatients && updatedPatients.length > 0) {
          setPatients(updatedPatients);
        }
      }
    } finally {
      setIsClockStepping(false);
    }
  };

  const filteredPatients = patients.filter(p => {
    const matchesSearch = 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.city.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRisk = riskFilter === 'ALL' || p.riskLevel === riskFilter;
    const matchesCity = cityFilter === 'ALL' || p.city === cityFilter;

    return matchesSearch && matchesRisk && matchesCity;
  }).sort((a, b) => {
    return (() => {
        const diff = sortOrder === 'desc' ? b.risk48h - a.risk48h : a.risk48h - b.risk48h;
        if (diff !== 0) return diff;
        return a.id.localeCompare(b.id);
      })();
  });

  const totalMonitored = patients.length;
  const highRiskCount = patients.filter(p => p.riskLevel === 'HIGH RISK').length;
  const avgRisk = Math.round(patients.reduce((sum, p) => sum + p.risk48h, 0) / (totalMonitored || 1));

  const maxAQIPatient = patients.length > 0 
    ? patients.reduce((prev, curr) => (curr.currentAirQuality?.aqi || 0) > (prev.currentAirQuality?.aqi || 0) ? curr : prev, patients[0])
    : null;
  const peakAQI = maxAQIPatient?.currentAirQuality?.aqi || 0;
  const peakAQICategory = maxAQIPatient?.currentAirQuality?.aqiCategory || 'Moderate';
  const peakPM25 = maxAQIPatient?.currentAirQuality?.pm25 || 0;
  const peakCity = maxAQIPatient?.city || 'Delhi';

  return (
    <div className="space-y-8">
      {/* Page Title Header */}
      <div className="border-b border-[#12612F] pb-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium tracking-[0.08em] uppercase text-[#2FBF63]">{`// CLINICAL TRIAGE &bull; COHORT LEVEL MONITOR`}</div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-[#B6FFCC] tracking-wide mt-1">
            Asthma Patient Cohort Roster
          </h1>
          <p className="text-xs text-[#4CFF8A] mt-1">
            Ranked by 48-hour projected flare-up probability. Select any patient to inspect physiological twin.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <span className="text-[#2FBF63] uppercase">REPLAY CLOCK:</span>
          <span className="font-mono text-[#B6FFCC] border border-[#12612F] px-2 py-1 bg-[#04130A]">
            {clock ? `${clock.day_label} (H${clock.current_hour})` : 'DAY 7 • HOUR 168'}
          </span>
          <button
            onClick={() => handleStepClock(-12)}
            disabled={isClockStepping}
            className="font-mono text-[10px] text-[#2FBF63] hover:text-[#4CFF8A] border border-[#12612F] px-1.5 py-1 bg-[#061C0E]"
            title="Step clock back 12 hours"
          >
            -12H
          </button>
          <button
            onClick={() => handleStepClock(12)}
            disabled={isClockStepping}
            className="font-mono text-[10px] text-[#2FBF63] hover:text-[#4CFF8A] border border-[#12612F] px-1.5 py-1 bg-[#061C0E]"
            title="Step clock forward 12 hours"
          >
            +12H
          </button>
          <button
            onClick={() => handleStepClock(24)}
            disabled={isClockStepping}
            className="font-mono text-[10px] text-[#4CFF8A] hover:bg-[#0E793C]/20 dark:hover:bg-[#12612F]/40 border border-[#4CFF8A] px-2 py-1 bg-[#061C0E]"
            title="Step clock forward 24 hours"
          >
            +24H &gt;
          </button>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border border-[#12612F] bg-[#04130A] p-4">
          <div className="text-[10px] uppercase tracking-widest text-[#2FBF63]">TOTAL MONITORED</div>
          <div className="text-2xl font-bold font-mono text-[#B6FFCC] tabular-nums mt-1">{totalMonitored}</div>
          <div className="text-[11px] text-[#2FBF63]">Synthetic Indian cohort</div>
        </div>

        <div className="border border-[#FF2A1A] bg-[#04130A] p-4">
          <div className="text-[10px] uppercase tracking-widest text-[#FF2A1A]">CRITICAL ALERTS</div>
          <div className="text-2xl font-bold font-mono text-[#FF2A1A] tabular-nums mt-1 glow-danger">{highRiskCount}</div>
          <div className="text-[11px] text-[#FF2A1A]">Probability &ge; 70%</div>
        </div>

        <div className="border border-[#12612F] bg-[#04130A] p-4">
          <div className="text-[10px] uppercase tracking-widest text-[#2FBF63]">MEAN 48H RISK</div>
          <div className="text-2xl font-bold font-mono text-[#FFE14A] tabular-nums mt-1">{avgRisk}%</div>
          <div className="text-[11px] text-[#2FBF63]">Cohort population mean</div>
        </div>

        <div className="border border-[#12612F] bg-[#04130A] p-4">
          <div className="text-[10px] uppercase tracking-widest text-[#2FBF63]">{peakCity.toUpperCase()} AQI PEAK</div>
          <div className="text-2xl font-bold font-mono text-[#FF2A1A] tabular-nums mt-1">{peakAQI}</div>
          <div className="text-[11px] text-[#FF2A1A]">{peakAQICategory} &bull; PM2.5 {peakPM25} µg/m³</div>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="border border-[#12612F] bg-[#04130A] p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
        {/* Search Input */}
        <div className="flex-1 min-w-[240px]">
          <input
            type="text"
            placeholder="SEARCH PATIENT ID, NAME, OR CITY..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#061C0E] border border-[#12612F] text-[#4CFF8A] px-3 py-2 text-xs focus:outline-none focus:border-[#4CFF8A] placeholder-[#2FBF63]/50 font-mono"
            style={{ borderRadius: 0 }}
          />
        </div>

        {/* Risk Filter */}
        <div className="flex items-center space-x-2">
          <span className="text-[#2FBF63] uppercase tracking-wider">RISK:</span>
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="bg-[#061C0E] border border-[#12612F] text-[#4CFF8A] px-2 py-2 text-xs focus:outline-none focus:border-[#4CFF8A] font-mono"
            style={{ borderRadius: 0 }}
          >
            <option value="ALL">ALL LEVELS</option>
            <option value="HIGH RISK">HIGH RISK (&ge;70%)</option>
            <option value="ELEVATED">ELEVATED (60-69%)</option>
            <option value="CAUTION">CAUTION (40-59%)</option>
            <option value="NORMAL">NORMAL (&lt;40%)</option>
          </select>
        </div>

        {/* City Filter */}
        <div className="flex items-center space-x-2">
          <span className="text-[#2FBF63] uppercase tracking-wider">CITY:</span>
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="bg-[#061C0E] border border-[#12612F] text-[#4CFF8A] px-2 py-2 text-xs focus:outline-none focus:border-[#4CFF8A] font-mono"
            style={{ borderRadius: 0 }}
          >
            <option value="ALL">ALL CITIES</option>
            <option value="New Delhi">New Delhi</option>
            <option value="Mumbai">Mumbai</option>
            <option value="Bengaluru">Bengaluru</option>
            <option value="Kolkata">Kolkata</option>
            <option value="Ahmedabad">Ahmedabad</option>
          </select>
        </div>

        {/* Sort Order */}
        <div className="flex items-center space-x-2">
          <span className="text-[#2FBF63] uppercase tracking-wider">SORT:</span>
          <button
            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            className="border border-[#12612F] bg-[#061C0E] text-[#4CFF8A] px-3 py-2 text-xs uppercase font-mono hover:border-[#4CFF8A]"
            style={{ borderRadius: 0 }}
          >
            {sortOrder === 'desc' ? 'RISK: HIGH &rarr; LOW' : 'RISK: LOW &rarr; HIGH'}
          </button>
        </div>
      </div>

      {/* Patients Table */}
      <div className="border border-[#12612F] bg-[#04130A] overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#12612F] bg-[#020A05] text-[#2FBF63] uppercase tracking-wider text-[11px]">
              <th className="py-3 px-4 font-medium">PATIENT ID / NAME</th>
              <th className="py-3 px-4 font-medium">LOCATION / STATION</th>
              <th className="py-3 px-4 font-medium">SEVERITY / EHR</th>
              <th className="py-3 px-4 font-medium">CONTROLLER ADHERENCE</th>
              <th className="py-3 px-4 font-medium">48H FLARE-UP RISK</th>
              <th className="py-3 px-4 font-medium">STATUS</th>
              <th className="py-3 px-4 font-medium text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#12612F]/40">
            {filteredPatients.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[#2FBF63] font-mono uppercase">
                  No matching patients found in this filter range.
                </td>
              </tr>
            ) : (
              filteredPatients.map((p) => {
                const isHighRisk = p.riskLevel === 'HIGH RISK';
                return (
                  <tr 
                    key={p.id}
                    className={`triage-row transition-colors ${isHighRisk ? 'is-high-risk' : ''}`}
                  >
                    {/* Patient ID and Name */}
                    <td className="py-3.5 px-4">
                      <div className="font-mono font-bold text-[#B6FFCC]">{p.id}</div>
                      <div className="text-[#4CFF8A] font-medium">{p.name}</div>
                      <div className="text-[10px] text-[#2FBF63]">{p.age}y &bull; {p.gender}</div>
                    </td>

                    {/* Location and Air Quality */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-[#B6FFCC]">{p.city}</div>
                      <div className="text-[10px] text-[#2FBF63] truncate max-w-[160px]">{p.station}</div>
                      <div className="text-[10px] font-mono mt-0.5">
                        <span className="text-[#FFE14A]">AQI {p.currentAirQuality?.aqi ?? '—'}</span> •
                        <span className="text-[#2FBF63] ml-1">PM2.5: {p.currentAirQuality?.pm25 ?? '—'}</span>
                      </div>
                    </td>

                    {/* Severity and FEV1 */}
                    <td className="py-3.5 px-4">
                      <div className="text-[#B6FFCC]">{p.severity}</div>
                      <div className="text-[10px] text-[#2FBF63]">FEV1: {p.baselineFEV1Percent}% pred ({p.baselineFEV1}L)</div>
                      <div className="text-[10px] text-[#2FBF63]">Flare-ups/yr: {p.flareUpsLastYear}</div>
                    </td>

                    {/* Adherence */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-semibold text-[#B6FFCC]">{p.controllerAdherence}%</span>
                        <div className="w-16 h-1.5 bg-[#020A05] border border-[#12612F]">
                          <div 
                            className="h-full bg-[#4CFF8A]" 
                            style={{ width: `${p.controllerAdherence}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-[10px] text-[#2FBF63] truncate max-w-[150px] mt-0.5">
                        {p.controllerMedication}
                      </div>
                    </td>

                    {/* 48h Risk */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-baseline space-x-2">
                        <span className={`text-base font-bold font-mono tabular-nums ${
                          isHighRisk ? 'text-[#FF2A1A] glow-danger' : 
                          p.riskLevel === 'ELEVATED' ? 'text-[#FFA61F]' :
                          p.riskLevel === 'CAUTION' ? 'text-[#FFE14A]' : 'text-[#4CFF8A]'
                        }`}>
                          {p.risk48h}%
                        </span>
                        <span className="text-[10px] font-mono text-[#2FBF63]">
                          CI: [{p.risk48hInterval[0]}-{p.risk48hInterval[1]}%]
                        </span>
                      </div>
                      {p.activeAlert && (
                        <div className="text-[10px] text-[#FF2A1A] font-semibold mt-0.5">
                          &gt; {p.leadTimeHours}h Alert Lead Time
                        </div>
                      )}
                    </td>

                    {/* Status Chip */}
                    <td className="py-3.5 px-4">
                      <StatusChip status={p.riskLevel} size="sm" />
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <Link
                          href={`/patients/${p.id}`}
                          className="h-8 px-3 text-[11px] uppercase tracking-wider font-semibold border border-[#4CFF8A] text-[#4CFF8A] hover:bg-[#4CFF8A] hover:text-[#020A05] transition-colors inline-flex items-center"
                        >
                          TWIN &gt;
                        </Link>
                        <Link
                          href={`/patients/${p.id}/what-if`}
                          className="h-8 px-2.5 text-[11px] uppercase tracking-wider font-medium border border-[#12612F] text-[#2FBF63] hover:border-[#4CFF8A] hover:text-[#4CFF8A] transition-colors inline-flex items-center bg-[#020A05]"
                          title="Open What-If Sandbox"
                        >
                          WHAT-IF
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
