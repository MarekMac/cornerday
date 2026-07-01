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
  saveStep: (step: string) => Promise<void>;
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

  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(ONBOARDING_DATA_KEY, JSON.stringify(data)).catch(e => console.warn('[onboarding] storage write failed:', e));
  }, [data, isLoaded]);

  const setField = useCallback((field: keyof OnboardingData, value: string | null) => {
    setData(prev => ({ ...prev, [field]: value ?? undefined }));
  }, []);

  const saveStep = useCallback(async (step: string) => {
    try {
      await AsyncStorage.setItem(ONBOARDING_STEP_KEY, step);
    } catch (e) {
      console.warn('[onboarding] failed to save step:', e);
    }
  }, []);

  const clearProgress = useCallback(() => {
    // ONBOARDING_DATA_KEY isn't included here — setData({}) below triggers the
    // persistence effect above, which immediately rewrites that key anyway, so
    // removing it here would just be overwritten a moment later.
    AsyncStorage.removeItem(ONBOARDING_STEP_KEY).catch(e => console.warn('[onboarding] storage write failed:', e));
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
