import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google"; // 1. Switched to Inter
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SupabaseProvider } from "@/lib/supabase/provider";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { MobileNav } from "@/components/MobileNav";
import { AppProvider } from "@/contexts/AppContext";
import { VoiceExpenseWidget } from "@/components/VoiceExpenseWidget";

// 2. Configure Inter
const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TrackWise",
  description: "Track your expenses effortlessly with AI power.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TrackWise",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    //added no translate so google dont force translate the rupee symbol
    <html lang="en" translate="no" suppressHydrationWarning>
      <meta name="google" content="notranslate" />
      {/* 3. Apply Inter directly */}
      <body className={`${inter.className} bg-very-light-blue`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SupabaseProvider>
            <AppProvider>
              {children}
              <MobileNav />
              <VoiceExpenseWidget />
            </AppProvider>
            <Sonner />
          </SupabaseProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}