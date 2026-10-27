import type { Metadata } from "next";
import { Suspense } from "react";
import "@fontsource-variable/manrope";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Veyra",
  description: "Video, with care and clarity.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <Suspense
          fallback={
            <main className="app-boot" role="status">
              <span className="boot-mark">V</span>
              <p>Opening your workspace…</p>
            </main>
          }
        >
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
