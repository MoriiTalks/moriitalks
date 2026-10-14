import type { RecognitionCallbacks, RecognitionDriver } from './device-talk-session';

import { startBrowserInputMeter } from './browser-input-meter.ts';

// Browser speech types are deliberately limited to the API surface owned by this adapter.
export interface BrowserRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onnomatch: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export interface BrowserSpeechEnvironment {
  secureContext: boolean;
  create: () => BrowserRecognition;
  startMeter?: (level: (value: number | null) => void) => () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRecognition(value: unknown): value is BrowserRecognition {
  return (
    isRecord(value) &&
    typeof value['lang'] === 'string' &&
    typeof value['continuous'] === 'boolean' &&
    typeof value['interimResults'] === 'boolean' &&
    typeof value['maxAlternatives'] === 'number' &&
    typeof value['start'] === 'function' &&
    typeof value['stop'] === 'function' &&
    typeof value['abort'] === 'function'
  );
}

export function browserSpeechEnvironment(scope: unknown): BrowserSpeechEnvironment | null {
  if (!isRecord(scope)) return null;
  const constructor =
    typeof scope['SpeechRecognition'] === 'function'
      ? scope['SpeechRecognition']
      : scope['webkitSpeechRecognition'];
  if (typeof constructor !== 'function') return null;
  return {
    secureContext: scope['isSecureContext'] === true,
    startMeter: startBrowserInputMeter,
    create: () => {
      const recognition: unknown = Reflect.construct(constructor, []);
      if (!isRecognition(recognition))
        throw new Error('Browser speech recognition is unavailable.');
      return recognition;
    },
  };
}

function transcript(event: unknown) {
  if (!isRecord(event)) return null;
  const results = event['results'];
  if (!isRecord(results)) return null;
  const length = results['length'];
  if (typeof length !== 'number' || !Number.isInteger(length) || length < 1 || length > 100)
    return null;
  const parts: string[] = [];
  let final = true;
  for (let index = 0; index < length; index += 1) {
    const result = results[String(index)];
    if (!isRecord(result) || typeof result['isFinal'] !== 'boolean') return null;
    const alternative = result['0'];
    if (!isRecord(alternative) || typeof alternative['transcript'] !== 'string') return null;
    parts.push(alternative['transcript'].trim());
    final &&= result['isFinal'];
  }
  return { text: parts.join(' ').trim(), final };
}

function failureReason(event: unknown): Parameters<RecognitionCallbacks['failed']>[0] {
  const error = isRecord(event) ? event['error'] : undefined;
  if (error === 'not-allowed' || error === 'service-not-allowed') return 'permission';
  return error === 'no-speech' ? 'empty' : 'unavailable';
}

export function createBrowserSpeech(
  environment: () => BrowserSpeechEnvironment | null = () =>
    browserSpeechEnvironment(typeof window === 'undefined' ? null : window),
): RecognitionDriver {
  let active: BrowserRecognition | null = null;
  return {
    get supported() {
      return environment()?.secureContext === true;
    },
    // start() requests browser permission only after the session's explicit voice opt-in.
    permission: () => Promise.resolve(environment()?.secureContext === true && active === null),
    recognize: (locale, callbacks) => {
      const available = environment();
      if (!available?.secureContext || active !== null)
        throw new Error('Browser speech recognition is unavailable or still stopping.');
      const recognition = available.create();
      active = recognition;
      let cancelled = false;
      let ended = false;
      let failed = false;
      let final = false;
      let started = false;
      let stopping = false;
      let drain: Promise<void> | null = null;
      let metering = false;
      let stopMeter: (() => void) | null = null;
      let complete: () => void = () => undefined;
      const completion = new Promise<void>((resolve) => {
        complete = resolve;
      });
      const current = () => active === recognition && !cancelled && !ended && !failed;
      const meterCurrent = () => current() && metering;
      const endMeter = () => {
        if (!metering) return;
        metering = false;
        const stop = stopMeter;
        stopMeter = null;
        try {
          stop?.();
        } catch {
          // An optional volume meter cannot fail the recognizer.
        }
        callbacks.level?.(null);
      };
      const detachInput = () => {
        recognition.onstart = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onnomatch = null;
      };
      const fail = (reason: Parameters<RecognitionCallbacks['failed']>[0]) => {
        if (!current()) return;
        failed = true;
        endMeter();
        callbacks.failed(reason);
      };
      recognition.lang = locale === 'id' ? 'id-ID' : 'en-US';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => {
        if (!current() || started) return;
        started = true;
        callbacks.started();
        if (current() && callbacks.level !== undefined && available.startMeter !== undefined) {
          metering = true;
          try {
            const stop = available.startMeter((level) => {
              if (meterCurrent()) callbacks.level?.(level);
            });
            if (meterCurrent()) stopMeter = stop;
            else stop();
          } catch {
            endMeter();
          }
        }
      };
      recognition.onresult = (event) => {
        if (!current() || final) return;
        const result = transcript(event);
        if (result === null) {
          fail('unavailable');
          return;
        }
        final = result.final;
        callbacks.result(result.text, result.final);
      };
      recognition.onerror = (event) => {
        fail(failureReason(event));
      };
      recognition.onnomatch = () => {
        fail('empty');
      };
      recognition.onend = () => {
        if (ended) return;
        ended = true;
        endMeter();
        if (active === recognition) active = null;
        detachInput();
        recognition.onend = null;
        complete();
        if (!cancelled && !failed) callbacks.ended();
      };
      try {
        recognition.start();
      } catch (error) {
        ended = true;
        active = null;
        detachInput();
        recognition.onend = null;
        complete();
        throw error;
      }
      return {
        stop: () => {
          if (ended || cancelled || stopping) return;
          stopping = true;
          endMeter();
          try {
            recognition.stop();
          } catch (error) {
            stopping = false;
            throw error;
          }
        },
        abort: () => {
          if (ended) return Promise.resolve();
          if (drain !== null) return drain;
          cancelled = true;
          endMeter();
          detachInput();
          drain = new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 2000);
            void completion.then(() => {
              clearTimeout(timer);
              resolve();
            });
          });
          try {
            recognition.abort();
          } catch {
            // Keep the active lock until end, a failed abort cannot prove the microphone stopped.
          }
          // A missing end bounds the wait but keeps new captures blocked until the old end arrives.
          return drain;
        },
      };
    },
  };
}
