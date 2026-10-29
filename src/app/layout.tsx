import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "BookLeaf Author Support", description: "Author support & communication portal" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
