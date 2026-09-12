import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { ServiceWorkerRegistration } from "./sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Manager",
  description:
    "Mobile-first project management: charter, stakeholders, meetings, financials, risks, to-dos and reports.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Reading headers() opts every page into dynamic rendering so the
  // per-request CSP nonce from src/proxy.ts applies to framework scripts.
  await headers();
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
