import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Igor | Your agent. With taste.",
  description:
    "Bring a goal. Igor helps you research, plan, compare and create with your taste in mind.",
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
