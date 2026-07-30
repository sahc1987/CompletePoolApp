import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Complete Pool Service Inc.",
  description: "Job scheduling, estimates, and materials for Complete Pool Service Inc.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // The font variable must live on <html>: Tailwind's preflight sets
  // `font-family: var(--font-inter), …` on <html>, and an undefined custom
  // property invalidates that declaration entirely — which silently fell back to
  // the browser's default serif.
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
