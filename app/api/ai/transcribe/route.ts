import { getOpenAI, openAIError } from "../../../../lib/openai";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return Response.json({ error: "An audio recording is required." }, { status: 400 });
    }
    if (audio.size > 12_000_000) {
      return Response.json({ error: "Recording must be smaller than 12 MB." }, { status: 413 });
    }
    const { client, transcriptionModel } = await getOpenAI();
    const result = await client.audio.transcriptions.create({ file: audio, model: transcriptionModel });
    return Response.json({ text: result.text });
  } catch (error) {
    return openAIError(error);
  }
}
