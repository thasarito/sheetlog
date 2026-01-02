import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppProvider from "../components/providers";

export const metadata: Metadata = {
  title: "SheetLog",
  description: "Rapid financial logging to Google Sheets",
  applicationName: "SheetLog",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full bg-background">
      <body className="no-tap-highlight min-h-screen min-h-[100dvh] w-full bg-background text-foreground overscroll-none touch-manipulation pt-safe pb-safe pl-safe pr-safe">
        <AppProvider>
          <div className="flex min-h-[100dvh] w-full flex-col">
            {children}
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
