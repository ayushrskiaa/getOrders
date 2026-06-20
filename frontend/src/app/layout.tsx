import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OrderHub",
  description: "Unified order intelligence for Amazon, Flipkart, and Zepto."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
