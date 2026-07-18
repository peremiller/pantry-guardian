import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "../../../db";
import { pantryDonations } from "../../../db/schema";
import { getOpenAI } from "../../../lib/openai";

const dateOnly = () => new Date().toISOString().slice(0, 10);

function daysUntil(date: string) {
  const today = new Date(`${dateOnly()}T00:00:00Z`).getTime();
  const expiry = new Date(`${date}T00:00:00Z`).getTime();
  return Math.ceil((expiry - today) / 86_400_000);
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const friendly = message.includes("no such table")
    ? "The public pantry is being prepared. Please try again shortly."
    : message;
  return Response.json({ error: friendly }, { status: 500 });
}

export async function GET() {
  try {
    const db = await getDb();
    const donations = await db
      .select()
      .from(pantryDonations)
      .where(and(eq(pantryDonations.claimed, false), gte(pantryDonations.expiryDate, dateOnly())))
      .orderBy(pantryDonations.expiryDate, desc(pantryDonations.createdAt))
      .limit(60);
    return Response.json({ donations });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const foodName = String(payload.foodName || "").trim();
    const quantity = String(payload.quantity || "").trim();
    const expiryDate = String(payload.expiryDate || "").trim();
    const pickupArea = String(payload.pickupArea || "").trim();
    const status = String(payload.status || "Available");
    const safeToShare = payload.safeToShare === true;
    const remainingDays = daysUntil(expiryDate);

    if (!foodName || !quantity || !expiryDate || !pickupArea) {
      return Response.json({ error: "Food, quantity, expiry, and pickup area are required." }, { status: 400 });
    }
    if (!safeToShare || !["Available", "Opened"].includes(status)) {
      return Response.json({ error: "Only food confirmed safe to share can be donated." }, { status: 400 });
    }
    if (remainingDays < 0) {
      return Response.json({ error: "Expired food cannot be posted for donation." }, { status: 400 });
    }
    if (remainingDays > 3) {
      return Response.json({ error: "Public Pantry is reserved for food expiring within 3 days." }, { status: 400 });
    }

    const publicText = [
      foodName,
      pickupArea,
      payload.pickupDetails,
      payload.donorName,
      payload.contact,
      payload.note,
    ].filter(Boolean).join("\n").slice(0, 1_500);
    const { client } = await getOpenAI();
    const moderation = await client.moderations.create({
      model: "omni-moderation-latest",
      input: publicText,
    });
    if (moderation.results[0]?.flagged) {
      return Response.json({ error: "This public listing needs changes before it can be posted." }, { status: 400 });
    }

    const db = await getDb();
    const [donation] = await db.insert(pantryDonations).values({
      foodName,
      quantity,
      expiryDate,
      pickupArea,
      pickupDetails: String(payload.pickupDetails || "").trim().slice(0, 180),
      donorName: String(payload.donorName || "Community member").trim().slice(0, 80),
      contact: String(payload.contact || "").trim().slice(0, 120),
      note: String(payload.note || "").trim().slice(0, 220),
      image: typeof payload.image === "string" ? payload.image.slice(0, 700_000) : null,
    }).returning();
    return Response.json({ donation }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json()) as { id?: number };
    if (!payload.id) return Response.json({ error: "Donation ID is required." }, { status: 400 });
    const db = await getDb();
    const [donation] = await db
      .update(pantryDonations)
      .set({ claimed: true })
      .where(eq(pantryDonations.id, payload.id))
      .returning();
    return Response.json({ donation });
  } catch (error) {
    return errorResponse(error);
  }
}
