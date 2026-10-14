import { createBrowserSpeech } from './browser-speech';

// Unsupported browsers keep typed turns, supported secure origins use the browser's speech service.
export const speechRecognition = createBrowserSpeech();
