import type { PropsWithChildren } from 'react';
import { Text } from 'react-native';

export function Heading({ children }: PropsWithChildren) {
  return (
    <Text accessibilityRole="header" className="text-[32px] leading-[39px] font-bold text-ink">
      {children}
    </Text>
  );
}

export function Title({ children }: PropsWithChildren) {
  return (
    <Text accessibilityRole="header" className="text-2xl leading-[31px] font-bold text-ink">
      {children}
    </Text>
  );
}

export function Paragraph({ children }: PropsWithChildren) {
  return <Text className="text-base leading-[25px] text-muted">{children}</Text>;
}

export function Eyebrow({ children }: PropsWithChildren) {
  return <Text className="text-xs font-bold tracking-[1px] text-teal">{children}</Text>;
}

export function Note({ children }: PropsWithChildren) {
  return <Text className="text-sm leading-5 text-muted">{children}</Text>;
}
