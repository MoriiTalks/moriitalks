import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { HarnessActionId, HarnessPanel } from '@contracts/harness';
import type { VoiceLocale } from '@contracts/voice';

import { Icon } from '@/components/icon';

import { harnessCopy } from './harness-copy';

function ActionChip({
  label,
  disabled = false,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-12 max-w-full min-w-12 items-center justify-center rounded-2xl bg-mint px-3 py-3 ${disabled ? 'opacity-50' : 'active:bg-mint-strong'}`}
    >
      <Text className="text-center text-base leading-6 font-semibold text-teal">{label}</Text>
    </Pressable>
  );
}

// Evidence stays available on request without turning a single next step into another card.
function FeedbackContent({
  panel,
  locale,
}: {
  panel: Extract<HarnessPanel, { type: 'propose_feedback' }>;
  locale: VoiceLocale;
}) {
  const copy = harnessCopy[locale];
  const [showQuote, setShowQuote] = useState(false);

  return (
    <View className="gap-3">
      {panel.status === 'unassessable' && (
        <Text className="text-sm leading-5 text-muted">{copy.feedbackStatus.unassessable}</Text>
      )}
      <Text className="text-lg leading-7 text-ink">{panel.observation}</Text>
      <View className="gap-1 rounded-2xl bg-mist px-4 py-3">
        <Text className="text-sm leading-5 font-semibold text-teal">{copy.nextStep}</Text>
        <Text className="text-lg leading-7 text-ink">{panel.nextStep}</Text>
      </View>
      {panel.quote !== '' && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showQuote }}
            aria-expanded={showQuote}
            onPress={() => {
              setShowQuote((shown) => !shown);
            }}
            className="min-h-12 flex-row items-center gap-2 self-start rounded-xl py-3 pr-3 active:bg-mist"
          >
            <Text className="text-sm leading-5 text-muted">
              {showQuote ? copy.hideQuote : copy.showQuote}
            </Text>
            <Icon name={showQuote ? 'close' : 'more'} size={16} />
          </Pressable>
          {showQuote && <Text className="text-sm leading-5 text-muted">“{panel.quote}”</Text>}
        </>
      )}
    </View>
  );
}

// Contract-defined display data and fixed actions keep the model away from routes and callbacks.
export function HarnessPanelView({
  panel,
  locale,
  disabled,
  canEnd = false,
  busy = false,
  intro,
  onAction,
  onDismiss,
}: {
  panel: HarnessPanel;
  locale: VoiceLocale;
  disabled: boolean;
  canEnd?: boolean;
  busy?: boolean;
  intro?: string;
  onAction: (action: HarnessActionId) => void;
  onDismiss: () => void;
}) {
  const copy = harnessCopy[locale];
  const title =
    'title' in panel ? panel.title : panel.type === 'propose_feedback' ? copy.feedback : copy.end;

  function content() {
    switch (panel.type) {
      case 'show_hint':
        return <Text className="text-lg leading-7 text-ink">{panel.text}</Text>;
      case 'show_choices':
        return (
          <View className="flex-row flex-wrap gap-2">
            {panel.choices.map((choice) => (
              <ActionChip
                key={choice.id}
                label={choice.label}
                disabled={disabled}
                onPress={() => {
                  onAction(choice.id);
                }}
              />
            ))}
          </View>
        );
      case 'show_outline':
        return (
          <View className="gap-2.5">
            {panel.parts.map((part, index) => (
              <View key={index} className="flex-row items-start gap-3">
                <View className="mt-0.5 size-6 items-center justify-center rounded-full bg-mist">
                  <Text className="text-xs font-semibold text-teal">{index + 1}</Text>
                </View>
                <Text className="flex-1 text-lg leading-7 text-ink">{part}</Text>
              </View>
            ))}
          </View>
        );
      case 'propose_feedback':
        return (
          <FeedbackContent key={`${panel.status}-${panel.quote}`} panel={panel} locale={locale} />
        );
      case 'propose_next_mission':
      case 'request_end_session':
        return <Text className="text-lg leading-7 text-ink">{panel.text}</Text>;
    }
  }

  const action =
    panel.type === 'propose_next_mission'
      ? 'start_mission'
      : panel.type === 'request_end_session'
        ? 'end_session'
        : 'retry';
  const actionLabel =
    action === 'start_mission' ? copy.next : action === 'end_session' ? copy.end : copy.retry;

  return (
    <View className="gap-3 rounded-3xl bg-surface p-4 shadow-sm shadow-ink/5">
      <View className="flex-row items-center justify-between gap-2">
        <Text
          accessibilityRole="header"
          className="flex-1 text-base leading-6 font-semibold text-ink"
        >
          {title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.close}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onDismiss}
          className={`-my-2 -mr-2 min-h-12 min-w-12 items-center justify-center rounded-2xl ${busy ? 'opacity-50' : 'active:bg-mist'}`}
        >
          <Icon name="close" size={18} />
        </Pressable>
      </View>
      {intro !== undefined && intro !== '' && (
        <Text className="text-lg leading-7 text-ink">{intro}</Text>
      )}
      {content()}
      {panel.type !== 'show_choices' && (
        <View className="flex-row flex-wrap gap-2">
          <ActionChip
            label={actionLabel}
            disabled={action === 'end_session' ? !canEnd : disabled}
            onPress={() => {
              onAction(action);
            }}
          />
        </View>
      )}
    </View>
  );
}

// On-demand help keeps the default scene quiet while exposing the same approved actions.
export function HarnessTools({
  locale,
  expanded,
  onToggle,
  onAction,
}: {
  locale: VoiceLocale;
  expanded: boolean;
  onToggle: () => void;
  onAction: (action: HarnessActionId) => void;
}) {
  const copy = harnessCopy[locale];
  const tools: { action: HarnessActionId; label: string }[] = [
    { action: 'hint', label: copy.hint },
    { action: 'outline', label: copy.outline },
    { action: 'finish', label: copy.finish },
  ];

  return (
    <View className="items-center gap-1">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        onPress={onToggle}
        className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl px-4 py-3 active:bg-mint"
      >
        <Icon name="sparkles" size={16} />
        <Text className="text-base leading-6 font-medium text-muted">
          {expanded ? copy.hideTools : copy.tools}
        </Text>
      </Pressable>
      {expanded && (
        <View className="flex-row flex-wrap justify-center gap-2">
          {tools.map((tool) => (
            <ActionChip
              key={tool.action}
              label={tool.label}
              onPress={() => {
                onAction(tool.action);
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
