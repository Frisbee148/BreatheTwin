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
  isLoggedIn: boolean;
}

const AUTH_STORAGE_KEY = 'breathtwin_auth_session_v1';

export const GUEST_SESSION: AuthSession = {
  role: 'doctor',
  userId: '',
  name: '',
  subtitle: '',
  isLoggedIn: false,
};

export const DEFAULT_DOCTOR_SESSION: AuthSession = {
  role: 'doctor',
  userId: 'DOC-101',
  name: 'Dr. Vikram Mehta, MD',
  subtitle: 'Senior Pulmonologist • All-Cohort Access',
  isLoggedIn: true,
};

export function createPatientSession(patientId: string): AuthSession {
  const cleanId = patientId === 'PT-4410' ? 'PT-4409' : patientId;
  const found = PATIENTS.find((p) => p.id === cleanId) || PATIENTS[0];
  return {
    role: 'patient',
    userId: found.id,
    name: found.name,
    subtitle: `${found.city} • Personal Asthma Twin`,
    patientId: found.id,
    isLoggedIn: true,
  };
}

interface AuthContextValue {
  session: AuthSession;
  isHydrated: boolean;
  loginAsDoctor: (customName?: string) => void;
  loginAsPatient: (patientId: string, customName?: string) => void;
  logout: () => void;
  switchRoleQuick: (role: UserRole, patientId?: string) => void;
}

const AuthContext = createContext<AuthContextValue>({
  session: GUEST_SESSION,
  isHydrated: false,
  loginAsDoctor: () => {},
  loginAsPatient: () => {},
  logout: () => {},
  switchRoleQuick: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession>(GUEST_SESSION);
  const [isHydrated, setIsHydrated] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AuthSession;
        if (parsed && (parsed.role === 'doctor' || parsed.role === 'patient')) {
          let resolved = { ...parsed };
          if (resolved.role === 'patient') {
            if (resolved.patientId === 'PT-4410') {
              resolved.patientId = 'PT-4409';
              resolved.userId = 'PT-4409';
            }
            const matching = PATIENTS.find((p) => p.id === resolved.patientId);
            if (matching) {
              resolved.name = matching.name;
              resolved.subtitle = `${matching.city} • Personal Asthma Twin`;
              resolved.patientId = matching.id;
              resolved.userId = matching.id;
            }
          }
          setSession({
            ...resolved,
            isLoggedIn: resolved.isLoggedIn ?? true,
          });
        }
      }
    } catch (err) {
      console.warn('Failed to restore auth session:', err);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // Strict role guardrails & authentication protection
  useEffect(() => {
    if (!isHydrated) return;

    // Protected routes requiring authentication
    const isProtectedRoute =
      pathname.startsWith('/patients') ||
      pathname.startsWith('/patient-portal') ||
      pathname.startsWith('/patient-preview') ||
      pathname.startsWith('/benchmarks') ||
      pathname.startsWith('/assumptions');

    if (!session.isLoggedIn && isProtectedRoute) {
      router.replace('/login');
      return;
    }

    if (session.isLoggedIn && session.role === 'patient') {
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
      isLoggedIn: true,
    };
    persistSession(next);
  };

  const loginAsPatient = (patientId: string, customName?: string) => {
    const cleanId = patientId === 'PT-4410' ? 'PT-4409' : patientId;
    const base = createPatientSession(cleanId);
    const cleanName = customName
      ? customName.replace(/\s*\(PT-\d+\)/i, '').trim()
      : base.name;

    const next: AuthSession = {
      ...base,
      name: cleanName || base.name,
      isLoggedIn: true,
    };
    persistSession(next);
  };

  const logout = () => {
    setSession(GUEST_SESSION);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      } catch (err) {
        console.warn('Failed to clear auth session:', err);
      }
    }
    router.push('/login');
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
        logout,
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
