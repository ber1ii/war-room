import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthGuard from "@/components/auth-guard";
import ActivityRadar from "@/components/activity-radar";
import SystemVitalsWidget from "@/components/system-vitals";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WAR_ROOM",
  description: "Secure terminal for incident manadgement",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>
        <AuthGuard>
          {children}
          <ActivityRadar />
        </AuthGuard>
      </body>
    </html>
  );
}
