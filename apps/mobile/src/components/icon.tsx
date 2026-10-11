import { Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export type IconName =
  | 'back'
  | 'close'
  | 'chat'
  | 'mic'
  | 'send'
  | 'pause'
  | 'more'
  | 'info'
  | 'sparkles'
  | 'home'
  | 'practice'
  | 'progress'
  | 'settings'
  | 'check'
  | 'arrow';

const paths: Record<IconName, string> = {
  back: 'm14 6-6 6 6 6',
  close: 'm6 6 12 12M18 6 6 18',
  chat: 'M20 11.5a8 8 0 0 1-8 8H5l-3 2v-10a9 9 0 0 1 18 0ZM8 11h8M8 15h5',
  mic: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0ZM5 11v1a7 7 0 0 0 14 0v-1M12 19v3M8 22h8',
  send: 'm4 12 16-8-6 16-3-7-7-1ZM11 13l9-9',
  pause: 'M8 5v14M16 5v14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  info: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 11v6M12 7h.01',
  sparkles: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4M18 4h4',
  home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  practice: 'M4 4h6a4 4 0 0 1 4 4v13a4 4 0 0 0-4-3H4ZM14 8a4 4 0 0 1 4-4h3v14h-3a4 4 0 0 0-4 3',
  progress: 'M5 19v-5M12 19V9M19 19V4M3 22h18',
  settings: 'M4 7h16M4 17h16M9 4v6M16 14v6',
  check: 'm5 12 4 4L19 6',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
};

// One stroke style keeps navigation and contextual actions visually consistent.
export function Icon({
  name,
  size = 22,
  color = '#1E5B52',
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  // SVG forwards native-only props to the DOM, use ARIA for decorative web icons.
  const accessibilityProps =
    Platform.OS === 'web' ? { 'aria-hidden': true } : { accessible: false };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...accessibilityProps}>
      <Path
        d={paths[name]}
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
