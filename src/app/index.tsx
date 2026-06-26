import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import Logo from '@/components/Logo';

export default function LoadingScreen() {
  return (
    <LinearGradient colors={['#0a4f4f', '#0F6E6E', '#1a9a9a']} style={styles.gradient}>
      <View style={styles.center}>
        <Logo size={72} variant="white" />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
