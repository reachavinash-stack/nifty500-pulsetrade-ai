import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nifty500 PulseTrade AI",
  description: "NSE Nifty 500 Swing Screener & Regulatory Sentiment Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
