import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/context/theme';

export default function ConfirmEmailScreen() {
  const { colors: c } = useAppTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: c.bgApp }]}>
      <ActivityIndicator size="large" color={c.primary} />
      <Text style={[styles.text, { color: c.textBody }]}>Confirming your email…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  text: { fontSize: 15 },
});
