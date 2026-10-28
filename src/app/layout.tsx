import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SITE_DESCRIPTION } from "@/lib/site";
import { SiteFooter } from "@/ui/SiteFooter";
import { SiteHeader } from "@/ui/SiteHeader";
import "./globals.css";

// Blueprint §6: Inter with tabular numerals.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "PeerSet", template: "%s · PeerSet" },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: "PeerSet",
    description: SITE_DESCRIPTION,
    siteName: "PeerSet",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <div className="flex flex-1 flex-col">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
