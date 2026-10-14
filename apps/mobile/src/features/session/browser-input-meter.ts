export interface BrowserInputAudio {
  read: (samples: Float32Array<ArrayBuffer>) => boolean;
  close: () => void;
}

async function openBrowserInputAudio(): Promise<BrowserInputAudio | null> {
  if (
    typeof navigator === 'undefined' ||
    typeof AudioContext === 'undefined' ||
    typeof navigator.mediaDevices === 'undefined' ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  )
    return null;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let context: AudioContext | null = null;
  const release = () => {
    for (const track of stream.getTracks()) track.stop();
    if (context !== null) void context.close().catch(() => undefined);
  };
  try {
    context = new AudioContext();
    const audio = context;
    const analyser = audio.createAnalyser();
    analyser.fftSize = 256;
    const source = audio.createMediaStreamSource(stream);
    source.connect(analyser);
    if (audio.state === 'suspended') void audio.resume().catch(() => undefined);
    return {
      read: (samples) => {
        if (audio.state !== 'running') return false;
        analyser.getFloatTimeDomainData(samples);
        return true;
      },
      close: () => {
        release();
        source.disconnect();
        analyser.disconnect();
      },
    };
  } catch {
    release();
    return null;
  }
}

// Only scalar RMS levels leave this local analyser, no audio is stored or uploaded.
export function startBrowserInputMeter(
  level: (value: number | null) => void,
  open: () => Promise<BrowserInputAudio | null> = openBrowserInputAudio,
): () => void {
  let stopped = false;
  let audio: BrowserInputAudio | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const samples = new Float32Array(256);
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    try {
      audio?.close();
    } catch {
      // Meter cleanup must not interrupt speech recognition.
    }
    audio = null;
    level(null);
  };
  const schedule = () => {
    if (!stopped) timer = setTimeout(sample, 100);
  };
  const sample = () => {
    if (stopped || audio === null) return;
    try {
      if (audio.read(samples)) {
        let sum = 0;
        for (const value of samples) sum += value * value;
        level(Math.min(1, Math.sqrt(sum / samples.length)));
      } else level(null);
      schedule();
    } catch {
      stop();
    }
  };
  void Promise.resolve()
    .then(() => (stopped ? null : open()))
    .then((opened) => {
      if (stopped) {
        opened?.close();
        return;
      }
      audio = opened;
      if (audio === null) stop();
      else timer = setTimeout(sample, 100);
    })
    .catch(stop);
  return stop;
}
