import { StyleSheet, Text, View } from 'react-native';

interface Props {
  current: number;
  total: number;
}

export function ProgressBar({ current, total }: Props) {
  const progress = current / total;

  return (
    <View style={styles.container}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.label}>{current} of {total}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  track: {
    flex: 1,
    height: 4,
    backgroundColor: '#d0e8e8',
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: '#0F6E6E',
    borderRadius: 2,
  },
  label: {
    fontSize: 12,
    color: '#888',
    minWidth: 36,
    textAlign: 'right',
  },
});
