import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Dimensions, Modal, Pressable, Text, View } from 'react-native';
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
    <Animated.Text style={[{ position: 'absolute', fontSize: 18, left: startX, top: 0 }, style]}>
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
      <LinearGradient
        colors={['#062e2e', '#0F6E6E', '#1a9a9a']}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }} pointerEvents="none">
          {Array.from({ length: 14 }).map((_, i) => <ConfettiParticle key={i} index={i} />)}
        </View>
        <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingVertical: 40, maxWidth: 360, width: '100%' }}>
          <Animated.Text style={[{ fontSize: 88, lineHeight: 100, marginBottom: 20 }, badgeStyle]}>
            {badge.emoji}
          </Animated.Text>
          <Text style={{ fontSize: 20, fontWeight: '700', color: 'rgba(255,255,255,0.75)', marginBottom: 6 }}>
            {celebration.icon} {celebration.text}
          </Text>
          <Text style={{ fontSize: 28, fontWeight: '900', color: '#fff', textAlign: 'center', marginBottom: 20 }}>
            {badge.label}
          </Text>
          <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.82)', textAlign: 'center', lineHeight: 24, marginBottom: earnedAt ? 16 : 44 }}>
            {message}
          </Text>
          {earnedAt && (
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: 44 }}>
              🕒 {formatEarnedAgo(earnedAt)}
            </Text>
          )}
          <Pressable
            onPress={onShare}
            style={({ pressed }) => ({ backgroundColor: '#fff', borderRadius: 14, paddingVertical: 15, width: '100%', alignItems: 'center', marginBottom: 12, opacity: pressed ? 0.85 : 1 })}
          >
            <Text style={{ fontSize: 16, fontWeight: '800', color: c.primary }}>Share milestone</Text>
          </Pressable>
          <Pressable onPress={onClose} style={({ pressed }) => ({ padding: 12, opacity: pressed ? 0.6 : 1 })} accessibilityLabel="Dismiss" accessibilityRole="button">
            <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', fontWeight: '600' }}>Maybe later</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </Modal>
  );
}
