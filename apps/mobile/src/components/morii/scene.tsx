import { useEffect, useMemo, useRef } from 'react';
import { SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { MoriiMotionPlayer } from './animation';
import { useFrame, useLoader, useThree } from './fiber';
import { motionClip } from './motion';
import type { StageProps } from './motion';

const shadowVertex = `
  varying vec2 shadowUv;
  void main() {
    shadowUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const shadowFragment = `
  varying vec2 shadowUv;
  void main() {
    float radius = length((shadowUv - 0.5) * 2.0);
    float falloff = exp(-radius * radius * 4.0) * (1.0 - smoothstep(0.55, 1.0, radius));
    gl_FragColor = vec4(0.26, 0.36, 0.33, falloff * 0.15);
  }
`;

export function MoriiScene({ source, ...props }: StageProps & { source: string }) {
  const gltf = useLoader(GLTFLoader, source);
  const model = useMemo(() => {
    const instance = clone(gltf.scene);
    const card = instance.getObjectByName('IdeaCard');
    if (card !== undefined) card.visible = false;
    return instance;
  }, [gltf.scene]);
  const player = useRef<MoriiMotionPlayer | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const clip = motionClip(props);

  useEffect(() => {
    const motion = new MoriiMotionPlayer(model, gltf.animations);
    player.current = motion;
    invalidate();
    return () => {
      player.current = null;
      motion.dispose();
      // Cloned skeletons own their bone textures, cached geometry and materials remain reusable.
      model.traverse((node) => {
        if (node instanceof SkinnedMesh) node.skeleton.dispose();
      });
    };
  }, [gltf.animations, invalidate, model]);

  useEffect(() => {
    player.current?.setClip(clip);
    invalidate();
  }, [clip, invalidate]);

  useEffect(() => {
    const card = model.getObjectByName('IdeaCard');
    if (card !== undefined) card.visible = props.prop === 'idea-card';
    invalidate();
  }, [invalidate, model, props.prop]);

  useFrame((_state, delta) => {
    const motion = player.current;
    if (motion === null) return;
    const active = motion.update(delta);
    const expressive = active && !props.quiet && !props.reducedMotion;
    const settling = motion.updateFace(delta, expressive, props.state === 'speaking');
    if (active || settling) invalidate();
  });

  return (
    <>
      <hemisphereLight color="#FFFFFF" groundColor="#C6D4CE" intensity={2} />
      <directionalLight color="#FFFDF6" position={[-3, 5, 5]} intensity={2.8} />
      <mesh rotation={[-Math.PI * 0.5, 0, 0]} position={[0, -0.004, 0]} renderOrder={-1}>
        <planeGeometry args={[3.4, 2.4]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          vertexShader={shadowVertex}
          fragmentShader={shadowFragment}
        />
      </mesh>
      <primitive object={model} dispose={null} />
    </>
  );
}
