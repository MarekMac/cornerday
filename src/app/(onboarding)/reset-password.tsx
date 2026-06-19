import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppColors } from '@/constants/theme';
import { useAppTheme } from '@/context/theme';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordScreen() {
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleReset = async () => {
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) { setError(updateError.message); return; }
      setDone(true);
      setTimeout(() => router.replace('/(tabs)/'), 2500);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.doneIcon}>✅</Text>
          <Text style={styles.title}>Password updated</Text>
          <Text style={styles.subtitle}>Taking you back to the app…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.container}>
          <Pressable style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(onboarding)/signup?mode=signin' as any)}>
            <Ionicons name="chevron-back" size={24} color={c.primary} />
          </Pressable>

          <Text style={styles.title}>Set a new password</Text>
          <Text style={styles.subtitle}>Choose something strong that you haven't used before.</Text>

          <Text style={styles.label}>New password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            placeholderTextColor={c.textFaint}
            secureTextEntry
            autoComplete="new-password"
          />

          <Text style={styles.label}>Confirm password</Text>
          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Repeat your new password"
            placeholderTextColor={c.textFaint}
            secureTextEntry
            autoComplete="new-password"
          />

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable
            style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
            onPress={handleReset}
            disabled={loading}>
            {loading ? <ActivityIndicator color={c.white} /> : <Text style={styles.btnText}>Update password</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bgCard },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 28 },
  container: { flex: 1, paddingHorizontal: 28, paddingTop: 8 },
  backBtn: { padding: 4, marginBottom: 20, alignSelf: 'flex-start' },
  title: { fontSize: 26, fontWeight: '700', color: c.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 15, color: c.textBody, marginBottom: 28, lineHeight: 22 },
  label: { fontSize: 13, fontWeight: '600', color: c.textBody, marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: c.borderMid,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontSize: 15,
    color: c.textPrimary,
    backgroundColor: c.bgInput,
    marginBottom: 16,
  },
  errorText: { color: c.error, fontSize: 13, marginBottom: 12 },
  btn: {
    backgroundColor: c.primary,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: { color: c.white, fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.8 },
  doneIcon: { fontSize: 56, marginBottom: 8 },
});
