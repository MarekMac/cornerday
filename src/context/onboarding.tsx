import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';

import { ONBOARDING_DATA_KEY, ONBOARDING_STEP_KEY } from '@/constants/storage-keys';

export interface OnboardingData {
  motivation: string;
  trigger: string;
  weeklyBet: string | null;
  currency: string;
  goal: string;
  supportType: string;
  quitDate: string;
}

interface OnboardingContextType {
  data: Partial<OnboardingData>;
  isLoaded: boolean;
  setField: (field: keyof OnboardingData, value: string | null) => void;
  saveStep: (step: string) => void;
  clearProgress: () => void;
}

const OnboardingContext = createContext<OnboardingContextType | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Partial<OnboardingData>>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_DATA_KEY)
      .then(raw => {
        if (raw) {
          try { setData(JSON.parse(raw)); } catch {}
        }
      })
      .finally(() => setIsLoaded(true));
  }, []);

  const setField = useCallback((field: keyof OnboardingData, value: string | null) => {
    setData(prev => {
      const next = { ...prev, [field]: value ?? undefined };
      AsyncStorage.setItem(ONBOARDING_DATA_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const saveStep = useCallback((step: string) => {
    AsyncStorage.setItem(ONBOARDING_STEP_KEY, step);
  }, []);

  const clearProgress = useCallback(() => {
    AsyncStorage.multiRemove([ONBOARDING_DATA_KEY, ONBOARDING_STEP_KEY]);
    setData({});
  }, []);

  return (
    <OnboardingContext.Provider value={{ data, isLoaded, setField, saveStep, clearProgress }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
