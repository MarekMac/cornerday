import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue,
  withDelay, withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import Logo from '@/components/Logo';
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
    <Animated.Text style={[{ position: 'absolute', fontSize: 14, left: startX, top: 0, opacity: 0.7 }, style]}>
      {CONFETTI_EMOJIS[index % CONFETTI_EMOJIS.length]}
    </Animated.Text>
  );
}

export function MilestoneCelebrationModal({
  badge, tagline, isTimeBadge, cardRef, onShare, onClose,
}: {
  badge: { emoji: string; label: string };
  tagline: string;
  isTimeBadge: boolean;
  cardRef?: React.RefObject<any>;
  onShare: () => void;
  onClose: () => void;
}) {
  const { colors: c } = useAppTheme();
  const scale = useSharedValue(0);
  const rotate = useSharedValue(-12);

  useEffect(() => {
    scale.value = withDelay(250, withSpring(1, { damping: 10, stiffness: 180 }));
    rotate.value = withDelay(250, withSpring(0, { damping: 14, stiffness: 160 }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const centerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));

  const parts = badge.label.split(' ');
  const num = parts[0];
  const unit = parts.slice(1).join(' ').toUpperCase();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Confetti lives outside the card so the captured share image is clean */}
        <View style={styles.confettiLayer} pointerEvents="none">
          {Array.from({ length: 14 }).map((_, i) => <ConfettiParticle key={i} index={i} />)}
        </View>

        <View ref={cardRef} collapsable={false} style={styles.card}>
          <LinearGradient
            colors={['#0a4f4f', '#0F6E6E', '#1a9a9a']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardInner}
          >
            <View style={styles.cardTop}>
              <Text style={styles.brand}>CornerDay</Text>
              <Logo size={24} variant="light" />
            </View>

            <Animated.View style={[styles.center, centerStyle]}>
              {isTimeBadge ? (
                <>
                  <Text style={styles.num}>{num}</Text>
                  <Text style={styles.unit}>{unit}</Text>
                  <Text style={styles.sub}>milestone reached</Text>
                </>
              ) : (
                <>
                  <Text style={styles.achievementEmoji}>{badge.emoji}</Text>
                  <Text style={styles.achievementLabel}>{badge.label.toUpperCase()}</Text>
                  <Text style={styles.sub}>milestone earned</Text>
                </>
              )}
            </Animated.View>

            <View style={styles.divider} />

            <View style={styles.cardBottom}>
              <Text style={styles.tagline}>"{tagline}"</Text>
              <Text style={styles.hashtag}>#CornerDay</Text>
            </View>
          </LinearGradient>
        </View>

        <View style={styles.actions}>
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
            <Text style={styles.dismissText}>Maybe later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
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
    width: 320,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 16,
  },
  cardInner: {
    padding: 28,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  brand: {
    fontSize: 15,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1,
  },
  center: {
    alignItems: 'center',
    gap: 4,
  },
  num: {
    fontSize: 80,
    fontWeight: '900',
    color: '#fff',
    lineHeight: 84,
  },
  unit: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 3,
  },
  sub: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  achievementEmoji: {
    fontSize: 72,
    lineHeight: 80,
  },
  achievementLabel: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 8,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginVertical: 24,
  },
  cardBottom: {
    alignItems: 'center',
    gap: 6,
  },
  tagline: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  hashtag: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '600',
  },
  actions: {
    width: 320,
    marginTop: 20,
    gap: 10,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 15,
  },
  shareBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  dismissBtn: {
    alignItems: 'center',
    padding: 6,
  },
  dismissText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
});
