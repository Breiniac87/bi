import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { APP_VERSION } from "@/lib/version";
import "./globals.css";

export const metadata: Metadata = {
  title: `E-Commerce Dashboard v${APP_VERSION}`,
  description: "Автономная система сквозной аналитики e-commerce",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ru"
      className="font-sans h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
