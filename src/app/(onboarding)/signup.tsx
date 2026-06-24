import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
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

import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';
import { useAppTheme } from '@/context/theme';
import { AppColors } from '@/constants/theme';
import { ONBOARDED_KEY } from '@/constants/storage-keys';

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


export default function SignupScreen() {
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isSignIn = mode === 'signin';

  const scrollRef = useRef<ScrollView>(null);
  const formYRef = useRef(0);
  const emailYRef = useRef(0);
  const passwordYRef = useRef(0);
  const activeFieldRef = useRef<'email' | 'password' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      if (!activeFieldRef.current || !scrollRef.current) return;
      const fieldY = activeFieldRef.current === 'email' ? emailYRef.current : passwordYRef.current;
      scrollRef.current.scrollTo({ y: 160, animated: true });
    });
    return () => sub.remove();
  }, []);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleResend = async () => {
    setResendLoading(true);
    try {
      await supabase.auth.resend({ type: 'signup', email: sentEmail, options: { emailRedirectTo: 'cornerday://confirm-email' } });
      setResendCooldown(60);
    } catch (_e) {
    } finally {
      setResendLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError('');
    try {
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
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

      if (result.type === 'success') {
        const url = result.url;
        const params = new URLSearchParams(url.split('#')[1] ?? url.split('?')[1] ?? '');
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (!accessToken || !refreshToken) {
          setError('Google sign-in failed. Please try again.');
          return;
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          setError('Could not complete sign-in. Please try again.');
          return;
        }

        const { data: { user: authUser }, error: getUserErr } = await supabase.auth.getUser();
        if (getUserErr || !authUser) {
          setError('Sign-in succeeded but could not verify your account. Please try again.');
          return;
        }
        const { data: profile, error: profileErr } = await supabase
          .from('users')
          .select('id')
          .eq('id', authUser.id)
          .maybeSingle();

        if (profileErr) {
          setError('Sign-in succeeded but we could not load your profile. Please try again.');
          return;
        }
        if (profile !== null) {
          await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
          router.replace('/(tabs)');
        } else {
          router.push('/(onboarding)/q1');
        }
      } else if (result.type !== 'cancel' && result.type !== 'dismiss') {
        setError('Google sign-in failed. Please try again.');
      }
    } catch (e) {
      setError('Google sign-in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async () => {
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      if (isSignIn) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (error.message.toLowerCase().includes('email not confirmed')) {
            setSentEmail(email);
            setEmailSent(true);
            return;
          }
          setError(error.message);
          return;
        }
        const { data: { user: authUser }, error: getUserErr } = await supabase.auth.getUser();
        if (getUserErr || !authUser) { setError('Sign-in succeeded but could not verify your account. Please try again.'); return; }
        const { data: profile, error: profileErr } = await supabase
          .from('users').select('id').eq('id', authUser.id).maybeSingle();
        if (profileErr) { setError('Sign-in succeeded but we could not load your profile. Please try again.'); return; }
        if (profile !== null) {
          await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
          router.replace('/(tabs)');
        } else {
          router.push('/(onboarding)/q1');
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: 'cornerday://confirm-email' },
        });
        if (error) {
          const alreadyExists =
            error.message.toLowerCase().includes('already registered') ||
            error.message.toLowerCase().includes('already exists') ||
            error.message.toLowerCase().includes('user already');
          if (alreadyExists) {
            // Account exists — sign them in and continue where they left off
            const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
            if (signInError) { setError('This email is already registered. Please sign in with your password.'); return; }
            const { data: { user: authUser }, error: getUserErr2 } = await supabase.auth.getUser();
            if (getUserErr2 || !authUser) { setError('Sign-in succeeded but could not verify your account. Please try again.'); return; }
            const { data: profile, error: profileErr } = await supabase
              .from('users').select('id').eq('id', authUser.id).maybeSingle();
            if (profileErr) { setError('Sign-in succeeded but we could not load your profile. Please try again.'); return; }
            if (profile !== null) {
              await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
              router.replace('/(tabs)');
            } else {
              router.push('/(onboarding)/q1');
            }
          } else {
            setError(error.message);
          }
          return;
        }
        // session is null when Supabase requires email confirmation
        if (!data.session) {
          setSentEmail(email);
          setEmailSent(true);
          return;
        }
        router.push('/(onboarding)/q1');
      }
    } finally {
      setLoading(false);
    }
  };

  if (emailSent) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emailSentWrap}>
          <Text style={styles.emailSentEmoji}>📧</Text>
          <Text style={styles.emailSentTitle}>Check your email</Text>
          <Text style={styles.emailSentBody}>
            We sent a confirmation link to{'\n'}
            <Text style={styles.emailSentAddress}>{sentEmail}</Text>
            {'\n\n'}Tap the link in the email to continue setting up your account.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.submitBtn, { marginTop: 32, alignSelf: 'stretch' }, pressed && styles.pressed, (resendCooldown > 0 || resendLoading) && { opacity: 0.5 }]}
            onPress={handleResend}
            disabled={resendCooldown > 0 || resendLoading}
            accessibilityLabel="Resend confirmation email"
            accessibilityRole="button">
            {resendLoading
              ? <ActivityIndicator color={c.white} />
              : <Text style={styles.submitBtnText}>{resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend email'}</Text>}
          </Pressable>
          <Pressable
            style={{ marginTop: 20, padding: 8 }}
            onPress={() => { setEmailSent(false); setError(''); }}
            accessibilityLabel="Go back to sign up"
            accessibilityRole="button">
            <Text style={styles.toggleText}>Wrong email? <Text style={styles.toggleLink}>Start over</Text></Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding">
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.scroll, { paddingTop: 75 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
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
              <ActivityIndicator color={c.textBody} />
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

          <View style={styles.form} onLayout={(e) => { formYRef.current = e.nativeEvent.layout.y; }}>
            <View onLayout={(e) => { emailYRef.current = e.nativeEvent.layout.y; }}>
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
                onFocus={() => { activeFieldRef.current = 'email'; }}
              />
            </View>

            <View onLayout={(e) => { passwordYRef.current = e.nativeEvent.layout.y; }}>
              <Text style={styles.fieldLabel}>Password</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  style={[styles.input, { paddingRight: 46 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder={isSignIn ? 'Your password' : 'At least 6 characters'}
                  placeholderTextColor={c.textFaint}
                  secureTextEntry={!showPassword}
                  autoComplete={isSignIn ? 'current-password' : 'new-password'}
                  onFocus={() => { activeFieldRef.current = 'password'; }}
                />
                <Pressable style={styles.eyeBtn} onPress={() => setShowPassword(p => !p)} hitSlop={8}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.textFaint} />
                </Pressable>
              </View>
            </View>

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
                <ActivityIndicator color={c.white} />
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
            {isSignIn ? 'By signing in you agree to our' : 'By creating an account you agree to our'}{' '}
            <Text style={styles.privacyLink} onPress={() => router.push('/privacy-policy')}>
              Privacy Policy
            </Text>
            {' '}and{' '}
            <Text style={styles.privacyLink} onPress={() => router.push('/terms')}>
              Terms of Use
            </Text>
            . Your data is private and never sold.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bgCard },
  flex: { flex: 1 },
  emailSentWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emailSentEmoji: { fontSize: 56, marginBottom: 20 },
  emailSentTitle: { fontSize: 26, fontWeight: '800', color: c.textPrimary, textAlign: 'center', marginBottom: 16 },
  emailSentBody: { fontSize: 15, color: c.textBody, textAlign: 'center', lineHeight: 24 },
  emailSentAddress: { fontWeight: '700', color: c.primary },
  scroll: {
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 320,
  },
  backBtn: {
    padding: 4,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  header: {
    marginBottom: 48,
    gap: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: c.textPrimary,
  },
  subtitle: {
    fontSize: 15,
    color: c.textBody,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: c.borderMid,
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: c.bgCard,
  },
  googleIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4285F4',
  },
  googleBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: c.textSecondary,
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
    color: c.white,
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
    backgroundColor: c.borderSubtle,
  },
  dividerText: {
    fontSize: 13,
    color: c.textFaint,
  },
  form: {
    gap: 4,
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: c.textBody,
    marginTop: 16,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: c.borderMid,
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontSize: 15,
    color: c.textPrimary,
    backgroundColor: c.bgInput,
  },
  inputWrap: { position: 'relative' },
  eyeBtn: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  forgotBtn: { alignSelf: 'flex-end', marginTop: 8 },
  forgotText: { fontSize: 13, color: c.primary, fontWeight: '500' },
  errorText: {
    marginTop: 10,
    color: c.error,
    fontSize: 13,
  },
  submitBtn: {
    marginTop: 24,
    backgroundColor: c.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnText: {
    color: c.white,
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
    color: c.textBody,
  },
  toggleLink: {
    color: c.primary,
    fontWeight: '600',
  },
  privacy: {
    fontSize: 12,
    color: c.textFaint,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 18,
  },
  privacyLink: {
    color: c.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
