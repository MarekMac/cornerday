import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

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
      <LinearGradient
        colors={['#0F6E6E', '#1a9a9a', '#a8d8d0']}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View entering={logoKeyframe.duration(SPLASH_DURATION * 0.55)} style={styles.content}>
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>CD</Text>
        </View>
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
    gap: 12,
  },
  logoBox: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  logoText: {
    fontSize: 34,
    fontWeight: '700',
    color: '#fff',
  },
  appName: {
    fontSize: 38,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
    lineHeight: 24,
    marginTop: 4,
  },
});
