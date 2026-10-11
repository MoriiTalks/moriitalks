interface DeviceVoice {
  identifier: string;
  language: string;
  quality: string;
}

// Older Android locales report Indonesian as "in", match language codes rather than prefixes.
export function selectDeviceVoice(voices: readonly DeviceVoice[], locale: 'id' | 'en') {
  const matching = voices.filter((voice) => {
    const language = voice.language.toLowerCase().split(/[-_]/)[0];
    return (language === 'in' ? 'id' : language) === locale;
  });
  return matching.find((voice) => voice.quality === 'Enhanced') ?? matching[0];
}
