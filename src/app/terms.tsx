import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '@/context/theme';
import { AppColors } from '@/constants/theme';

const LAST_UPDATED = 'June 19, 2026';

const SECTIONS = [
  {
    title: '1. Acceptance of terms',
    body: 'By downloading or using CornerDay, you agree to be bound by these Terms of Use. If you do not agree, please do not use the app. These terms apply to all users, whether on the free or premium tier.',
  },
  {
    title: '2. Description of service',
    body: 'CornerDay is a mobile application designed to support individuals recovering from gambling addiction. The app provides tools including:\n\n• Streak and recovery tracking\n• Loss and payment tracking\n• Urge support and breathing exercises\n• Daily mood check-ins\n• Urge journal\n• Milestone badges and progress tracking\n• Push notifications and reminders\n• Someone in your corner (accountability partner feature)\n• AI Coach powered by Claude (premium users only)\n\nCornerDay is a self-help support tool and is not a substitute for professional medical, psychological, or financial advice.',
  },
  {
    title: '3. Eligibility',
    body: 'You must be at least 18 years old to use CornerDay. By using the app, you confirm that you meet this requirement. If we discover that a user is under 18, we reserve the right to terminate their account.',
  },
  {
    title: '4. Account responsibility',
    body: 'You are responsible for maintaining the confidentiality of your account credentials. You agree not to share your account with others or use another person\'s account.\n\nYou may sign in with an email and password or via Google Sign-In. CornerDay is not liable for any loss or damage arising from unauthorised use of your account.',
  },
  {
    title: '5. Subscriptions and payments',
    body: 'CornerDay offers a free tier and a premium subscription (approximately $4.99–$7.99 per month, subject to change). Premium subscriptions are billed monthly or annually through the Google Play Store or Apple App Store and managed via RevenueCat.\n\nSubscriptions automatically renew unless cancelled at least 24 hours before the end of the current billing period. You can manage or cancel your subscription in your device\'s app store account settings.\n\nAll purchases are subject to the payment terms of your app store provider. CornerDay does not process payments directly.',
  },
  {
    title: '6. Free tier and advertising',
    body: 'Free tier users may see non-personalised advertisements served by Google AdMob. Ads are never shown on the urge support screen, relapse screen, crisis resources, or journal — only in non-sensitive areas of the app.\n\nPremium users have an ad-free experience.',
  },
  {
    title: '7. AI Coach',
    body: 'Premium subscribers have access to an AI Coach powered by Anthropic\'s Claude AI. Conversations with the AI Coach are processed by Anthropic\'s API and are subject to Anthropic\'s usage policies.\n\nThe AI Coach provides supportive, motivational responses and is not a licensed therapist, counsellor, or medical professional. Do not rely on it for clinical advice or in a crisis — use the crisis resources provided in the app instead.',
  },
  {
    title: '8. Push notifications',
    body: 'With your permission, CornerDay may send you push notifications for milestone achievements, daily check-in reminders, and motivational messages. You can manage notification preferences at any time in the app\'s Settings or your device\'s notification settings.',
  },
  {
    title: '9. Acceptable use',
    body: 'You agree not to:\n\n• Use CornerDay for any unlawful purpose\n• Attempt to reverse-engineer, decompile, or modify the app\n• Submit false or misleading information\n• Attempt to access another user\'s data\n• Use the app in a way that could damage, disable, or impair its operation\n\nWe reserve the right to suspend or terminate accounts that violate these terms.',
  },
  {
    title: '10. Medical disclaimer',
    body: 'CornerDay is not a medical or mental health service. The app provides self-help tools and supportive content only. If you are experiencing a mental health crisis, please contact a qualified professional or crisis helpline immediately.\n\nNational Problem Gambling Helpline: 1-800-522-4700 (USA, 24/7, free).',
  },
  {
    title: '11. Intellectual property',
    body: 'All content within CornerDay — including text, design, graphics, and code — is the property of CornerDay or its licensors. You may not reproduce, distribute, or create derivative works without our express written permission.',
  },
  {
    title: '12. Limitation of liability',
    body: 'CornerDay is provided on an "as is" basis without warranties of any kind. To the fullest extent permitted by law, we are not liable for any indirect, incidental, or consequential damages arising from your use of the app, including but not limited to reliance on AI-generated content.',
  },
  {
    title: '13. Governing law',
    body: 'These Terms of Use are governed by and construed in accordance with applicable law. Any disputes shall be resolved in the courts of the jurisdiction in which CornerDay operates.',
  },
  {
    title: '14. Changes to these terms',
    body: 'We may update these Terms of Use from time to time. We will notify you of significant changes via the app. Continued use of CornerDay after changes constitutes acceptance of the updated terms.',
  },
  {
    title: '15. Contact',
    body: 'If you have questions about these Terms of Use, please contact us at:\n\nsupport@cornerday.app',
  },
];

export default function TermsScreen() {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={() => router.replace('/(tabs)/account' as any)} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={c.primary} />
        </Pressable>
        <Text style={s.title}>Terms of Use</Text>
        <Text style={s.updated}>Last updated: {LAST_UPDATED}</Text>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.intro}>
          Please read these Terms of Use carefully before using CornerDay. They govern your access to and use of the app and its services.
        </Text>

        {SECTIONS.map(section => (
          <View key={section.title} style={s.section}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            <Text style={s.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bgCard },
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  backBtn: { padding: 4, marginBottom: 8, alignSelf: 'flex-start' },
  title: { fontSize: 24, fontWeight: '700', color: c.textPrimary },
  updated: { fontSize: 12, color: c.textFaint, marginTop: 4 },
  content: { paddingHorizontal: 24, paddingTop: 20 },
  intro: { fontSize: 14, color: c.textBody, lineHeight: 22, marginBottom: 24 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary, marginBottom: 8 },
  sectionBody: { fontSize: 14, color: c.textBody, lineHeight: 22 },
});
