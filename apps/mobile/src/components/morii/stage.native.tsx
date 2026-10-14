import { Canvas } from '@react-three/fiber/native';
import { use } from 'react';
import { PixelRatio, View } from 'react-native';
import { NeutralToneMapping } from 'three';

import { modelSource } from './model';
import type { StageRenderProps } from './motion';
import { MoriiScene } from './scene';

// Expo GL uses native pixel density, scaling a smaller surface bounds the stage's buffer size.
export default function MoriiStage(props: StageRenderProps) {
  const source = use(modelSource());
  const scale = Math.max(1, PixelRatio.get() / 1.5);
  const dimension = props.size / scale;
  return (
    <View
      pointerEvents="none"
      style={{
        width: dimension,
        height: dimension,
        left: (props.size - dimension) * 0.5,
        top: (props.size - dimension) * 0.5,
        transform: [{ scale }],
      }}
    >
      <Canvas
        frameloop="demand"
        camera={{ position: [0, 1.6, 6.8], fov: 30, near: 0.1, far: 20 }}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: 'low-power',
          toneMapping: NeutralToneMapping,
          toneMappingExposure: 1,
        }}
        onCreated={({ camera }) => {
          camera.lookAt(0, 1.45, 0);
        }}
        pointerEvents="none"
        style={{ flex: 1 }}
      >
        <MoriiScene {...props} source={source} />
      </Canvas>
    </View>
  );
}
