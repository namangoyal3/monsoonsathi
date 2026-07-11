import { setTimeout as delay } from 'node:timers/promises';

import { getGeminiApiKey, getGeminiModel } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { GEMINI_RESPONSE_SCHEMA } from '@/lib/gemini-schema';

async function waitBeforeRetry(ms: number, signal: AbortSignal): Promise<void> {
  try {
    await delay(ms, undefined, { signal });
  } catch {
    throw new AppError(
      'GEMINI_UNAVAILABLE',
      'The AI service did not respond in time. Please try again.',
      503
    );
  }
}

/**
 * Low-level Gemini generateContent client with bounded retries.
 * Always a real network call — never returns canned plan text.
 */
export async function geminiComplete(
  system: string,
  user: string,
  signal: AbortSignal,
  onCall: () => void,
  useSchema = true,
  transientRetried = false
): Promise<string> {
  const key = getGeminiApiKey();
  const model = getGeminiModel();
  const generationConfig: Record<string, unknown> = {
    responseMimeType: 'application/json',
    maxOutputTokens: 8192,
    temperature: 0.3,
  };
  if (useSchema) {
    generationConfig.responseJsonSchema = GEMINI_RESPONSE_SCHEMA;
  }

  onCall();
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig,
        }),
        signal,
      }
    );
  } catch (error) {
    const aborted =
      signal.aborted ||
      (error instanceof Error && error.name === 'AbortError');
    console.error(
      JSON.stringify({
        code: 'GEMINI_FETCH_FAILED',
        errorName: error instanceof Error ? error.name : 'UnknownError',
      })
    );
    if (!aborted && !transientRetried) {
      await waitBeforeRetry(1200, signal);
      return geminiComplete(system, user, signal, onCall, useSchema, true);
    }
    throw new AppError(
      'GEMINI_UNAVAILABLE',
      'The AI service did not respond in time. Please try again.',
      503
    );
  }

  if (!res.ok) {
    console.error(
      JSON.stringify({
        code: 'GEMINI_HTTP_DETAIL',
        status: res.status,
      })
    );
    if (useSchema && res.status === 400) {
      return geminiComplete(system, user, signal, onCall, false, transientRetried);
    }
    if (
      !transientRetried &&
      !signal.aborted &&
      (res.status === 429 || res.status >= 500)
    ) {
      await waitBeforeRetry(res.status === 429 ? 2500 : 1200, signal);
      return geminiComplete(system, user, signal, onCall, useSchema, true);
    }
    throw new AppError(
      'GEMINI_HTTP',
      res.status === 429
        ? 'The AI service is busy. Please wait a moment and try again.'
        : 'The AI service could not create a plan. Please try again.',
      res.status === 429 ? 503 : 502
    );
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new AppError(
      'GEMINI_INVALID_RESPONSE',
      'The AI service returned an unreadable response. Please try again.',
      502
    );
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError(
      'GEMINI_INVALID_RESPONSE',
      'The AI service returned an unexpected response. Please try again.',
      502
    );
  }

  const data = payload as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
    }[];
    promptFeedback?: { blockReason?: string };
  };

  if (data.promptFeedback?.blockReason) {
    throw new AppError(
      'GEMINI_BLOCKED',
      'The AI service could not safely process that request. Try removing sensitive or instruction-like text.',
      502
    );
  }

  const finishReason = data.candidates?.[0]?.finishReason;
  if (
    finishReason &&
    ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'].includes(
      finishReason
    )
  ) {
    throw new AppError(
      'GEMINI_BLOCKED',
      'The AI service could not safely process that request. Try removing sensitive or instruction-like text.',
      502
    );
  }

  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ??
    '';
  if (!text.trim()) {
    if (useSchema) {
      return geminiComplete(system, user, signal, onCall, false, transientRetried);
    }
    throw new AppError('GEMINI_EMPTY', 'Gemini returned an empty response.', 502);
  }
  return text;
}
