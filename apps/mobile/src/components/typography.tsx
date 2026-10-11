// Shared text styles give headings and titles semantic header roles.
import type { PropsWithChildren } from 'react';
import { Text } from 'react-native';

export function Heading({ children }: PropsWithChildren) {
  return (
    <Text accessibilityRole="header" className="text-[30px] leading-9.5 font-bold text-ink">
      {children}
    </Text>
  );
}

export function Title({ children }: PropsWithChildren) {
  return (
    <Text accessibilityRole="header" className="text-[23px] leading-7.5 font-semibold text-ink">
      {children}
    </Text>
  );
}

export function Paragraph({ children }: PropsWithChildren) {
  return <Text className="text-lg leading-7 text-muted">{children}</Text>;
}

export function Eyebrow({ children }: PropsWithChildren) {
  return <Text className="text-sm leading-5 font-medium text-teal">{children}</Text>;
}

export function Note({ children }: PropsWithChildren) {
  return <Text className="text-sm leading-5 text-muted">{children}</Text>;
}
