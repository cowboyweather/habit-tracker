import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SeasonTheme } from "@/components/SeasonTheme";

export const metadata: Metadata = {
  title: "Habit Tracker",
  description: "Track your habits, one season at a time.",
  icons: {
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Habit Tracker",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#E8F1F0",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <SeasonTheme />
        {children}
      </body>
    </html>
  );
}
