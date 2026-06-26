import { ReactNode, useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { AppColors } from '@/constants/theme';
import { useAppTheme } from '@/context/theme';

interface Props {
  emoji: string | ReactNode;
  label: string;
  selected: boolean;
  onPress: () => void;
  compact?: boolean;
}

export function OptionCard({ emoji, label, selected, onPress, compact }: Props) {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.card,
        compact && s.cardCompact,
        selected && s.selected,
        pressed && s.pressed,
      ]}>
      {typeof emoji === 'string' ? <Text style={s.emoji}>{emoji}</Text> : emoji}
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
  cardCompact: {
    paddingVertical: 14,
    marginBottom: 0,
    backgroundColor: 'transparent',
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
