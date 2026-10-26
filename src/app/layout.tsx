import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Blueprint §6: Inter with tabular numerals.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PeerSet",
  description:
    "First-pass trading comps from SEC filings, with every number traceable to its filing.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
