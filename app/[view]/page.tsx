import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PantryGuardian from "../page";

const routeTitles = {
  pantry: "Pantry",
  "ai-copilot": "AI Copilot",
  "smart-capture": "Smart Capture",
  "storage-map": "Storage Map",
  "use-soon": "Use Soon",
  "public-pantry": "Public Pantry",
  household: "Household",
  insights: "Insights",
  alerts: "Expiry Alerts",
  preferences: "Food Preferences",
} as const;

type RoutedView = keyof typeof routeTitles;
type PageProps = { params: Promise<{ view: string }> };

export function generateStaticParams() {
  return Object.keys(routeTitles).map((view) => ({ view }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { view } = await params;
  const title = routeTitles[view as RoutedView];
  return title ? { title: `${title} · Pantry Guardian` } : {};
}

export default async function RoutedPantryGuardianPage({ params }: PageProps) {
  const { view } = await params;
  if (!(view in routeTitles)) notFound();
  return <PantryGuardian />;
}
