import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { LiveAnnouncer } from "@/components/ui/announcer";
import { Toaster } from "@/components/ui/toast";
import { ThemeProvider, themeInitScript } from "@/components/theme/theme-provider";
import { messages } from "@/lib/messages";
import { ServiceWorkerRegistration } from "./sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: messages.app.name,
    template: `%s · ${messages.app.name}`,
  },
  description:
    "Mobile-first project management: charter, stakeholders, meetings, financials, risks, to-dos and reports.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The per-request CSP nonce (src/proxy.ts) also nonces the pre-paint theme
  // script; reading headers() keeps every page dynamic so the nonce applies.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <ThemeProvider>
          <LiveAnnouncer>
            <Toaster>{children}</Toaster>
          </LiveAnnouncer>
        </ThemeProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
