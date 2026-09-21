// app/layout.tsx — Root layout with providers

import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "AlgoLearn India — Learn Algo Trading for NSE & BSE",
  description:
    "Learn algorithmic trading for Indian stock markets (NSE & BSE) with strategy builder, backtester, and interactive trading simulator.",
  keywords: ["algo trading", "NSE", "BSE", "India", "backtesting", "trading strategy", "learn trading"],
  openGraph: {
    title: "AlgoLearn India",
    description: "Learn algorithmic trading for Indian stock markets (NSE & BSE) with strategy builder, backtester, and interactive trading simulator.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <Navbar />
            <main>{children}</main>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
