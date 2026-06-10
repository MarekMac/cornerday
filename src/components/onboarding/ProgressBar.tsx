import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppColors } from '@/constants/theme';
import { useAppTheme } from '@/context/theme';

interface Props {
  current: number;
  total: number;
}

export function ProgressBar({ current, total }: Props) {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const progress = current / total;

  return (
    <View style={s.container}>
      <View style={s.track}>
        <View style={[s.fill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={s.label}>{current} of {total}</Text>
    </View>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  track: {
    flex: 1,
    height: 4,
    backgroundColor: c.bgTealMid,
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: c.primary,
    borderRadius: 2,
  },
  label: {
    fontSize: 12,
    color: c.textMuted,
    minWidth: 36,
    textAlign: 'right',
  },
});
