interface SpeechCallbacks {
  started: () => void;
  finished: () => void;
  failed: () => void;
}

interface SpeechDriver {
  stop: () => Promise<void>;
  speak: (text: string, language: string, callbacks: SpeechCallbacks) => void;
}

// Device speech may finish after navigation, only the current audible reply can be acknowledged.
export class PreviewPlayback {
  private generation = 0;
  private pending = Promise.resolve();
  private readonly driver: SpeechDriver;

  constructor(driver: SpeechDriver) {
    this.driver = driver;
  }

  play(text: string, language: string, callbacks: SpeechCallbacks) {
    const generation = ++this.generation;
    let started = false;
    let settled = false;
    const current = () => generation === this.generation && !settled;
    const failed = () => {
      if (!current()) return;
      settled = true;
      callbacks.failed();
    };

    this.pending = this.pending
      .catch(() => undefined)
      .then(async () => {
        if (!current()) return;
        await this.driver.stop();
        if (!current()) return;
        this.driver.speak(text, language, {
          started: () => {
            if (!current() || started) return;
            started = true;
            callbacks.started();
          },
          finished: () => {
            if (!current()) return;
            if (!started) {
              failed();
              return;
            }
            settled = true;
            callbacks.finished();
          },
          failed,
        });
      })
      .catch(failed);
  }

  stop() {
    this.generation += 1;
    // Dispatch cancellation now, a queued stop could interrupt speech on the next screen.
    const stopped = this.driver.stop().catch(() => undefined);
    this.pending = Promise.all([this.pending.catch(() => undefined), stopped]).then(
      () => undefined,
    );
  }
}
