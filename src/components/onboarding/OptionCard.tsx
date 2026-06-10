import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { AppColors } from '@/constants/theme';
import { useAppTheme } from '@/context/theme';

interface Props {
  emoji: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function OptionCard({ emoji, label, selected, onPress }: Props) {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.card,
        selected && s.selected,
        pressed && s.pressed,
      ]}>
      <Text style={s.emoji}>{emoji}</Text>
      <Text style={[s.label, selected && s.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: c.bgTealMid,
    backgroundColor: c.bgElement,
    marginBottom: 10,
  },
  selected: {
    borderColor: c.primary,
    backgroundColor: c.bgTeal,
  },
  pressed: {
    opacity: 0.8,
  },
  emoji: {
    fontSize: 22,
  },
  label: {
    fontSize: 15,
    color: c.textSecondary,
    fontWeight: '500',
    flex: 1,
  },
  labelSelected: {
    color: c.primary,
    fontWeight: '600',
  },
});
