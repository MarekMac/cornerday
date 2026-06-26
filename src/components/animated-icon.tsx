import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Dimensions, StyleSheet, Text } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Logo from '@/components/Logo';

const { width: SW, height: SH } = Dimensions.get('screen');

const SPLASH_DURATION = 2600;

export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const overlayKeyframe = new Keyframe({
    0:   { opacity: 1 },
    65:  { opacity: 1 },
    100: { opacity: 0 },
  });

  const logoKeyframe = new Keyframe({
    0:   { opacity: 0, transform: [{ scale: 0.85 }] },
    35:  { opacity: 1, transform: [{ scale: 1 }], easing: Easing.out(Easing.back(1.2)) },
    100: { opacity: 1, transform: [{ scale: 1 }] },
  });

  return (
    <Animated.View
      entering={overlayKeyframe.duration(SPLASH_DURATION).withCallback((finished) => {
        'worklet';
        if (finished) scheduleOnRN(setVisible, false);
      })}
      style={styles.overlay}>
      <LinearGradient colors={['#0a4f4f', '#0F6E6E', '#1a9a9a']} style={StyleSheet.absoluteFill} />
      <Animated.View entering={logoKeyframe.duration(SPLASH_DURATION * 0.55)} style={styles.content}>
        <Animated.View style={styles.logoBox}>
          <Logo size={84} variant="white" />
        </Animated.View>
        <Text style={styles.appName}>CornerDay</Text>
        <Text style={styles.tagline}>The day you turn it around{'\n'}starts today.</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SW,
    height: SH,
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 20,
  },
  logoBox: {
    width: 114,
    height: 114,
    borderRadius: 26,
    backgroundColor: '#0F6E6E',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 18,
  },
  appName: {
    fontSize: 54,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.82)',
    textAlign: 'center',
    lineHeight: 30,
  },
});
