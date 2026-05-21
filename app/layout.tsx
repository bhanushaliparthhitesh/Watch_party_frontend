import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "WatchParty — Watch Together, Feel Together",
  description:
    "Create or join a watch party room to stream videos in sync with friends in real time.",
  keywords: ["watch party", "sync streaming", "watch together", "live rooms"],
  openGraph: {
    title: "WatchParty",
    description: "Watch videos in sync with friends.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased bg-gray-950 text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
