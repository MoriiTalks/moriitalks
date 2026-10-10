// Declares the public voice API address, provider credentials belong on the server.
declare namespace NodeJS {
  interface ProcessEnv {
    readonly EXPO_PUBLIC_VOICE_API_URL?: string;
  }
}
