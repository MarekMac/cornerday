import { useRouter } from 'expo-router';
import { useState } from 'react';

import { QuestionScreen } from '@/components/onboarding/QuestionScreen';
import { useOnboarding } from '@/context/onboarding';

const OPTIONS = [
  { value: 'private', label: 'Keep this private for now', emoji: '🔒' },
  { value: 'partner', label: 'My partner', emoji: '💑' },
  { value: 'family', label: 'A family member', emoji: '👨‍👩‍👧' },
  { value: 'friend', label: 'A friend', emoji: '👋' },
  { value: 'therapist', label: 'A therapist', emoji: '🏥' },
];

export default function Q5Screen() {
  const router = useRouter();
  const { data, setField } = useOnboarding();
  const [selected, setSelected] = useState(data.supportType ?? '');

  const handleContinue = () => {
    setField('supportType', selected);
    router.push('/(onboarding)/ready');
  };

  const handleSkip = () => {
    setField('supportType', '');
    router.push('/(onboarding)/ready');
  };

  return (
    <QuestionScreen
      step={5}
      total={5}
      title="Do you have someone in your corner?"
      subtitle="You don't have to do this alone."
      options={OPTIONS}
      selected={selected}
      onSelect={setSelected}
      onContinue={handleContinue}
      skippable
      onSkip={handleSkip}
    />
  );
}
