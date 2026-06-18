import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PACKAGE_TYPE } from 'react-native-purchases';
import { AppColors } from '@/constants/theme';
import { useAppTheme } from '@/context/theme';
import { usePurchases } from '@/context/purchases';

const FEATURES = [
  { emoji: '🤖', title: 'AI Corner', desc: 'Personal AI support available 24/7 — built for gambling recovery, not generic wellness' },
  { emoji: '📊', title: 'Recovery Analytics', desc: 'See exactly how far you\'ve come — streaks, mood and money recovered in one place' },
  { emoji: '🚫', title: 'Ad-Free', desc: 'Zero ads, zero distractions — a clean space built entirely around your recovery' },
  { emoji: '👥', title: 'Someone in Your Corner', desc: 'Give someone close to you a window into your recovery — they\'ll cheer you on' },
  { emoji: '📧', title: 'Supporter Notifications', desc: 'Your supporter gets an email when you hit a milestone, feel an urge, or have a slip' },
  { emoji: '🎉', title: 'Progress Sharing', desc: 'Share a milestone card with friends or your community and celebrate out loud' },
];

export function Paywall() {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { paywallVisible, hidePaywall, offerings, purchasePackage, restorePurchases } = usePurchases();
  const [selectedIndex, setSelectedIndex] = useState(1); // default to annual
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const packages = offerings?.availablePackages ?? [];
  // Sort: monthly first, annual second
  const sorted = [...packages].sort((a, b) => {
    const order = (t: PACKAGE_TYPE) => t === PACKAGE_TYPE.ANNUAL ? 1 : 0;
    return order(a.packageType) - order(b.packageType);
  });

  const selectedPkg = sorted[selectedIndex] ?? sorted[0] ?? null;

  const handlePurchase = async () => {
    if (!selectedPkg) {
      Alert.alert(
        'Pricing unavailable',
        'Subscription plans could not be loaded. Please check your internet connection and try again.',
        [{ text: 'OK' }],
      );
      return;
    }
    setPurchasing(true);
    await purchasePackage(selectedPkg);
    setPurchasing(false);
  };

  const handleRestore = async () => {
    setRestoring(true);
    await restorePurchases();
    setRestoring(false);
  };

  const getPrice = (pkg: typeof sorted[0]) => pkg?.product?.priceString ?? '—';

  const getPeriod = (pkg: typeof sorted[0]) => {
    const type = pkg?.packageType;
    if (type === PACKAGE_TYPE.ANNUAL) return '/ year';
    if (type === PACKAGE_TYPE.MONTHLY) return '/ month';
    return '';
  };

  const getSavingsBadge = () => {
    if (sorted.length < 2) return null;
    const monthly = sorted.find(p => p.packageType === PACKAGE_TYPE.MONTHLY);
    const annual = sorted.find(p => p.packageType === PACKAGE_TYPE.ANNUAL);
    if (!monthly || !annual) return null;
    const monthlyPrice = monthly.product.price;
    const annualPrice = annual.product.price;
    if (!monthlyPrice || !annualPrice) return null;
    const savings = Math.round((1 - annualPrice / (monthlyPrice * 12)) * 100);
    return savings > 0 ? `Save ${savings}%` : null;
  };

  const savingsBadge = getSavingsBadge();

  return (
    <Modal
      visible={paywallVisible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={hidePaywall}
    >
      <View style={[s.root, { paddingBottom: insets.bottom }]}>
        {/* Header gradient */}
        <LinearGradient colors={[c.headerGradDeep, c.headerGradStart, c.headerGradEnd]} style={s.header}>
          <View style={[s.headerRow, { paddingTop: insets.top + 16 }]}>
            <View style={s.headerTextCol}>
              <Text style={s.headerTitle}>Go Premium</Text>
              <Text style={s.headerSub}>Unlock your full recovery toolkit</Text>
            </View>
            <Pressable onPress={hidePaywall} style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.6 }]} hitSlop={12}>
              <Text style={s.closeBtnTxt}>✕</Text>
            </Pressable>
          </View>
        </LinearGradient>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Plan selector — shown first so CTA is reachable without scrolling */}
          <Text style={s.planLabel}>Choose your plan</Text>
          <View style={s.planRow}>
            {sorted.length > 0 ? sorted.map((pkg, i) => {
              const isAnnual = pkg.packageType === PACKAGE_TYPE.ANNUAL;
              const isSelected = selectedIndex === i;
              return (
                <Pressable
                  key={pkg.identifier}
                  style={[s.planCard, isSelected && s.planCardSelected]}
                  onPress={() => setSelectedIndex(i)}
                >
                  {isAnnual && savingsBadge && (
                    <View style={s.savingsBadge}>
                      <Text style={s.savingsBadgeTxt}>{savingsBadge}</Text>
                    </View>
                  )}
                  <Text style={[s.planType, isSelected && s.planTypeSelected]}>
                    {isAnnual ? 'Annual' : 'Monthly'}
                  </Text>
                  <Text style={[s.planPrice, isSelected && s.planPriceSelected]}>
                    {getPrice(pkg)}
                  </Text>
                  <Text style={[s.planPeriod, isSelected && s.planPeriodSelected]}>
                    {getPeriod(pkg)}
                  </Text>
                  {isSelected && <View style={s.planSelectedDot} />}
                </Pressable>
              );
            }) : (
              // Fallback when offerings haven't loaded yet
              <>
                {[
                  { label: 'Monthly', price: '$4.99', period: '/ month', isAnnual: false },
                  { label: 'Annual', price: '$39.99', period: '/ year', isAnnual: true },
                ].map((p, i) => (
                  <Pressable
                    key={p.label}
                    style={[s.planCard, selectedIndex === i && s.planCardSelected]}
                    onPress={() => setSelectedIndex(i)}
                  >
                    {p.isAnnual && (
                      <View style={s.savingsBadge}>
                        <Text style={s.savingsBadgeTxt}>Save 33%</Text>
                      </View>
                    )}
                    <Text style={[s.planType, selectedIndex === i && s.planTypeSelected]}>{p.label}</Text>
                    <Text style={[s.planPrice, selectedIndex === i && s.planPriceSelected]}>{p.price}</Text>
                    <Text style={[s.planPeriod, selectedIndex === i && s.planPeriodSelected]}>{p.period}</Text>
                    {selectedIndex === i && <View style={s.planSelectedDot} />}
                  </Pressable>
                ))}
              </>
            )}
          </View>

          {/* CTA */}
          <Pressable
            style={({ pressed }) => [s.ctaBtn, pressed && { opacity: 0.88 }, purchasing && s.ctaBtnDisabled]}
            onPress={handlePurchase}
            disabled={purchasing}
          >
            <LinearGradient colors={['#0F6E6E', '#1a9a9a']} style={s.ctaGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              {purchasing
                ? <ActivityIndicator color={c.white} />
                : <Text style={s.ctaTxt}>Start Premium</Text>}
            </LinearGradient>
          </Pressable>

          <Text style={s.trialNote}>Cancel any time. No commitment.</Text>

          {/* Feature list */}
          <View style={s.featuresCard}>
            {FEATURES.map((f, i) => (
              <View key={f.title} style={[s.featureRow, i < FEATURES.length - 1 && s.featureRowBorder]}>
                <View style={s.featureIcon}>
                  <Text style={s.featureEmoji}>{f.emoji}</Text>
                </View>
                <View style={s.featureText}>
                  <Text style={s.featureTitle}>{f.title}</Text>
                  <Text style={s.featureDesc}>{f.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Restore */}
          <Pressable
            onPress={handleRestore}
            disabled={restoring}
            style={({ pressed }) => [s.restoreBtn, pressed && { opacity: 0.6 }]}
          >
            {restoring
              ? <ActivityIndicator size="small" color={c.primary} />
              : <Text style={s.restoreTxt}>Restore purchases</Text>}
          </Pressable>

          {/* Footer links */}
          <View style={s.footer}>
            <Pressable onPress={() => { hidePaywall(); router.push('/terms'); }}>
              <Text style={s.footerLink}>Terms of Use</Text>
            </Pressable>
            <Text style={s.footerDot}>·</Text>
            <Pressable onPress={() => { hidePaywall(); router.push('/privacy-policy'); }}>
              <Text style={s.footerLink}>Privacy Policy</Text>
            </Pressable>
          </View>

          <View style={{ height: 16 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeStyles = (c: AppColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bgElement },

  header: { paddingBottom: 16 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 4, gap: 12,
  },
  headerTextCol: { flex: 1 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: c.white, letterSpacing: -0.3 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 3 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  closeBtnTxt: { color: c.white, fontSize: 14, fontWeight: '700' },

  scroll: { flex: 1 },
  scrollContent: { padding: 20 },

  featuresCard: {
    backgroundColor: c.bgCard,
    borderRadius: 18,
    padding: 4,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 14 },
  featureRowBorder: { borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  featureIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: c.bgTeal,
    alignItems: 'center', justifyContent: 'center',
  },
  featureEmoji: { fontSize: 22 },
  featureText: { flex: 1 },
  featureTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary, marginBottom: 2 },
  featureDesc: { fontSize: 13, color: c.textMuted, lineHeight: 18 },

  planLabel: { fontSize: 13, fontWeight: '600', color: c.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  planRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  planCard: {
    flex: 1, borderRadius: 16, padding: 16,
    backgroundColor: c.bgCard,
    borderWidth: 2, borderColor: c.borderLight,
    alignItems: 'center', position: 'relative',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  planCardSelected: { borderColor: c.primary, backgroundColor: c.bgTealDeep },
  planType: { fontSize: 13, fontWeight: '600', color: c.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  planTypeSelected: { color: c.primary },
  planPrice: { fontSize: 24, fontWeight: '800', color: c.textPrimary },
  planPriceSelected: { color: c.primary },
  planPeriod: { fontSize: 12, color: c.textFaint, marginTop: 2 },
  planPeriodSelected: { color: c.primary },
  planSelectedDot: {
    position: 'absolute', top: 10, right: 10,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: c.primary,
  },
  savingsBadge: {
    position: 'absolute', top: -10,
    backgroundColor: '#e67e22',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2,
  },
  savingsBadgeTxt: { fontSize: 11, fontWeight: '700', color: c.white },

  ctaBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 10 },
  ctaBtnDisabled: { opacity: 0.5 },
  ctaGradient: { paddingVertical: 17, alignItems: 'center', justifyContent: 'center' },
  ctaTxt: { fontSize: 17, fontWeight: '800', color: c.white, letterSpacing: 0.2 },

  trialNote: { textAlign: 'center', fontSize: 12, color: c.textFaint, marginBottom: 20 },

  restoreBtn: { alignItems: 'center', paddingVertical: 12 },
  restoreTxt: { fontSize: 13, color: c.primary, fontWeight: '600' },

  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8 },
  footerLink: { fontSize: 11, color: c.textDisabled },
  footerDot: { fontSize: 11, color: c.textDisabled },
});
