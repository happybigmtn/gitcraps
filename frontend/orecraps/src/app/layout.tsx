import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SolanaProvider } from "@/providers/SolanaProvider";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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
  title: "OreCraps - Dice Game on Solana",
  description:
    "Stake RNG tokens to play dice and earn CRAP tokens. A provably fair game on Solana.",
  keywords: ["Solana", "RNG", "CRAP", "dice", "cryptocurrency", "DeFi", "gaming"],
  openGraph: {
    title: "OreCraps - Dice Game on Solana",
    description:
      "Stake RNG tokens to play dice and earn CRAP tokens. A provably fair game on Solana.",
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
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
          <Toaster position="bottom-right" />
        </SolanaProvider>
      </body>
    </html>
  );
}
