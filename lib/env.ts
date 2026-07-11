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
  return process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash';
}

export function getGoogleMapsApiKey(): string | null {
  const v = process.env.GOOGLE_MAPS_API_KEY?.trim();
  return v || null;
}
