import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import "../index.css";
import Providers from "@/components/providers";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-mono-code", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Intentlock",
  description: "Approval inbox and audit log for Intentlock",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${mono.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
