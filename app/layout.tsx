import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CuraPulse",
  description: "Calm, credible care: patient app, Doctor workspace, Emergency Support Desk and Admin console.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#176B63",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-canvas text-ink font-ui antialiased">{children}</body>
    </html>
  );
}
