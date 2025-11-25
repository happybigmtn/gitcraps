import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SolanaProvider } from "@/providers/SolanaProvider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OreCraps - Dice Mining on Solana",
  description:
    "Mine ORE tokens by predicting dice rolls. A provably fair mining game on Solana.",
  keywords: ["Solana", "ORE", "mining", "dice", "cryptocurrency", "DeFi"],
  openGraph: {
    title: "OreCraps - Dice Mining on Solana",
    description:
      "Mine ORE tokens by predicting dice rolls. A provably fair mining game on Solana.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background`}
      >
        <SolanaProvider>
          {children}
          <Toaster position="bottom-right" />
        </SolanaProvider>
      </body>
    </html>
  );
}
