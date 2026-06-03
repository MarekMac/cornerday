import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const LAST_UPDATED = 'June 3, 2025';

const SECTIONS = [
  {
    title: '1. Who we are',
    body: 'CornerDay is a mobile application designed to support individuals recovering from gambling addiction. We are committed to protecting your privacy and handling your data with care and respect.',
  },
  {
    title: '2. What data we collect',
    body: 'We collect the following information when you use CornerDay:\n\n• Account data: email address and display name\n• Recovery data: your quit date, motivations, triggers, and goals set during onboarding\n• Tracking data: streak history, loss and payment amounts, mood check-ins, and urge journal entries\n• Usage data: app activity to improve the experience\n\nWe do not collect sensitive financial data such as bank details or payment card information.',
  },
  {
    title: '3. How we use your data',
    body: 'Your data is used solely to:\n\n• Provide and personalise the CornerDay experience\n• Track your recovery progress and display your streak\n• Deliver encouraging content and milestone recognition\n• Improve the app based on aggregated, anonymised usage patterns\n\nWe do not sell your personal data to any third party.',
  },
  {
    title: '4. Who we share data with',
    body: 'We use the following third-party services to operate CornerDay:\n\n• Supabase — secure database and authentication (data stored in EU region)\n• RevenueCat — subscription management (premium users only)\n• Google AdMob — non-personalised ads for free tier users (never shown on crisis or urge screens)\n\nThese providers are bound by their own privacy policies and are not permitted to use your data for their own purposes.',
  },
  {
    title: '5. Data security',
    body: 'Your data is encrypted in transit and at rest. Access is restricted by row-level security policies — only you can read your own recovery data. We use industry-standard authentication and do not store passwords in plain text.',
  },
  {
    title: '6. Data retention',
    body: 'We retain your data for as long as your account is active. If you delete your account, all personal data is permanently removed within 30 days. Anonymised, aggregated usage statistics may be retained indefinitely.',
  },
  {
    title: '7. Your rights',
    body: 'You have the right to:\n\n• Access the data we hold about you\n• Request correction of inaccurate data\n• Request deletion of your account and all associated data\n• Withdraw consent at any time\n\nTo exercise any of these rights, contact us at the email below.',
  },
  {
    title: '8. Children',
    body: 'CornerDay is not intended for users under the age of 18. We do not knowingly collect data from minors. If you believe a minor has created an account, please contact us immediately.',
  },
  {
    title: '9. Changes to this policy',
    body: 'We may update this Privacy Policy from time to time. We will notify you of significant changes via the app. Continued use of CornerDay after changes constitutes acceptance of the updated policy.',
  },
  {
    title: '10. Contact',
    body: 'If you have any questions about this Privacy Policy or how we handle your data, please contact us at:\n\nprivacy@cornerday.app',
  },
];

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>← Back</Text>
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

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  backBtn: { paddingBottom: 12, alignSelf: 'flex-start' },
  backText: { fontSize: 15, color: '#0F6E6E', fontWeight: '500' },
  title: { fontSize: 24, fontWeight: '700', color: '#111' },
  updated: { fontSize: 12, color: '#aaa', marginTop: 4 },
  content: { paddingHorizontal: 24, paddingTop: 20 },
  intro: { fontSize: 14, color: '#555', lineHeight: 22, marginBottom: 24 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 8 },
  sectionBody: { fontSize: 14, color: '#555', lineHeight: 22 },
});
