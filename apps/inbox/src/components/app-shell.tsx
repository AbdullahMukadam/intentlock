"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Button } from "@intentlock/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@intentlock/ui/components/dropdown-menu";
import { cn } from "@intentlock/ui/lib/utils";
import { UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, use, useEffect, useState } from "react";
import { z } from "zod";

import Loader from "@/components/loader";
import { ModeToggle } from "@/components/mode-toggle";
import { api } from "@/lib/api";
import { LOGIN_PATH } from "@/lib/constants";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { License, Me } from "@/lib/schemas";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/activity", label: "Activity" },
  { href: "/holds", label: "Holds" },
  { href: "/agents", label: "Agents" },
  { href: "/audit", label: "Audit" },
  { href: "/demo", label: "Demo" },
] as const;

const MeContext = createContext<Me | null>(null);

export function useMe() {
  const me = use(MeContext);
  if (!me) throw new Error("useMe outside the app shell");
  return me;
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

async function signOut() {
  await api(API_ENDPOINTS.AUTH_LOGOUT, z.undefined(), { method: HttpMethod.POST }).catch(
    () => undefined,
  );
  window.location.assign(LOGIN_PATH);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [license, setLicense] = useState<License | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api(API_ENDPOINTS.ME, Me).then(setMe, () => setFailed(true));
    api(API_ENDPOINTS.LICENSE, License).then(setLicense, () => undefined);
  }, []);

  if (failed)
    return <p className="p-8 text-center text-sm text-muted-foreground">Can't reach the server.</p>;
  if (!me) return <Loader />;

  return (
    <div className="grid min-h-svh grid-rows-[auto_1fr_auto]">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-2">
        <nav className="flex items-center gap-1 overflow-x-auto">
          <span className="mr-3 font-semibold">Intentlock</span>
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground",
                isActive(pathname, href) && "bg-muted text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="icon" aria-label="Account" />}
            >
              <UserRound />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <div>{me.email}</div>
                  <div className="text-xs text-muted-foreground">{me.role}</div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">
        <MeContext value={me}>{children}</MeContext>
      </main>
      <footer className="border-t px-4 py-2 text-xs text-muted-foreground">
        {license ? `${license.edition} edition · ${license.licensee}` : " "}
      </footer>
    </div>
  );
}
