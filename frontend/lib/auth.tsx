'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PATIENTS } from './data';

export type UserRole = 'doctor' | 'patient';

export interface AuthSession {
  role: UserRole;
  userId: string;
  name: string;
  subtitle: string;
  patientId?: string; // Set when role === 'patient'
}

const AUTH_STORAGE_KEY = 'breathtwin_auth_session_v1';

export const DEFAULT_DOCTOR_SESSION: AuthSession = {
  role: 'doctor',
  userId: 'DOC-101',
  name: 'Dr. Vikram Mehta, MD',
  subtitle: 'Senior Pulmonologist • All-Cohort Access',
};

export function createPatientSession(patientId: string): AuthSession {
  const found = PATIENTS.find((p) => p.id === patientId) || PATIENTS[0];
  return {
    role: 'patient',
    userId: found.id,
    name: found.name,
    subtitle: `${found.city} • Personal Asthma Twin`,
    patientId: found.id,
  };
}

interface AuthContextValue {
  session: AuthSession;
  isHydrated: boolean;
  loginAsDoctor: (customName?: string) => void;
  loginAsPatient: (patientId: string, customName?: string) => void;
  switchRoleQuick: (role: UserRole, patientId?: string) => void;
}

const AuthContext = createContext<AuthContextValue>({
  session: DEFAULT_DOCTOR_SESSION,
  isHydrated: false,
  loginAsDoctor: () => {},
  loginAsPatient: () => {},
  switchRoleQuick: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession>(DEFAULT_DOCTOR_SESSION);
  const [isHydrated, setIsHydrated] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AuthSession;
        if (parsed && (parsed.role === 'doctor' || parsed.role === 'patient')) {
          setSession(parsed);
        }
      }
    } catch (err) {
      console.warn('Failed to restore auth session:', err);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // Enforce strict role guardrails: Patients can only view their own portal (/patient-portal, /login, /)
  useEffect(() => {
    if (!isHydrated) return;
    if (session.role === 'patient') {
      const isDoctorOnlyRoute =
        pathname.startsWith('/patients') ||
        pathname.startsWith('/benchmarks') ||
        pathname.startsWith('/assumptions');
      if (isDoctorOnlyRoute) {
        router.replace('/patient-portal');
      }
    }
  }, [isHydrated, session, pathname, router]);

  const persistSession = (next: AuthSession) => {
    setSession(next);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
      } catch (err) {
        console.warn('Failed to persist auth session:', err);
      }
    }
  };

  const loginAsDoctor = (customName?: string) => {
    const next: AuthSession = {
      ...DEFAULT_DOCTOR_SESSION,
      name: customName?.trim() ? customName.trim() : DEFAULT_DOCTOR_SESSION.name,
    };
    persistSession(next);
  };

  const loginAsPatient = (patientId: string, customName?: string) => {
    const base = createPatientSession(patientId);
    const next: AuthSession = {
      ...base,
      name: customName?.trim() ? customName.trim() : base.name,
    };
    persistSession(next);
  };

  const switchRoleQuick = (role: UserRole, patientId?: string) => {
    if (role === 'doctor') {
      loginAsDoctor();
      if (pathname.startsWith('/patient-portal')) {
        router.push('/patients');
      }
    } else {
      const pid = patientId || session.patientId || 'PT-8821';
      loginAsPatient(pid);
      router.push('/patient-portal');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        isHydrated,
        loginAsDoctor,
        loginAsPatient,
        switchRoleQuick,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
