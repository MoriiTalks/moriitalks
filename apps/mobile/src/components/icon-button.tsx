import { Pressable } from 'react-native';

import { Icon } from './icon';
import type { IconName } from './icon';

// Small visual controls retain a 48-point target and an explicit screen reader label.
export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
  expanded,
  primary = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  expanded?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, expanded }}
      aria-expanded={expanded}
      disabled={disabled}
      onPress={onPress}
      className={`size-12 items-center justify-center rounded-full ${primary ? 'bg-teal' : 'bg-white/60'} ${disabled ? 'opacity-40' : primary ? 'active:bg-teal-strong' : 'active:bg-mint'}`}
    >
      <Icon name={icon} color={primary ? '#FFFFFF' : '#1E5B52'} />
    </Pressable>
  );
}
