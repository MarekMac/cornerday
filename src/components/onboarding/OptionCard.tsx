import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  emoji: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function OptionCard({ emoji, label, selected, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#d0e8e8',
    backgroundColor: '#f8fdfd',
    marginBottom: 10,
  },
  selected: {
    borderColor: '#0F6E6E',
    backgroundColor: '#e6f7f7',
  },
  pressed: {
    opacity: 0.8,
  },
  emoji: {
    fontSize: 22,
  },
  label: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  labelSelected: {
    color: '#0F6E6E',
    fontWeight: '600',
  },
});
