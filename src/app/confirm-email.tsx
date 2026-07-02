import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppTheme } from '@/context/theme';

const TIMEOUT_MS = 7000;

export default function ConfirmEmailScreen() {
  const { colors: c } = useAppTheme();
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={[s.wrap, { backgroundColor: c.bgScreen }]}>
      {timedOut ? (
        <>
          <Text style={[s.emoji]}>⚠️</Text>
          <Text style={[s.title, { color: c.textPrimary }]}>Confirmation failed</Text>
          <Text style={[s.body, { color: c.textBody }]}>
            The link may have expired or already been used. Try signing in or request a new confirmation email.
          </Text>
          <Pressable
            style={[s.btn, { backgroundColor: c.primary }]}
            onPress={() => router.replace('/(onboarding)/signup?mode=signin' as any)}
            accessibilityRole="button"
          >
            <Text style={s.btnTxt}>Go to sign in</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={c.primary} />
          <Text style={[s.text, { color: c.textBody }]}>Confirming your email…</Text>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  text:  { fontSize: 15 },
  emoji: { fontSize: 48 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  body:  { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  btn:   { marginTop: 8, borderRadius: 24, paddingHorizontal: 32, paddingVertical: 14 },
  btnTxt:{ fontSize: 16, fontWeight: '700', color: '#fff' },
});
