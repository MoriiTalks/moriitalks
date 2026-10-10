// Types bundled image assets and global stylesheet imports for the mobile app.
declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native';

  const source: ImageSourcePropType;
  export default source;
}

declare module '*.css';
