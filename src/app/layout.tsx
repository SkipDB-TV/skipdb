import type { Metadata } from "next";
import "./globals.css";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { NavigationProgress } from "@/components/NavigationProgress";

export const metadata: Metadata = {
  title: {
    default: "SkipDB — open, crowdsourced skip timestamps",
    template: "%s · SkipDB",
  },
  description:
    "Crowdsourced intro, recap, outro and preview timestamps for movies and TV. Open code (AGPL-3.0) and open data (CC BY-NC-SA 4.0).",
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/skipdb_256.png", type: "image/png", sizes: "256x256" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <NavigationProgress />
        <SiteNav />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
