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
  badge, tagline, isTimeBadge, details, cardRef, onShare, onClose,
}: {
  badge: { emoji: string; label: string };
  tagline: string;
  isTimeBadge: boolean;
  details?: Array<{ label: string; value: string; highlight?: boolean }>;
  cardRef?: React.RefObject<any>;
  onShare: () => void;
  onClose: () => void;
}) {
  const { colorScheme } = useAppTheme();

  // Mirrors the cc object in the home screen — card looks identical to the share card
  const cc = colorScheme === 'dark' ? {
    gradient:        ['#062e2e', '#0F6E6E', '#1a9a9a'] as const,
    brand:           'rgba(255,255,255,0.7)',
    pillBg:          'rgba(255,255,255,0.15)',
    bigText:         '#ffffff',
    unit:            'rgba(255,255,255,0.8)',
    sub:             'rgba(255,255,255,0.7)',
    divider:         'rgba(255,255,255,0.2)',
    detailBg:        'rgba(255,255,255,0.08)',
    detailBorder:    'rgba(255,255,255,0.12)',
    detailLabel:     'rgba(255,255,255,0.55)',
    detailValue:     '#ffffff',
    detailHighlight: '#a8d8d0',
    tagline:         'rgba(255,255,255,0.55)',
    hashtag:         'rgba(255,255,255,0.4)',
  } : {
    gradient:        ['#f8fefe', '#edfafa', '#dff5f5'] as const,
    brand:           '#0a6868',
    pillBg:          '#0a6868',
    bigText:         '#0F6E6E',
    unit:            '#0F6E6E',
    sub:             'rgba(10,104,104,0.65)',
    divider:         'rgba(15,110,110,0.15)',
    detailBg:        'rgba(15,110,110,0.06)',
    detailBorder:    'rgba(15,110,110,0.12)',
    detailLabel:     'rgba(10,104,104,0.6)',
    detailValue:     '#0a5a5a',
    detailHighlight: '#0F6E6E',
    tagline:         'rgba(6,46,46,0.5)',
    hashtag:         'rgba(15,110,110,0.4)',
  };

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
      {/* Outer Pressable catches taps on the teal background to close */}
      <Pressable style={styles.outerPressable} onPress={onClose}>
        {/* Teal gradient background with confetti — both non-interactive */}
        <LinearGradient
          colors={['#0a4f4f', '#0F6E6E', '#1a9a9a']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.confettiLayer} pointerEvents="none">
          {Array.from({ length: 14 }).map((_, i) => <ConfettiParticle key={i} index={i} />)}
        </View>

        {/* Inner Pressable stops tap-propagation so card/buttons don't close modal */}
        <Pressable onPress={() => {}} style={{ alignItems: 'center' }}>
          {/* Card — same gradient and colors as the home screen share card */}
          <View ref={cardRef} collapsable={false} style={styles.card}>
            <LinearGradient
              colors={cc.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardInner}
            >
              <View style={styles.cardTop}>
                <Text style={[styles.brand, { color: cc.brand }]}>CornerDay</Text>
                <View style={[styles.logoBadge, { backgroundColor: cc.pillBg }]}>
                  <Logo size={24} variant="white" />
                </View>
              </View>

              <Animated.View style={[styles.center, centerStyle]}>
                {isTimeBadge ? (
                  <>
                    <Text style={[styles.num, { color: cc.bigText }]}>{num}</Text>
                    <Text style={[styles.unit, { color: cc.unit }]}>{unit}</Text>
                    <Text style={[styles.sub, { color: cc.sub }]}>milestone reached</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.achievementEmoji}>{badge.emoji}</Text>
                    <Text style={[styles.achievementLabel, { color: cc.bigText }]}>{badge.label.toUpperCase()}</Text>
                    <Text style={[styles.sub, { color: cc.sub }]}>milestone earned</Text>
                  </>
                )}
              </Animated.View>

              {details && details.length > 0 && (
                <View style={[styles.detailBox, { backgroundColor: cc.detailBg }]}>
                  {details.map((d, i) => (
                    <View
                      key={i}
                      style={[styles.detailRow, { borderBottomColor: cc.detailBorder }, i === details.length - 1 && { borderBottomWidth: 0 }]}
                    >
                      <Text style={[styles.detailLabel, { color: cc.detailLabel }]}>{d.label}</Text>
                      <Text style={[styles.detailValue, { color: d.highlight ? cc.detailHighlight : cc.detailValue }]}>{d.value}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={[styles.divider, { backgroundColor: cc.divider }]} />

              <View style={styles.cardBottom}>
                <Text style={[styles.taglineText, { color: cc.tagline }]}>"{tagline}"</Text>
                <Text style={[styles.hashtag, { color: cc.hashtag }]}>#CornerDay</Text>
              </View>
            </LinearGradient>
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={onShare}
              style={({ pressed }) => [styles.shareBtn, { opacity: pressed ? 0.85 : 1 }]}
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  outerPressable: {
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
    width: 320,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
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
    marginBottom: 36,
  },
  brand: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1,
  },
  logoBadge: {
    borderRadius: 8,
    padding: 5,
  },
  center: {
    alignItems: 'center',
    gap: 4,
    marginBottom: 20,
  },
  num: {
    fontSize: 80,
    fontWeight: '900',
    lineHeight: 84,
  },
  unit: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 3,
  },
  sub: {
    fontSize: 15,
    marginTop: 4,
  },
  achievementEmoji: {
    fontSize: 72,
    lineHeight: 80,
  },
  achievementLabel: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 8,
  },
  detailBox: {
    borderRadius: 16,
    marginTop: 20,
    paddingVertical: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailLabel: {
    fontSize: 13,
    flexShrink: 0,
    marginRight: 12,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
    flexWrap: 'wrap',
  },
  divider: {
    height: 1,
    marginVertical: 24,
  },
  cardBottom: {
    alignItems: 'center',
    gap: 6,
  },
  taglineText: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  hashtag: {
    fontSize: 12,
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
    backgroundColor: 'rgba(255,255,255,0.2)',
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
    color: 'rgba(255,255,255,0.6)',
  },
});
