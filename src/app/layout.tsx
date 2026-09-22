import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MenuGen — Understand unfamiliar menus",
  description:
    "Turn unfamiliar restaurant menus into bilingual visual guides while preserving the original text, prices, and uncertainty.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html data-scroll-behavior="smooth" lang="en">
      <body>{children}</body>
    </html>
  );
}
