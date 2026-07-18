import { getOpenAI, openAIError } from "../../../../lib/openai";

export async function POST(request: Request) {
  try {
    const { text } = await request.json() as { text?: string };
    const input = String(text || "").trim().slice(0, 3_000);
    if (!input) return Response.json({ error: "Text is required." }, { status: 400 });
    const { client, speechModel } = await getOpenAI();
    const speech = await client.audio.speech.create({ model: speechModel, voice: "coral", input });
    return new Response(await speech.arrayBuffer(), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (error) {
    return openAIError(error);
  }
}
