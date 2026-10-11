import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';

// A quiet, shared backdrop creates depth without competing with Morii or the current task.
export function SceneBackground() {
  return (
    <LinearGradient
      colors={['#FAF8F0', '#F4F8F1', '#E9F3EF']}
      locations={[0, 0.55, 1]}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    />
  );
}
