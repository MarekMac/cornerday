import { useRouter } from 'expo-router';
import { useState } from 'react';
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

import { supabase } from '@/lib/supabase';

export default function ForgotPasswordScreen() {
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

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.container}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
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
                placeholderTextColor="#aaa"
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
                  <ActivityIndicator color="#fff" />
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 28, paddingTop: 8 },
  backBtn: { paddingTop: 4, paddingBottom: 24, alignSelf: 'flex-start' },
  backText: { fontSize: 15, color: '#0F6E6E', fontWeight: '500' },
  title: { fontSize: 26, fontWeight: '700', color: '#111', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 28, lineHeight: 22 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 6 },
  input: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#fafafa',
    marginBottom: 16,
  },
  errorText: { color: '#c0392b', fontSize: 13, marginBottom: 12 },
  btn: {
    backgroundColor: '#0F6E6E',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.8 },
  sentBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  sentIcon: { fontSize: 56, marginBottom: 8 },
  emailBold: { fontWeight: '700', color: '#111' },
});
