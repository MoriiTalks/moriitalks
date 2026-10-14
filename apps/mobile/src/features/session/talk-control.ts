import type { DeviceTalkStatus } from './device-talk-session.ts';

// One mapping keeps the visible icon, action label, and capture behavior consistent.
export function talkVoiceControl(
  status: DeviceTalkStatus,
  recognitionSupported: boolean,
  responsePending = false,
) {
  const action =
    status === 'connecting'
      ? null
      : status === 'listening'
        ? 'pause'
        : status === 'thinking' || status === 'speaking'
          ? 'interrupt'
          : 'resume';
  return {
    action,
    icon: action === 'pause' ? ('pause' as const) : ('mic' as const),
    label: action === 'resume' && responsePending ? 'replay' : (action ?? 'preparing'),
    disabled: action === null || (action === 'resume' && !recognitionSupported && !responsePending),
  } as const;
}
