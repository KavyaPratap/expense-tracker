import type { Metadata, Viewport } from "next";
import { PT_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SupabaseProvider } from "@/lib/supabase/provider";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { MobileNav } from "@/components/MobileNav";
import { AppProvider } from "@/contexts/AppContext";
import { VoiceExpenseWidget } from "@/components/VoiceExpenseWidget";

const ptSans = PT_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
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
    <html lang="en" suppressHydrationWarning>
      <body className={`${ptSans.className} bg-very-light-blue`}>
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
