import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import Logo from '@/components/Logo';

export default function LoadingScreen() {
  return (
    <LinearGradient colors={['#0a4f4f', '#0F6E6E', '#1a9a9a']} style={styles.gradient}>
      <View style={styles.center}>
        <View style={styles.logoBox}>
          <Logo size={72} variant="white" />
        </View>
        <Text style={styles.name}>CornerDay</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
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
  name: {
    fontSize: 36,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.5,
  },
});
