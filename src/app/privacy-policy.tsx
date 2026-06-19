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
    title: '1. Who we are',
    body: 'CornerDay is a mobile application designed to support individuals recovering from gambling addiction. We are committed to protecting your privacy and handling your data with care and respect.\n\nThis policy explains what data we collect, why we collect it, and how we protect it.',
  },
  {
    title: '2. What data we collect',
    body: 'We collect the following information when you use CornerDay:\n\n• Account data: email address, display name, and profile photo (optional)\n• Recovery data: quit date, motivations, triggers, goals, and support type set during onboarding\n• Tracking data: streak history, loss and payment amounts, categories, mood check-ins, urge journal entries, and milestone badges\n• Goals and progress: financial targets, debt repayment plans, and recovery distractions or mantras\n• Accountability partner data: partner link tokens and share preferences (if you use the "someone in your corner" feature)\n• Trusted contact details: name and phone number stored locally on your device and optionally synced to your account\n• Push notification token: used to deliver milestone and reminder notifications (with your permission)\n• Usage data: anonymised app activity used to improve the experience\n\nWe do not collect sensitive financial data such as bank details or payment card numbers.',
  },
  {
    title: '3. How we use your data',
    body: 'Your data is used solely to:\n\n• Provide and personalise the CornerDay experience\n• Track your recovery progress and display your streak and milestones\n• Send push notifications for milestones, reminders, and check-ins (with your permission)\n• Deliver AI Coach responses to premium subscribers via Anthropic\'s Claude API\n• Send transactional emails (password reset, account notifications) via Resend\n• Display non-personalised ads to free tier users via Google AdMob\n• Improve the app based on aggregated, anonymised usage patterns\n\nWe do not sell your personal data to any third party.',
  },
  {
    title: '4. Who we share data with',
    body: 'We use the following third-party services to operate CornerDay:\n\n• Supabase — secure database, authentication, and file storage\n• RevenueCat — subscription and purchase management (premium users only)\n• Google AdMob — non-personalised ads for free tier users (never shown on urge, relapse, or crisis screens)\n• Anthropic — AI responses for the AI Coach feature (premium users only; conversation content is processed by Anthropic\'s API)\n• Resend — transactional email delivery (password reset and account emails)\n• Expo / Google Firebase — push notification delivery\n• Google Sign-In — optional authentication method\n\nThese providers are bound by their own privacy policies and data processing agreements. They are not permitted to use your data for their own marketing or advertising purposes.',
  },
  {
    title: '5. AI Coach and Anthropic',
    body: 'If you use the AI Coach (premium feature), your messages are sent to Anthropic\'s Claude API to generate responses. Anthropic processes this data in accordance with their privacy policy and API usage policies.\n\nWe do not permanently store AI Coach conversation history on our servers beyond the active session. Do not share sensitive personal or financial information you would not want processed by a third-party AI service.',
  },
  {
    title: '6. Push notifications',
    body: 'If you grant notification permission, we store your device push token to deliver milestone alerts, check-in reminders, and motivational messages. You can withdraw permission at any time in your device settings or in the app\'s notification preferences.',
  },
  {
    title: '7. Biometric lock',
    body: 'If you enable biometric lock, CornerDay uses your device\'s built-in biometric hardware (fingerprint or face recognition) to unlock the app. We do not access, store, or transmit your biometric data — authentication is handled entirely by your device\'s operating system.',
  },
  {
    title: '8. Data security',
    body: 'Your data is encrypted in transit (TLS) and at rest. Access is restricted by row-level security policies — only you can read your own recovery data. We use industry-standard authentication and passwords are never stored in plain text.',
  },
  {
    title: '9. Data retention',
    body: 'We retain your data for as long as your account is active. If you delete your account (available in Account settings), all personal data is permanently removed within 30 days. Anonymised, aggregated usage statistics may be retained indefinitely.',
  },
  {
    title: '10. Your rights',
    body: 'You have the right to:\n\n• Access the personal data we hold about you\n• Request correction of inaccurate data\n• Request deletion of your account and all associated data (via Account → Delete account in the app)\n• Export a copy of your data (via Account → Export data)\n• Withdraw consent for push notifications at any time\n\nTo exercise any other rights, contact us at the email below.',
  },
  {
    title: '11. Children',
    body: 'CornerDay is not intended for users under the age of 18. We do not knowingly collect data from minors. If you believe a minor has created an account, please contact us immediately and we will delete the account.',
  },
  {
    title: '12. Changes to this policy',
    body: 'We may update this Privacy Policy from time to time. We will notify you of significant changes via the app. Continued use of CornerDay after changes constitutes acceptance of the updated policy.',
  },
  {
    title: '13. Contact',
    body: 'If you have any questions about this Privacy Policy or how we handle your data, please contact us at:\n\nprivacy@cornerday.app',
  },
];

export default function PrivacyPolicyScreen() {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={() => router.replace('/(tabs)/account' as any)} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={c.primary} />
        </Pressable>
        <Text style={s.title}>Privacy Policy</Text>
        <Text style={s.updated}>Last updated: {LAST_UPDATED}</Text>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.intro}>
          At CornerDay, your privacy matters deeply. This policy explains what data we collect, why we collect it, and how we protect it.
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
