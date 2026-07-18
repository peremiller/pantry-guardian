import OpenAI from "openai";

type RuntimeEnv = Record<string, string | undefined>;

async function runtimeEnv(): Promise<RuntimeEnv> {
  try {
    const { env } = await import("cloudflare:workers");
    return env as unknown as RuntimeEnv;
  } catch {
    return process.env;
  }
}

export async function getOpenAI() {
  const env = await runtimeEnv();
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  return {
    client: new OpenAI({ apiKey: env.OPENAI_API_KEY }),
    textModel: env.OPENAI_TEXT_MODEL || "gpt-5.6",
    transcriptionModel: env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
    speechModel: env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
  };
}

export function openAIError(error: unknown) {
  const status = error instanceof OpenAI.APIError && error.status ? error.status : 503;
  const safeStatus = status >= 400 && status < 500 ? status : 503;
  return Response.json(
    { error: safeStatus === 429 ? "AI is busy right now. Please try again shortly." : "The AI kitchen assistant is temporarily unavailable." },
    { status: safeStatus },
  );
}
