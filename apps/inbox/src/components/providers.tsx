"use client";

import { Toaster } from "@intentlock/ui/components/sonner";

import { ThemeName } from "@/lib/enums/theme-name.enum";

import { ThemeProvider } from "./theme-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={ThemeName.SYSTEM}
      enableSystem
      disableTransitionOnChange
    >
      {children}
      <Toaster richColors />
    </ThemeProvider>
  );
}
