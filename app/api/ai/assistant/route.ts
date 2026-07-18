import { getOpenAI, openAIError } from "../../../../lib/openai";

const MAX_IMAGE_LENGTH = 1_500_000;
const MAX_PROMPT_LENGTH = 2_000;

type PantryItem = {
  name?: unknown;
  quantity?: unknown;
  expiry?: unknown;
  location?: unknown;
  status?: unknown;
};

function inventoryText(items: PantryItem[]) {
  return items.slice(0, 80).map((item) =>
    `${String(item.name || "Food").slice(0, 80)} | ${String(item.quantity || "").slice(0, 40)} | expires ${String(item.expiry || "unknown").slice(0, 10)} | ${String(item.location || "").slice(0, 60)} | ${String(item.status || "Available").slice(0, 20)}`,
  ).join("\n");
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      mode?: string;
      prompt?: string;
      image?: string;
      inventory?: PantryItem[];
      preferences?: Record<string, unknown>;
    };
    const mode = ["chat", "recipes", "vision"].includes(body.mode || "") ? body.mode : "chat";
    const prompt = String(body.prompt || "").trim().slice(0, MAX_PROMPT_LENGTH);
    const image = typeof body.image === "string" ? body.image : "";
    const inventory = Array.isArray(body.inventory) ? body.inventory : [];

    if (!prompt && mode !== "recipes" && !image) {
      return Response.json({ error: "Ask a question or add a photo first." }, { status: 400 });
    }
    if (image && (!image.startsWith("data:image/") || image.length > MAX_IMAGE_LENGTH)) {
      return Response.json({ error: "The image is too large or unsupported." }, { status: 400 });
    }

    const { client, textModel } = await getOpenAI();
    const instructions = `You are Pantry Guardian, a concise food-waste prevention assistant. Today is ${new Date().toISOString().slice(0, 10)}. Prioritize food nearest expiry, give practical steps, and never claim visual or date certainty you do not have. Treat food-safety advice as cautious guidance: when in doubt, tell the user to discard it and consult local official guidance. Never recommend donating expired, spoiled, temperature-abused, opened high-risk, or visibly unsafe food. For recipes, respect the supplied preferences and provide 3 ideas with title, urgent ingredients used, time, and short steps.`;
    const userText = mode === "recipes"
      ? `Create rescue recipes from this pantry. Preferences: ${JSON.stringify(body.preferences || {})}\n\nInventory:\n${inventoryText(inventory)}`
      : `${prompt}\n\nCurrent pantry:\n${inventoryText(inventory)}`;
    const content: Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string; detail: "low" }> = [
      { type: "input_text", text: userText },
    ];
    if (image) content.push({ type: "input_image", image_url: image, detail: "low" });

    const response = await client.responses.create({
      model: textModel,
      instructions,
      input: [{ role: "user", content }],
      max_output_tokens: 900,
    });
    return Response.json({ answer: response.output_text, model: textModel });
  } catch (error) {
    return openAIError(error);
  }
}
