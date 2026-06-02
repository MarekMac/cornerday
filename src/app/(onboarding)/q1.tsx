import { useRouter } from 'expo-router';
import { useState } from 'react';

import { QuestionScreen } from '@/components/onboarding/QuestionScreen';
import { useOnboarding } from '@/context/onboarding';

const OPTIONS = [
  { value: 'family', label: 'My family', emoji: '👨‍👩‍👧' },
  { value: 'finances', label: 'My finances', emoji: '💰' },
  { value: 'mental_health', label: 'My mental health', emoji: '🧠' },
  { value: 'saving', label: 'Saving for something', emoji: '🎯' },
  { value: 'better_self', label: 'Becoming a better me', emoji: '✨' },
];

export default function Q1Screen() {
  const router = useRouter();
  const { data, setField } = useOnboarding();
  const [selected, setSelected] = useState(data.motivation ?? '');

  const handleContinue = () => {
    setField('motivation', selected);
    router.push('/(onboarding)/q2');
  };

  return (
    <QuestionScreen
      step={1}
      total={5}
      title="What motivates you to quit?"
      subtitle="This will be your anchor throughout the app."
      options={OPTIONS}
      selected={selected}
      onSelect={setSelected}
      onContinue={handleContinue}
    />
  );
}
