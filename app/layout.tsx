import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/nav/sidebar";
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
  title: "Northscope · Booking insights",
  description: "Analyze SAP-style journal entries for anomalies and patterns.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/*
       * Shell layout: 240px fixed sidebar (Sidebar component) + scrollable main column.
       * The sidebar is sticky across all routes — no per-route re-implementation needed.
       * See docs/prototype-notes/0001-dashboard-direction.md for layout spec.
       */}
      <body className="h-full bg-stone-50">
        <Sidebar />
        {/* Main column — offset by sidebar width */}
        <div className="ml-60 min-h-full flex flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
