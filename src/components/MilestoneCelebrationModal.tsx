import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue,
  withDelay, withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import { useAppTheme } from '@/context/theme';
import { CONFETTI_EMOJIS } from '@/constants/badgeConstants';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

function ConfettiParticle({ index }: { index: number }) {
  const y = useSharedValue(-(30 + (index * 47) % 180));
  const rotation = useSharedValue(0);
  const startX = (index * 71 + 15) % (SCREEN_W - 30);
  const delay = (index * 110) % 900;
  const duration = 2000 + (index * 173) % 1200;

  useEffect(() => {
    y.value = withDelay(delay, withRepeat(withTiming(SCREEN_H + 30, { duration }), -1, false));
    rotation.value = withRepeat(withTiming(360, { duration: 900 + (index * 97) % 700 }), -1, false);
  }, [delay, duration, index]); // eslint-disable-line react-hooks/exhaustive-deps

  const style = useAnimatedStyle(() => {
    'worklet';
    const drift = Math.sin(y.value * 0.028) * 22;
    return { transform: [{ translateY: y.value }, { translateX: drift }, { rotate: `${rotation.value}deg` }] };
  });

  return (
    <Animated.Text style={[{ position: 'absolute', fontSize: 14, left: startX, top: 0, opacity: 0.55 }, style]}>
      {CONFETTI_EMOJIS[index % CONFETTI_EMOJIS.length]}
    </Animated.Text>
  );
}

export function formatEarnedAgo(isoStr: string): string {
  const earned = new Date(isoStr).getTime();
  const diffMs = Date.now() - earned;
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  const timeStr = new Date(isoStr).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (mins < 2) return `Just now · ${timeStr}`;
  if (mins < 60) return `${mins} min ago · ${timeStr}`;
  if (hours < 24) return `${hours}h ago · ${timeStr}`;
  return `${days}d ago · ${timeStr}`;
}

export function MilestoneCelebrationModal({
  badge, celebration, message, earnedAt, onShare, onClose,
}: {
  badge: { emoji: string; label: string };
  celebration: { icon: string; text: string };
  message: string;
  earnedAt?: string;
  onShare: () => void;
  onClose: () => void;
}) {
  const { colors: c } = useAppTheme();
  const scale = useSharedValue(0);
  const rotate = useSharedValue(-12);

  useEffect(() => {
    scale.value = withDelay(250, withSpring(1, { damping: 10, stiffness: 180 }));
    rotate.value = withDelay(250, withSpring(0, { damping: 14, stiffness: 160 }));
  }, []);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <LinearGradient colors={['#0a4f4f', '#0F6E6E', '#1a9a9a']} style={styles.overlay}>
        <View style={styles.confettiLayer} pointerEvents="none">
          {Array.from({ length: 12 }).map((_, i) => <ConfettiParticle key={i} index={i} />)}
        </View>

        <View style={styles.card}>
          <LinearGradient
            colors={['#f0fafa', '#e0f5f5', '#cceeee']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardInner}
          >
            {/* Badge circle — matches home screen badgeCircle/badgeEarned */}
            <Animated.View style={[styles.badgeCircle, { backgroundColor: c.bgTeal }, badgeStyle]}>
              <Text style={styles.badgeEmoji}>{badge.emoji}</Text>
            </Animated.View>

            <Text style={[styles.celebrationText, { color: c.textMuted }]}>
              {celebration.icon} {celebration.text}
            </Text>

            <Text style={[styles.badgeLabel, { color: c.primary }]}>
              {badge.label}
            </Text>

            <View style={[styles.divider, { backgroundColor: `rgba(15,110,110,0.15)` }]} />

            <Text style={[styles.message, { color: `rgba(10,104,104,0.75)` }]}>
              {message}
            </Text>

            {earnedAt && (
              <Text style={[styles.earnedAt, { color: `rgba(10,104,104,0.5)` }]}>
                🕒 {formatEarnedAgo(earnedAt)}
              </Text>
            )}

            <Pressable
              onPress={onShare}
              style={({ pressed }) => [styles.shareBtn, { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={styles.shareBtnText}>Share milestone</Text>
            </Pressable>

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.dismissBtn, { opacity: pressed ? 0.6 : 1 }]}
              accessibilityLabel="Dismiss"
              accessibilityRole="button"
            >
              <Text style={[styles.dismissText, { color: `rgba(10,104,104,0.55)` }]}>Maybe later</Text>
            </Pressable>
          </LinearGradient>
        </View>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  confettiLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  cardInner: {
    padding: 28,
    alignItems: 'center',
    gap: 0,
  },
  badgeCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  badgeEmoji: {
    fontSize: 40,
  },
  celebrationText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  badgeLabel: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 16,
  },
  divider: {
    height: 1,
    width: '100%',
    marginBottom: 16,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 10,
  },
  earnedAt: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 20,
  },
  shareBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    width: '100%',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 10,
  },
  shareBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  dismissBtn: {
    padding: 6,
  },
  dismissText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
