import { and, desc, eq, gte } from "drizzle-orm";
import { getOpenAI } from "../../../lib/openai";

type PublicDonation = {
  id: number;
  foodName: string;
  quantity: string;
  expiryDate: string;
  pickupArea: string;
  pickupDetails: string;
  donorName: string;
  contact: string;
  note: string;
  image: string | null;
  claimed: boolean;
  createdAt: string;
};

const dateOnly = () => new Date().toISOString().slice(0, 10);
const isVercel = process.env.VERCEL === "1";

const memory = globalThis as typeof globalThis & {
  pantryGuardianDonations?: PublicDonation[];
};

function memoryStore() {
  memory.pantryGuardianDonations ??= [];
  return memory.pantryGuardianDonations;
}

function daysUntil(date: string) {
  const today = new Date(`${dateOnly()}T00:00:00Z`).getTime();
  const expiry = new Date(`${date}T00:00:00Z`).getTime();
  return Math.ceil((expiry - today) / 86_400_000);
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const friendly = message.includes("no such table")
    ? "The public pantry is being prepared. Please try again shortly."
    : "The public pantry is temporarily unavailable. Please try again.";
  console.error("Public Pantry error", message);
  return Response.json({ error: friendly }, { status: 500 });
}

async function d1() {
  const [{ getDb }, { pantryDonations }] = await Promise.all([
    import("../../../db"),
    import("../../../db/schema"),
  ]);
  return { db: await getDb(), pantryDonations };
}

export async function GET() {
  try {
    if (isVercel) {
      const donations = memoryStore()
        .filter((donation) => !donation.claimed && donation.expiryDate >= dateOnly())
        .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, 60);
      return Response.json({ donations });
    }

    const { db, pantryDonations } = await d1();
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
    if (!Number.isFinite(remainingDays) || remainingDays < 0) {
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

    try {
      const { client } = await getOpenAI();
      const moderation = await client.moderations.create({
        model: "omni-moderation-latest",
        input: publicText,
      });
      if (moderation.results[0]?.flagged) {
        return Response.json({ error: "This public listing needs changes before it can be posted." }, { status: 400 });
      }
    } catch (error) {
      if (!(error instanceof Error && error.message.includes("OPENAI_API_KEY"))) throw error;
    }

    const values = {
      foodName,
      quantity,
      expiryDate,
      pickupArea,
      pickupDetails: String(payload.pickupDetails || "").trim().slice(0, 180),
      donorName: String(payload.donorName || "Community member").trim().slice(0, 80),
      contact: String(payload.contact || "").trim().slice(0, 120),
      note: String(payload.note || "").trim().slice(0, 220),
      image: typeof payload.image === "string" ? payload.image.slice(0, 700_000) : null,
    };

    if (isVercel) {
      const donation: PublicDonation = {
        id: Date.now() * 1_000 + Math.floor(Math.random() * 1_000),
        ...values,
        claimed: false,
        createdAt: new Date().toISOString(),
      };
      memoryStore().unshift(donation);
      return Response.json({ donation }, { status: 201 });
    }

    const { db, pantryDonations } = await d1();
    const [donation] = await db.insert(pantryDonations).values(values).returning();
    return Response.json({ donation }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json()) as { id?: number };
    if (!payload.id) return Response.json({ error: "Donation ID is required." }, { status: 400 });

    if (isVercel) {
      const donation = memoryStore().find((item) => item.id === payload.id);
      if (!donation) return Response.json({ error: "Donation not found." }, { status: 404 });
      donation.claimed = true;
      return Response.json({ donation });
    }

    const { db, pantryDonations } = await d1();
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
