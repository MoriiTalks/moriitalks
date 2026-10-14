import { Asset } from 'expo-asset';

import model from '../../../assets/morii-stage.glb';

let source: Promise<string> | undefined;

// Only the bundled model can be loaded, no AI-controlled URLs reach a graphics loader.
export function modelSource(): Promise<string> {
  source ??= Asset.fromModule(model)
    .downloadAsync()
    .then((asset) => asset.localUri ?? asset.uri);
  return source;
}
