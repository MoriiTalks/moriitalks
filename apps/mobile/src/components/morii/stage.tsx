import { Canvas, useThree } from '@react-three/fiber';
import { use, useEffect } from 'react';
import { Image } from 'react-native';
import { NeutralToneMapping } from 'three';

import still from '../../../assets/morii-stage.png';
import { modelSource } from './model';
import type { StageRenderProps } from './motion';
import { MoriiScene } from './scene';

function ContextLifecycle({ onUnavailable }: Pick<StageRenderProps, 'onUnavailable'>) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const unavailable = (event: Event) => {
      event.preventDefault();
      onUnavailable();
    };
    canvas.addEventListener('webglcontextlost', unavailable);
    return () => {
      canvas.removeEventListener('webglcontextlost', unavailable);
    };
  }, [gl, onUnavailable]);
  return null;
}

// The browser renderer is loaded after mount, static export never creates a graphics context.
export default function MoriiStage(props: StageRenderProps) {
  const source = use(modelSource());
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ position: [0, 1.6, 6.8], fov: 30, near: 0.1, far: 20 }}
      gl={{
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
        toneMapping: NeutralToneMapping,
        toneMappingExposure: 1,
      }}
      fallback={
        <Image
          source={still}
          style={{ width: props.size, height: props.size }}
          resizeMode="contain"
        />
      }
      onCreated={({ camera }) => {
        camera.lookAt(0, 1.45, 0);
      }}
      style={{ width: props.size, height: props.size, pointerEvents: 'none' }}
    >
      <ContextLifecycle onUnavailable={props.onUnavailable} />
      <MoriiScene {...props} source={source} />
    </Canvas>
  );
}
