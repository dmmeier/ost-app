import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Newsreader } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ost-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ost-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const newsreader = Newsreader({
  variable: "--font-ost-display",
  subsets: ["latin"],
  axes: ["opsz"],
});

export const viewport: Viewport = {
  themeColor: "#f8f6f0",
};

export const metadata: Metadata = {
  title: "OST app",
  description: "Create, track, and refine Opportunity Solution Trees",
  icons: { icon: "/favicon.svg" },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${newsreader.variable} antialiased`}
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
