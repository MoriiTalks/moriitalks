import { Image, View } from 'react-native';

import listen from '../../assets/morii-listen.png';
import wave from '../../assets/morii-wave.png';

const sources = {
  wave,
  listen,
};

// Decorative mascot artwork, surrounding screen text conveys the speaking or listening state.
export function Morii({
  pose = 'wave',
  size = 260,
}: {
  pose?: keyof typeof sources;
  size?: number;
}) {
  return (
    <View className="max-w-full self-center" style={{ width: size, height: size }}>
      <View className="absolute inset-x-[8%] top-[15%] bottom-[1%] rounded-full bg-mint" />
      <Image source={sources[pose]} className="size-full" resizeMode="contain" accessible={false} />
    </View>
  );
}
