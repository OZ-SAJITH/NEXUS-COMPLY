import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CornerDownLeft, FileSearch, GitPullRequest, MapPin, Search } from "lucide-react";
import type { ChangeRequest } from "@nexus/shared-types";
import type { AuditRecord } from "../types";
import type { NavSection } from "./AppShell";
import { api } from "../services/api";
import { cn } from "../utils/cn";

interface Entry {
  key: string;
  href: string;
  label: string;
  sublabel?: string;
  group: string;
  icon: "nav" | "audit" | "change";
}

function timeAgo(iso: string): string {
  const s = Date.now() - new Date(iso).getTime();
  const days = Math.floor(s / 86400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export function CommandPalette({ open, onClose, nav }: { open: boolean; onClose: () => void; nav: NavSection[] }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [changes, setChanges] = useState<ChangeRequest[]>([]);
  const [ready, setReady] = useState(false);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setSel(0);
    setReady(false);
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    if (audits.length === 0)
      api.listAudits().then(setAudits).catch(() => setAudits([]));
    if (changes.length === 0)
      api.gov.changes().then(setChanges).catch(() => setChanges([]));
    setReady(true);
    return () => clearTimeout(t);
  }, [open, audits.length, changes.length]);

  useEffect(() => {
    setSel(0);
  }, [q]);

  const navEntries: Entry[] = useMemo(
    () =>
      nav.flatMap((s) =>
        s.items.map((i) => ({
          key: `nav-${i.to}`,
          href: i.to,
          label: i.label,
          sublabel: s.title,
          group: "Navigation",
          icon: "nav" as const,
        }))
      ),
    [nav]
  );

  const entries = useMemo(() => {
    const all: Entry[] = [
      ...navEntries,
      ...changes.map((c) => ({
        key: `chg-${c.id}`,
        href: `/app/governance/changes/${c.id}`,
        label: c.title,
        sublabel: `Change ${c.status} · ${c.risk} risk`,
        group: "Change requests",
        icon: "change" as const,
      })),
      ...audits.map((a) => ({
        key: `audit-${a.id}`,
        href: `/app/audits/${a.id}`,
        label: a.configurationName,
        sublabel: `${a.vendor.toUpperCase()} audit · ${a.completedAt ? timeAgo(a.completedAt) : "pending"}`,
        group: "Audits",
        icon: "audit" as const,
      })),
    ];
    const term = q.trim().toLowerCase();
    if (!term) return all;
    return all.filter((e) => `${e.label} ${e.sublabel ?? ""}`.toLowerCase().includes(term));
  }, [navEntries, changes, audits, q]);

  const groups = useMemo(() => {
    const order = ["Navigation", "Change requests", "Audits"];
    const map = new Map<string, Entry[]>();
    for (const e of entries) {
      const arr = map.get(e.group) ?? [];
      arr.push(e);
      map.set(e.group, arr);
    }
    return order.filter((g) => map.has(g)).map((g) => ({ name: g, items: map.get(g) ?? [] }));
  }, [entries]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${sel}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;

  const go = (href: string) => {
    onClose();
    navigate(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, entries.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
      return;
    }
    if (e.key === "Enter" && entries[sel]) {
      go(entries[sel].href);
    }
  };

  const iconFor = (kind: Entry["icon"], active: boolean) => {
    const cls = cn("w-3.5 h-3.5", active ? "text-accent" : "text-slate-500");
    if (kind === "audit") return <FileSearch className={cls} aria-hidden="true" />;
    if (kind === "change") return <GitPullRequest className={cls} aria-hidden="true" />;
    return <MapPin className={cls} aria-hidden="true" />;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm modal-back" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-lg rounded-xl glass shadow-lift border border-surface-600 overflow-hidden modal-panel">
        <div className="flex items-center gap-2.5 px-4 border-b border-surface-700/60">
          <Search className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            className="flex-1 py-4 bg-transparent outline-none text-sm text-slate-100 placeholder:text-slate-500"
            placeholder="Type a command, audit, change request or destination…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Search the workspace"
          />
          <kbd className="text-[10px] text-slate-500 border border-surface-600 rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-auto p-1.5">
          {!ready ? (
            <div className="px-3 py-6 text-center text-xs text-slate-500">Loading workspace index…</div>
          ) : entries.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-slate-500">No matches for &ldquo;{q}&rdquo;.</div>
          ) : (
            groups.map((g) => (
              <div key={g.name} className="mb-1">
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{g.name}</div>
                {g.items.map((e) => {
                  const idx = entries.indexOf(e);
                  const active = idx === sel;
                  return (
                    <button
                      key={e.key}
                      data-idx={idx}
                      className={cn("w-full text-left px-3 py-2 rounded-md flex items-center gap-2.5 transition-colors", active ? "bg-accent/10 border border-accent/20" : "border border-transparent")}
                      onMouseEnter={() => setSel(idx)}
                      onClick={() => go(e.href)}
                    >
                      {iconFor(e.icon, active)}
                      <span className="flex-1 min-w-0">
                        <span className={cn("block text-xs truncate", active ? "text-accent font-medium" : "text-slate-200")}>{e.label}</span>
                        {e.sublabel ? <span className="block text-[10px] text-slate-500 truncate">{e.sublabel}</span> : null}
                      </span>
                      {active ? <CornerDownLeft className="w-3 h-3 text-accent shrink-0" aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 border-t border-surface-700/60 text-[10px] text-slate-500">
          <span className="flex items-center gap-1"><kbd className="border border-surface-600 rounded px-1">↑</kbd><kbd className="border border-surface-600 rounded px-1">↓</kbd> navigate</span>
          <span className="flex items-center gap-1"><kbd className="border border-surface-600 rounded px-1">↵</kbd> open</span>
          <span className="ml-auto">Ctrl+K to open</span>
        </div>
      </div>
    </div>
  );
}