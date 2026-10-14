export interface BrowserPlaybackVoice {
  identifier: string;
  name: string;
  language: string;
}

export interface BrowserPlaybackOptions {
  language?: string;
  voice?: string;
  rate?: number;
  onStart?: () => void;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: (error: Error) => void;
}

export interface BrowserPlaybackUtterance {
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  speak: () => void;
  clearHandlers: () => void;
}

export interface BrowserPlaybackEnvironment {
  getVoices: () => BrowserPlaybackVoice[];
  addVoicesListener: (listener: () => void) => void;
  removeVoicesListener: (listener: () => void) => void;
  create: (
    text: string,
    voice: BrowserPlaybackVoice,
    language: string,
    rate: number,
  ) => BrowserPlaybackUtterance;
  cancel: () => void;
}

interface ActivePlayback {
  utterance: BrowserPlaybackUtterance;
  environment: BrowserPlaybackEnvironment;
  options: BrowserPlaybackOptions;
}

function languageCode(language: string) {
  const code = language.toLowerCase().split(/[-_]/)[0];
  return code === 'in' ? 'id' : code;
}

export function createBrowserPlayback(environment: () => BrowserPlaybackEnvironment | null) {
  let active: ActivePlayback | null = null;

  function detach(playback: ActivePlayback) {
    playback.utterance.onstart = null;
    playback.utterance.onend = null;
    playback.utterance.onerror = null;
    playback.utterance.clearHandlers();
  }

  function cancel() {
    const previous = active;
    active = null;
    if (previous !== null) detach(previous);
    // Cancellation is dispatched before returning, a future task cannot enqueue old speech.
    (previous?.environment ?? environment())?.cancel();
    previous?.options.onStopped?.();
  }

  return {
    getAvailableVoicesAsync: (): Promise<BrowserPlaybackVoice[]> => {
      const available = environment();
      if (available === null) return Promise.resolve([]);
      try {
        const voices = available.getVoices();
        if (voices.length > 0) return Promise.resolve(voices);
      } catch {
        return Promise.resolve([]);
      }
      return new Promise((resolve) => {
        let settled = false;
        const finish = (voices: BrowserPlaybackVoice[]) => {
          if (settled) return;
          settled = true;
          available.removeVoicesListener(changed);
          clearTimeout(timer);
          resolve(voices);
        };
        const changed = () => {
          try {
            const voices = available.getVoices();
            if (voices.length > 0) finish(voices);
          } catch {
            finish([]);
          }
        };
        const timer = setTimeout(() => {
          finish([]);
        }, 4000);
        available.addVoicesListener(changed);
        // Recheck after registration so a change during initial discovery is not missed.
        changed();
      });
    },
    speak: (text: string, options: BrowserPlaybackOptions = {}): void => {
      let playback: ActivePlayback | null = null;
      try {
        if (active !== null) cancel();
        const available = environment();
        if (available === null) throw new Error('Browser speech is unavailable.');
        const voices = available.getVoices();
        const voice = options.voice
          ? voices.find((candidate) => candidate.identifier === options.voice)
          : voices.find(
              (candidate) =>
                options.language === undefined ||
                languageCode(candidate.language) === languageCode(options.language),
            );
        if (voice === undefined) throw new Error('The selected browser voice is unavailable.');
        const utterance = available.create(
          text,
          voice,
          options.language ?? voice.language,
          options.rate ?? 1,
        );
        playback = { utterance, environment: available, options };
        active = playback;
        const currentPlayback = playback;
        let started = false;
        const current = () => active === currentPlayback;
        const finish = (failed: boolean) => {
          if (!current()) return;
          active = null;
          detach(currentPlayback);
          if (failed || !started) {
            options.onError?.(new Error('Browser speech did not finish.'));
          } else {
            options.onDone?.();
          }
        };
        utterance.onstart = () => {
          if (!current() || started) return;
          started = true;
          options.onStart?.();
        };
        utterance.onend = () => {
          finish(false);
        };
        utterance.onerror = () => {
          finish(true);
        };
        // Voice selection and enqueue share this synchronous call, stop cannot race an await.
        utterance.speak();
      } catch (error) {
        if (playback !== null) {
          if (active !== playback) return;
          active = null;
          detach(playback);
        }
        options.onError?.(error instanceof Error ? error : new Error('Browser speech failed.'));
      }
    },
    stop: (): Promise<void> => {
      try {
        cancel();
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error('Browser speech failed.'));
      }
    },
  };
}
