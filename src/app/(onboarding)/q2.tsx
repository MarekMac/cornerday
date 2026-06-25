import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { QuestionScreen } from '@/components/onboarding/QuestionScreen';
import { useOnboarding } from '@/context/onboarding';

const OPTIONS = [
  { value: 'financial_pressure', label: 'Financial pressure', emoji: '💸' },
  { value: 'betting_ads', label: 'Betting ads', emoji: '📱' },
  { value: 'social_pressure', label: 'Friends or social pressure', emoji: '👥' },
  { value: 'live_sport', label: 'Watching live sport', emoji: '⚽' },
  { value: 'stress', label: 'Stress', emoji: '😰' },
  { value: 'boredom', label: 'Boredom', emoji: '😶' },
];

export default function Q2Screen() {
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

  return (
    <QuestionScreen
      step={2}
      total={3}
      title="What is your biggest trigger?"
      subtitle="Knowing your trigger helps you prepare for tough moments."
      options={OPTIONS}
      selected={selected}
      onSelect={setSelected}
      onContinue={handleContinue}
      skippable
      onSkip={handleSkip}
    />
  );
}
