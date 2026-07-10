import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EvalRAG — Experiment Decision Workspace",
  description: "An inspectable product experimentation analyst with deterministic diagnostics and policy checks.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
