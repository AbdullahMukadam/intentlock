"use client";

import { Toaster } from "@intentlock/ui/components/sonner";
import { QueryClientProvider } from "@tanstack/react-query";

import { ThemeName } from "@/lib/enums/theme-name.enum";
import { getQueryClient } from "@/lib/query-client";

import { ThemeProvider } from "./theme-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <ThemeProvider
        attribute="class"
        defaultTheme={ThemeName.SYSTEM}
        enableSystem
        disableTransitionOnChange
      >
        {children}
        <Toaster richColors />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
