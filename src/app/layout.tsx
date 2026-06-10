import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Task Calendar",
  description: "Personal task scheduler foundation"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
