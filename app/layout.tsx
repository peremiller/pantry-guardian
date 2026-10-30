import type { Metadata } from "next";
import { OfflineProvider } from "./offline-provider";
import { AuthProvider } from "./auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pantry Guardian — Waste less, share more",
  description: "Track food, rescue items before expiry, visualize storage, and safely share surplus food.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Pantry Guardian" },
  metadataBase: new URL("https://pantry-guardian-nine.vercel.app"),
  alternates: { canonical: "/" },
  icons: {
    icon: "/favicon-v4.ico",
    shortcut: "/favicon-v4.ico",
    apple: "/pantry-guardian-logo-v4.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body><OfflineProvider><AuthProvider>{children}</AuthProvider></OfflineProvider></body>
    </html>
  );
}
