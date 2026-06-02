import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

function GoogleLogo() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </Svg>
  );
}

function FacebookLogo() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path fill="#1877F2" d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
    </Svg>
  );
}

export default function SignupScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isSignIn = mode === 'signin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [facebookLoading, setFacebookLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError('');

    const redirectTo = makeRedirectUri({ scheme: 'cornerday' });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error || !data.url) {
      setError('Google sign-in failed. Please try again.');
      setGoogleLoading(false);
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type === 'success') {
      const url = result.url;
      const params = new URLSearchParams(url.split('#')[1] ?? url.split('?')[1] ?? '');
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken ?? '',
        });

        if (sessionError) {
          setError('Could not complete sign-in. Please try again.');
          setGoogleLoading(false);
          return;
        }

        const { data: profile } = await supabase
          .from('users')
          .select('motivation')
          .single();

        if (profile?.motivation) {
          router.replace('/(tabs)');
        } else {
          router.push('/(onboarding)/q1');
        }
      }
    }

    setGoogleLoading(false);
  };

  const handleFacebookSignIn = async () => {
    setFacebookLoading(true);
    setError('');

    const redirectTo = makeRedirectUri({ scheme: 'cornerday' });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: { redirectTo, skipBrowserRedirect: true },
    });

    if (error || !data.url) {
      setError('Facebook sign-in failed. Please try again.');
      setFacebookLoading(false);
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type === 'success') {
      const params = new URLSearchParams(
        result.url.split('#')[1] ?? result.url.split('?')[1] ?? ''
      );
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken ?? '',
        });

        if (!sessionError) {
          const { data: profile } = await supabase
            .from('users')
            .select('motivation')
            .single();
          if (profile?.motivation) {
            router.replace('/(tabs)');
          } else {
            router.push('/(onboarding)/q1');
          }
        }
      }
    }

    setFacebookLoading(false);
  };

  const handleSubmit = async () => {
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);

    if (isSignIn) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from('users')
        .select('motivation')
        .single();
      if (profile?.motivation) {
        router.replace('/(tabs)');
      } else {
        router.push('/(onboarding)/q1');
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      router.push('/(onboarding)/q1');
    }

    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.title}>
              {isSignIn ? 'Welcome back' : 'Create your account'}
            </Text>
            <Text style={styles.subtitle}>
              {isSignIn
                ? 'Sign in to continue your journey'
                : 'Your progress is private and secure'}
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [styles.googleBtn, pressed && styles.pressed]}
            onPress={handleGoogleSignIn}
            disabled={googleLoading}>
            {googleLoading ? (
              <ActivityIndicator color="#444" />
            ) : (
              <>
                <GoogleLogo />
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </>
            )}
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.form}>
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

            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder={isSignIn ? 'Your password' : 'At least 6 characters'}
              placeholderTextColor="#aaa"
              secureTextEntry
              autoComplete={isSignIn ? 'current-password' : 'new-password'}
            />

            {isSignIn && (
              <Pressable
                style={styles.forgotBtn}
                onPress={() => router.push('/(onboarding)/forgot-password')}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>
            )}

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <Pressable
              style={({ pressed }) => [styles.submitBtn, pressed && styles.pressed]}
              onPress={handleSubmit}
              disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>
                  {isSignIn ? 'Sign in' : 'Continue'}
                </Text>
              )}
            </Pressable>
          </View>

          <Pressable
            style={styles.toggleBtn}
            onPress={() =>
              router.replace({
                pathname: '/(onboarding)/signup',
                params: { mode: isSignIn ? undefined : 'signin' },
              })
            }>
            <Text style={styles.toggleText}>
              {isSignIn ? "Don't have an account? " : 'Already have an account? '}
              <Text style={styles.toggleLink}>
                {isSignIn ? 'Sign up' : 'Sign in'}
              </Text>
            </Text>
          </Pressable>

          <Text style={styles.privacy}>
            Your data is private. We never share your information.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 24,
  },
  backBtn: {
    paddingTop: 4,
    paddingBottom: 20,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 15,
    color: '#0F6E6E',
    fontWeight: '500',
  },
  header: {
    marginBottom: 48,
    gap: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  googleIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4285F4',
  },
  googleBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  facebookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: '#1877F2',
    marginTop: 10,
  },
  facebookBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#eee',
  },
  dividerText: {
    fontSize: 13,
    color: '#aaa',
  },
  form: {
    gap: 4,
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444',
    marginTop: 16,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#fafafa',
  },
  forgotBtn: { alignSelf: 'flex-end', marginTop: 8 },
  forgotText: { fontSize: 13, color: '#0F6E6E', fontWeight: '500' },
  errorText: {
    marginTop: 10,
    color: '#c0392b',
    fontSize: 13,
  },
  submitBtn: {
    marginTop: 24,
    backgroundColor: '#0F6E6E',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: { opacity: 0.8 },
  toggleBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  toggleText: {
    fontSize: 14,
    color: '#666',
  },
  toggleLink: {
    color: '#0F6E6E',
    fontWeight: '600',
  },
  privacy: {
    fontSize: 12,
    color: '#aaa',
    textAlign: 'center',
    marginTop: 8,
  },
});
