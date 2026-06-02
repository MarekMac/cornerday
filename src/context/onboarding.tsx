import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface OnboardingData {
  motivation: string;
  trigger: string;
  weeklyBet: string | null;
  currency: string;
  goal: string;
  supportType: string;
}

interface OnboardingContextType {
  data: Partial<OnboardingData>;
  setField: (field: keyof OnboardingData, value: string | null) => void;
}

const OnboardingContext = createContext<OnboardingContextType | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Partial<OnboardingData>>({});

  const setField = useCallback((field: keyof OnboardingData, value: string | null) => {
    setData(prev => ({ ...prev, [field]: value }));
  }, []);

  return (
    <OnboardingContext.Provider value={{ data, setField }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}
