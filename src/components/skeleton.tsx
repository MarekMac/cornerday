import { Animated } from 'react-native';
import { useEffect, useRef } from 'react';
import { useAppTheme } from '@/context/theme';

export function SkeletonBox({ width, height, radius = 8, style }: {
  width?: number | string; height: number; radius?: number; style?: any;
}) {
  const { colors: c } = useAppTheme();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.85, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 650, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { backgroundColor: c.bgElement, borderRadius: radius, height },
        width !== undefined ? { width } : { flex: 1 },
        style,
        { opacity },
      ]}
    />
  );
}
