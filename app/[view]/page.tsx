import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PantryWorkspace from "../pantry-workspace";
import { pageTitles, pageDescriptions } from "../../lib/navigation";

type PageProps = { params: Promise<{ view: string }> };
export function generateStaticParams() {
  return Object.keys(pageTitles).filter(path=>path!=="/").map(path=>({view:path.slice(1)}));
}
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { view } = await params;
  const path=`/${view}`;
  return pageTitles[path] ? {title:`${pageTitles[path]} · Pantry Guardian`,description:pageDescriptions[path],alternates:{canonical:path}} : {};
}
export default async function RoutedPantryGuardianPage({ params }: PageProps) {
  const { view } = await params;
  if (!Object.hasOwn(pageTitles,`/${view}`)) notFound();
  return <PantryWorkspace />;
}
