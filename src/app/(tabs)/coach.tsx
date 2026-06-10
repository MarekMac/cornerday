import { ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePurchases } from '@/context/purchases';
import { useUser } from '@/context/user';

const FEATURES = [
  '💬 Chat any time, day or night',
  '🧠 Evidence-based coping strategies',
  '📈 Personalised to your recovery journey',
  '🔒 Completely private and confidential',
];

export default function CoachScreen() {
  const { isPremium, isLoadingPurchases, showPaywall } = usePurchases();
  const { isAdmin } = useUser();
  const hasAccess = isPremium || isAdmin;

  return (
    <View style={s.root}>
      <LinearGradient colors={['#0F6E6E', '#1a9a9a']} style={s.header}>
        <SafeAreaView edges={['top']}>
          <View style={s.headerContent}>
            <Text style={s.headerTitle}>AI Coach</Text>
            {hasAccess && <View style={s.premiumBadge}><Text style={s.premiumBadgeTxt}>{isAdmin ? '👑 Admin' : '✨ Premium'}</Text></View>}
          </View>
        </SafeAreaView>
      </LinearGradient>

      {isLoadingPurchases ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#0F6E6E" />
        </View>
      ) : hasAccess ? (
        <ScrollView contentContainerStyle={s.body}>
          <View style={s.comingSoonCard}>
            <Text style={s.comingSoonEmoji}>🤖</Text>
            <Text style={s.comingSoonTitle}>AI Coach coming soon</Text>
            <Text style={s.comingSoonDesc}>
              Your Premium is active. The AI Coach is being built and will be available in the next update.
            </Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={s.body}>
          <View style={s.lockCard}>
            <Text style={s.lockEmoji}>🤖</Text>
            <Text style={s.lockTitle}>Your personal recovery coach</Text>
            <Text style={s.lockDesc}>
              Get 24/7 support from an AI coach that understands gambling addiction.
              Available exclusively with Premium.
            </Text>

            <View style={s.featureList}>
              {FEATURES.map(f => (
                <View key={f} style={s.featureRow}>
                  <Text style={s.featureItem}>{f}</Text>
                </View>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [s.upgradeBtn, pressed && { opacity: 0.85 }]}
              onPress={showPaywall}
            >
              <Text style={s.upgradeBtnTxt}>Upgrade to Premium</Text>
            </Pressable>
            <Text style={s.price}>Cancel any time</Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#edf0f0' },

  header: { paddingBottom: 16 },
  headerContent: { paddingHorizontal: 20, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#fff' },
  premiumBadge: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  premiumBadgeTxt: { fontSize: 12, color: '#fff', fontWeight: '600' },

  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  lockCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    alignItems: 'center', gap: 14, width: '100%',
  },
  lockEmoji: { fontSize: 52 },
  lockTitle: { fontSize: 20, fontWeight: '700', color: '#111', textAlign: 'center' },
  lockDesc: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 21 },

  featureList: { gap: 10, alignSelf: 'stretch', marginVertical: 4 },
  featureRow: { flexDirection: 'row' },
  featureItem: { fontSize: 15, color: '#444' },

  upgradeBtn: {
    backgroundColor: '#0F6E6E', borderRadius: 14,
    paddingVertical: 14, alignSelf: 'stretch', alignItems: 'center',
    marginTop: 4,
  },
  upgradeBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
  price: { fontSize: 12, color: '#aaa' },

  comingSoonCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 32,
    alignItems: 'center', gap: 14, width: '100%',
  },
  comingSoonEmoji: { fontSize: 52 },
  comingSoonTitle: { fontSize: 20, fontWeight: '700', color: '#111', textAlign: 'center' },
  comingSoonDesc: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 22 },
});
