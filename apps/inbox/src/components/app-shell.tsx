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
import {
  Activity,
  Bot,
  ChevronsUpDown,
  Hand,
  LayoutGrid,
  ListChecks,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PlaySquare,
  Rocket,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  X,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { createContext, use, useEffect, useState } from "react";
import { z } from "zod";

import { BrandMark } from "@/components/brand-mark";
import Loader from "@/components/loader";
import { api } from "@/lib/api";
import { LOGIN_PATH } from "@/lib/constants";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { ThemeName } from "@/lib/enums/theme-name.enum";
import { initials } from "@/lib/format";
import { License, Me } from "@/lib/schemas";

type NavItem = { href: Route; label: string; icon: React.ComponentType<{ className?: string }> };

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Monitor",
    items: [
      { href: "/", label: "Overview", icon: LayoutGrid },
      { href: "/activity", label: "Activity", icon: Activity },
      { href: "/holds", label: "Holds", icon: Hand },
      { href: "/audit", label: "Audit", icon: ShieldCheck },
    ],
  },
  {
    section: "Configure",
    items: [
      { href: "/agents", label: "Agents", icon: Bot },
      { href: "/team", label: "Team", icon: Users },
    ],
  },
  {
    section: "General",
    items: [
      { href: "/account", label: "Account settings", icon: Settings },
      { href: "/demo", label: "Demo", icon: PlaySquare },
    ],
  },
];

const ALL_ITEMS = NAV.flatMap((s) => s.items);
const CRUMBS: (Omit<NavItem, "href"> & { href: string })[] = [
  ...ALL_ITEMS,
  { href: "/welcome", label: "Get started", icon: Rocket },
  { href: "/runs", label: "Run", icon: ListChecks },
];

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

function ThemeItems() {
  const { setTheme } = useTheme();
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>Theme</DropdownMenuLabel>
      <DropdownMenuItem onClick={() => setTheme(ThemeName.LIGHT)}>
        <Sun /> Light
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setTheme(ThemeName.DARK)}>
        <Moon /> Dark
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setTheme(ThemeName.SYSTEM)}>
        <Monitor /> System
      </DropdownMenuItem>
    </DropdownMenuGroup>
  );
}

function UserCard({ me }: { me: Me }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-xl border bg-card p-2 text-left shadow-xs outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        }
      >
        <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
          {initials(me.email)}
          <span className="absolute right-0 bottom-0 size-2 rounded-full bg-success ring-2 ring-card" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{me.email}</span>
          <span className="block text-xs text-muted-foreground capitalize">{me.role}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="truncate text-sm text-foreground">{me.email}</div>
            <div className="capitalize">{me.role}</div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/account" />}>
          <Settings /> Account settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ThemeItems />
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Sidebar({
  me,
  license,
  pathname,
  onNavigate,
}: {
  me: Me;
  license: License | null;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-5 p-3">
      <div className="flex items-center gap-2.5 px-1.5 pt-1">
        <BrandMark />
        <div className="min-w-0">
          <div className="text-[15px] leading-tight font-semibold tracking-tight">Intentlock</div>
          <div className="truncate text-xs text-muted-foreground capitalize">
            {license ? `${license.edition} edition` : " "}
          </div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto" aria-label="Main">
        {NAV.map(({ section, items }) => (
          <div key={section} className="grid gap-0.5">
            <div className="px-2.5 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              {section}
            </div>
            {items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-1.5 text-sidebar-foreground outline-none hover:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-ring/40",
                    active &&
                      "border-sidebar-border bg-sidebar-accent font-medium text-foreground shadow-xs",
                  )}
                >
                  <Icon
                    className={cn("size-4", active ? "text-foreground" : "text-muted-foreground")}
                  />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <UserCard me={me} />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [license, setLicense] = useState<License | null>(null);
  const [failed, setFailed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (!drawer) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [drawer]);

  useEffect(() => {
    api(API_ENDPOINTS.ME, Me).then(setMe, () => setFailed(true));
    api(API_ENDPOINTS.LICENSE, License).then(setLicense, () => undefined);
  }, []);

  if (failed)
    return <p className="p-8 text-center text-sm text-muted-foreground">Can't reach the server.</p>;
  if (!me) return <Loader />;

  const current = CRUMBS.find((i) => isActive(pathname, i.href));

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 bg-sidebar md:block">
        <Sidebar me={me} license={license} pathname={pathname} />
      </aside>
      {drawer && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-foreground/20 backdrop-blur-[1px]"
            onClick={() => setDrawer(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r bg-sidebar shadow-xl">
            <Sidebar
              me={me}
              license={license}
              pathname={pathname}
              onNavigate={() => setDrawer(false)}
            />
          </div>
        </div>
      )}
      <div className="min-w-0 flex-1 md:py-3 md:pr-3">
        <div className="flex min-h-svh flex-col bg-card md:min-h-[calc(100svh-1.5rem)] md:rounded-2xl md:border md:shadow-xs">
          <header className="flex h-14 items-center gap-2 border-b border-dashed px-4 md:px-6">
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              aria-label="Open menu"
              onClick={() => setDrawer(true)}
            >
              {drawer ? <X /> : <Menu />}
            </Button>
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
              {current && <current.icon className="size-4 shrink-0 text-muted-foreground" />}
              <span className="text-muted-foreground">Intentlock</span>
              <span className="text-muted-foreground/60">/</span>
              <span className="truncate font-medium">{current?.label}</span>
            </nav>
          </header>
          <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
            <MeContext value={me}>{children}</MeContext>
          </main>
        </div>
      </div>
    </div>
  );
}
