import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { QuestionScreen } from '@/components/onboarding/QuestionScreen';
import { useOnboarding } from '@/context/onboarding';
import { useAppTheme } from '@/context/theme';

const OPTION_DEFS = [
  { value: 'financial_pressure', label: 'Financial pressure',       icon: 'cash-outline'           as const },
  { value: 'betting_ads',        label: 'Betting ads',              icon: 'megaphone-outline'      as const },
  { value: 'social_pressure',    label: 'Friends or social pressure', icon: 'people-outline'       as const },
  { value: 'live_sport',         label: 'Watching live sport',      icon: 'trophy-outline'         as const },
  { value: 'stress',             label: 'Stress',                   icon: 'pulse-outline'          as const },
  { value: 'boredom',            label: 'Boredom',                  icon: 'time-outline'           as const },
];

export default function Q2Screen() {
  const { colors: c } = useAppTheme();
  const router = useRouter();
  const { data, isLoaded, setField, saveStep } = useOnboarding();
  const [selected, setSelected] = useState('');

  useEffect(() => {
    if (isLoaded && data.trigger) setSelected(data.trigger);
  }, [isLoaded, data.trigger]);

  const handleContinue = async () => {
    setField('trigger', selected);
    await saveStep('q3');
    router.push('/(onboarding)/q3');
  };

  const handleSkip = async () => {
    setField('trigger', '');
    await saveStep('q3');
    router.push('/(onboarding)/q3');
  };

  const options = OPTION_DEFS.map(o => ({
    value: o.value,
    label: o.label,
    emoji: <Ionicons name={o.icon} size={24} color={c.primary} />,
  }));

  return (
    <QuestionScreen
      step={2}
      total={3}
      title="What is your biggest trigger?"
      subtitle="Knowing your trigger helps you prepare for tough moments."
      options={options}
      selected={selected}
      onSelect={setSelected}
      onContinue={handleContinue}
      skippable
      onSkip={handleSkip}
    />
  );
}
