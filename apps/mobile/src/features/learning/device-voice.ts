interface DeviceVoice {
  identifier: string;
  language: string;
  quality: string;
}

// Voice discovery may stall, callers can still offer readable text without blocking later audio.
export async function loadDeviceVoices<T extends DeviceVoice>(
  load: () => Promise<T[]>,
): Promise<readonly T[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      load(),
      new Promise<T[]>((resolve) => {
        timer = setTimeout(() => {
          resolve([]);
        }, 4000);
      }),
    ]);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// Older Android locales report Indonesian as "in", match language codes rather than prefixes.
export function selectDeviceVoice(voices: readonly DeviceVoice[], locale: 'id' | 'en') {
  const matching = voices.filter((voice) => {
    const language = voice.language.toLowerCase().split(/[-_]/)[0];
    return (language === 'in' ? 'id' : language) === locale;
  });
  return matching.find((voice) => voice.quality === 'Enhanced') ?? matching[0];
}
