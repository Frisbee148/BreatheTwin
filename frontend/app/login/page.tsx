'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { loginUserAccount } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const { loginAsDoctor, loginAsPatient } = useAuth();

  const [role, setRole] = useState<'doctor' | 'patient'>('doctor');
  const [email, setEmail] = useState('doctor@synclave.health');
  const [password, setPassword] = useState('doctor123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRoleChange = (newRole: 'doctor' | 'patient') => {
    setRole(newRole);
    setError(null);
    if (newRole === 'doctor') {
      setEmail('doctor@synclave.health');
      setPassword('doctor123');
    } else {
      setEmail('patient0@synclave.health');
      setPassword('patient123');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await loginUserAccount({
        email: email.trim(),
        password,
        role,
      });

      if (role === 'doctor') {
        loginAsDoctor(res.account?.full_name || 'Dr. Vikram Mehta, MD');
        router.push('/patients');
      } else {
        const patientId = res.account?.patient_id || 'PT-8821';
        loginAsPatient(patientId, res.account?.full_name || 'Aarush Sen');
        router.push('/patient-portal');
      }
    } catch (err: any) {
      const errMsg = err?.message || '';
      const isNetworkError =
        errMsg.includes('Failed to fetch') ||
        errMsg.includes('NetworkError') ||
        errMsg.includes('Load failed');

      // Local demo fallback ONLY if backend API is completely unreachable
      if (isNetworkError) {
        if (role === 'doctor' && email === 'doctor@synclave.health' && password === 'doctor123') {
          loginAsDoctor('Dr. Vikram Mehta, MD');
          router.push('/patients');
          return;
        } else if (role === 'patient' && email === 'patient0@synclave.health' && password === 'patient123') {
          loginAsPatient('PT-8821', 'Aarush Sen');
          router.push('/patient-portal');
          return;
        } else if (role === 'patient' && email === 'patient12@synclave.health' && password === 'patient123') {
          loginAsPatient('PT-4409', 'Priya Nair');
          router.push('/patient-portal');
          return;
        } else if (role === 'patient' && email === 'patient3@synclave.health' && password === 'patient123') {
          loginAsPatient('PT-1923', 'Rajesh Sharma');
          router.push('/patient-portal');
          return;
        }
      }

      setError(errMsg || 'Email does not exist.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center px-4 py-8">
      {/* Single Clean Login Card */}
      <div className="w-full max-w-md border border-[#12612F] bg-[#04130A] p-6 sm:p-8 space-y-6 shadow-2xl">
        <div className="space-y-1.5 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-[#B6FFCC]">
            Sign In to BreathTwin
          </h1>
          <p className="text-xs text-[#75FFA5]">
            Select your account type to proceed
          </p>
        </div>

        {/* Role Selection Toggle */}
        <div className="grid grid-cols-2 p-1 border border-[#12612F] bg-[#020A05] text-xs font-mono font-bold">
          <button
            type="button"
            onClick={() => handleRoleChange('doctor')}
            className={`py-2.5 uppercase transition-colors cursor-pointer ${
              role === 'doctor'
                ? 'bg-[#4CFF8A] text-[#020A05]'
                : 'text-[#4CFF8A] hover:bg-[#061C0E]'
            }`}
          >
            Doctor
          </button>
          <button
            type="button"
            onClick={() => handleRoleChange('patient')}
            className={`py-2.5 uppercase transition-colors cursor-pointer ${
              role === 'patient'
                ? 'bg-[#4CFF8A] text-[#020A05]'
                : 'text-[#4CFF8A] hover:bg-[#061C0E]'
            }`}
          >
            Patient
          </button>
        </div>

        {error && (
          <div className="p-3 border border-[#FF334B] bg-[#1F0408] text-[#FF8A98] text-xs font-mono">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-[#2FBF63] mb-1.5">
              {role === 'doctor' ? 'Doctor Email' : 'Patient Email'}
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={role === 'doctor' ? 'doctor@synclave.health' : 'patient0@synclave.health'}
              className="w-full bg-[#061C0E] border border-[#12612F] text-[#B6FFCC] px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:border-[#4CFF8A]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-[#2FBF63] mb-1.5">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-[#061C0E] border border-[#12612F] text-[#B6FFCC] px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:border-[#4CFF8A]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 border border-[#4CFF8A] bg-[#4CFF8A] text-[#020A05] font-mono font-bold text-xs uppercase tracking-wider hover:bg-transparent hover:text-[#4CFF8A] transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : `Login as ${role === 'doctor' ? 'Doctor' : 'Patient'} →`}
          </button>
        </form>
      </div>
    </div>
  );
}
