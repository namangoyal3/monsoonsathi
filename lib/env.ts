/** Server-only environment access. Never import from client components. */

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(`${name} is not configured on the server.`);
  }
  return v;
}

export function getGeminiApiKey(): string {
  return required('GEMINI_API_KEY');
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || 'gemini-flash-lite-latest';
}

export function getOpenWeatherApiKey(): string {
  return required('OPENWEATHER_API_KEY');
}
