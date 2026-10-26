import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Igor | Follow your curiosity",
  description:
    "Discover unexpected connections between music, film, places and people, powered by Qloo taste intelligence.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
