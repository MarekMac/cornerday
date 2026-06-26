import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import Logo from '@/components/Logo';

export default function LoadingScreen() {
  return (
    <LinearGradient colors={['#0a4f4f', '#0F6E6E', '#1a9a9a']} style={styles.gradient}>
      <View style={styles.center}>
        <View style={styles.logoBox}>
          <Logo size={72} variant="white" />
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logoBox: {
    width: 100,
    height: 100,
    borderRadius: 22,
    backgroundColor: '#0F6E6E',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 18,
  },
});
