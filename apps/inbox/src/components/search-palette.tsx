"use client";

import { Dialog, DialogContent, DialogTitle } from "@intentlock/ui/components/dialog";
import { cn } from "@intentlock/ui/lib/utils";
import { Bot, CornerDownLeft, Search } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAgents } from "@/components/agent-filter";
import { ActivityParam } from "@/lib/enums/activity-param.enum";

type Icon = React.ComponentType<{ className?: string }>;

export type PaletteLink = { href: string; label: string; icon: Icon };

type Item = PaletteLink & { group: string };

function matches(label: string, query: string) {
  return label.toLowerCase().includes(query.toLowerCase());
}

function Results({ pages, onPick }: { pages: PaletteLink[]; onPick: (href: string) => void }) {
  const { agents } = useAgents();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const q = query.trim();

  const items: Item[] = [
    ...pages.filter((p) => matches(p.label, q)).map((p) => ({ ...p, group: "Pages" })),
    ...agents
      .filter((a) => !a.deletedAt && matches(a.name, q))
      .map((a) => ({ href: `/agents/${a.id}`, label: a.name, icon: Bot, group: "Agents" })),
    ...(q
      ? [
          {
            href: `/activity?${new URLSearchParams({ [ActivityParam.Q]: q })}`,
            label: `Search activity for “${q}”`,
            icon: Search,
            group: "Activity",
          },
        ]
      : []),
  ];
  const current = Math.min(active, items.length - 1);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + items.length) % Math.max(items.length, 1));
    } else if (e.key === "Enter" && items[current]) {
      e.preventDefault();
      onPick(items[current].href);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 border-b px-4">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search pages, agents and activity…"
          aria-label="Search"
          role="combobox"
          aria-expanded
          aria-controls="search-results"
          aria-activedescendant={items[current] ? `search-item-${current}` : undefined}
          className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <kbd className="rounded-md border px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground">
          ESC
        </kbd>
      </div>
      <div
        ref={list}
        id="search-results"
        role="listbox"
        className="max-h-[min(60vh,26rem)] overflow-y-auto p-2"
      >
        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">No results</p>
        ) : (
          items.map((item, i) => (
            <div key={item.href}>
              {item.group !== items[i - 1]?.group && (
                <div className="px-3 pt-2 pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  {item.group}
                </div>
              )}
              <div
                id={`search-item-${i}`}
                data-index={i}
                role="option"
                aria-selected={i === current}
                onMouseMove={() => setActive(i)}
                onClick={() => onPick(item.href)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground",
                  i === current && "bg-muted text-foreground",
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {i === current && <CornerDownLeft className="size-3.5 shrink-0" />}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

export function SearchPalette({
  pages,
  onNavigate,
}: {
  pages: PaletteLink[];
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const mac = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full items-center gap-2.5 rounded-lg border bg-card px-3 text-left text-muted-foreground shadow-xs outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate">Search anything</span>
        <kbd className="rounded border bg-muted px-1.5 font-sans text-[11px]">
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle className="sr-only">Search</DialogTitle>
          {open && (
            <Results
              pages={pages}
              onPick={(href) => {
                setOpen(false);
                onNavigate?.();
                router.push(href as Route);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
