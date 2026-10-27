"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Button } from "@intentlock/ui/components/button";
import { Sheet, SheetContent, SheetTitle } from "@intentlock/ui/components/sheet";
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
  BookOpen,
  Bot,
  ChevronsUpDown,
  Hand,
  KeyRound,
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
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { createContext, use, useEffect, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { FrameCorners } from "@/components/frame-corners";
import Loader from "@/components/loader";
import { api } from "@/lib/api";
import { DOCS_URL } from "@/lib/docs-url";
import { licenseLabel, licenseUrl } from "@/lib/license";
import { ThemeName } from "@/lib/enums/theme-name.enum";
import { initials } from "@/lib/format";
import { useLiveQueries } from "@/lib/live-queries";
import { prefetchPage } from "@/lib/prefetch";
import { SearchPalette } from "@/components/search-palette";
import { License, Me } from "@/lib/schemas";
import { signOut } from "@/lib/sign-out";
import { useApi } from "@/lib/use-api";

type NavItem = { href: Route; label: string; icon: React.ComponentType<{ className?: string }> };

const NAV: { section: string; items: NavItem[]; docs?: boolean }[] = [
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
      { href: "/license", label: "License", icon: KeyRound },
    ],
  },
  {
    section: "General",
    items: [
      { href: "/account", label: "Account settings", icon: Settings },
      { href: "/demo", label: "Demo", icon: PlaySquare },
    ],
    docs: true,
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
  const client = useQueryClient();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
        <BrandMark className="size-7" />
        <div className="min-w-0">
          <div className="text-[15px] leading-tight font-semibold tracking-tight">Intentlock</div>
          <div className="truncate text-xs text-muted-foreground">
            {license ? licenseLabel(license) : " "}
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-5 p-3">
        <SearchPalette pages={CRUMBS.filter((c) => c.href !== "/runs")} onNavigate={onNavigate} />
        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto" aria-label="Main">
          {NAV.map(({ section, items, docs }, i) => (
            <div key={section} className={cn("grid gap-0.5", i === NAV.length - 1 && "mt-auto")}>
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
                    onMouseEnter={() => prefetchPage(client, href, me.role)}
                    onFocus={() => prefetchPage(client, href, me.role)}
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
              {docs && DOCS_URL && (
                <a
                  href={DOCS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-1.5 text-sidebar-foreground outline-none hover:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <BookOpen className="size-4 text-muted-foreground" />
                  Docs
                </a>
              )}
            </div>
          ))}
        </nav>
        <UserCard me={me} />
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  useLiveQueries();
  const license = useApi(licenseUrl, License).data ?? null;

  useEffect(() => {
    api(API_ENDPOINTS.ME, Me).then(setMe, () => setFailed(true));
  }, []);

  if (failed)
    return <p className="p-8 text-center text-sm text-muted-foreground">Can't reach the server.</p>;
  if (!me) return <Loader />;

  const current = CRUMBS.find((i) => isActive(pathname, i.href));

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="sticky top-0 z-20 hidden h-svh w-64 shrink-0 border-r bg-sidebar md:block">
        <Sidebar me={me} license={license} pathname={pathname} />
      </aside>
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent className="gap-0 bg-sidebar md:hidden">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Sidebar
            me={me}
            license={license}
            pathname={pathname}
            onNavigate={() => setDrawer(false)}
          />
        </SheetContent>
      </Sheet>
      <div className="min-w-0 flex-1 overflow-x-clip bg-hatch">
        <div className="mx-auto flex min-h-svh w-full max-w-[1400px] flex-col bg-card min-[1656px]:border-x">
          <header className="relative flex h-14 items-center gap-2 border-b px-4 md:px-6">
            <FrameCorners bottom />
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              aria-label="Open menu"
              onClick={() => setDrawer(true)}
            >
              <Menu />
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
