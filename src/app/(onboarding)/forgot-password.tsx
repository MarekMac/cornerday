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
import { useAppTheme } from '@/context/theme';
import { AppColors } from '@/constants/theme';

import { supabase } from '@/lib/supabase';

export default function ForgotPasswordScreen() {
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    setError('');
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: 'cornerday://reset-password',
      });
      if (error) {
        setError(error.message);
      } else {
        setSent(true);
      }
    } catch {
      setError('Something went wrong. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.container}>
          <Pressable style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(onboarding)/signup')}>
            <Ionicons name="chevron-back" size={24} color={c.primary} />
          </Pressable>

          {sent ? (
            <View style={styles.sentBox}>
              <Text style={styles.sentIcon}>📧</Text>
              <Text style={styles.title}>Check your email</Text>
              <Text style={styles.subtitle}>
                We sent a password reset link to{'\n'}
                <Text style={styles.emailBold}>{email}</Text>
              </Text>
              <Pressable
                style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
                onPress={() => router.replace({ pathname: '/(onboarding)/signup', params: { mode: 'signin' } })}>
                <Text style={styles.btnText}>Back to sign in</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.title}>Reset your password</Text>
              <Text style={styles.subtitle}>
                Enter your email and we'll send you a reset link.
              </Text>

              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={c.textFaint}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />

              {!!error && <Text style={styles.errorText}>{error}</Text>}

              <Pressable
                style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
                onPress={handleSend}
                disabled={loading}>
                {loading ? (
                  <ActivityIndicator color={c.white} />
                ) : (
                  <Text style={styles.btnText}>Send reset link</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bgCard },
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 28, paddingTop: 8 },
  backBtn: { padding: 4, marginBottom: 20, alignSelf: 'flex-start' },
  title: { fontSize: 26, fontWeight: '700', color: c.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 15, color: c.textBody, marginBottom: 28, lineHeight: 22 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: c.textBody, marginBottom: 6 },
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
  sentBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  sentIcon: { fontSize: 56, marginBottom: 8 },
  emailBold: { fontWeight: '700', color: c.textPrimary },
});
