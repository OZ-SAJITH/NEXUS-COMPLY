import { useMemo, useState } from "react";
import { cn } from "../utils/cn";

export interface HighlightRange {
  lineStart: number;
  lineEnd: number;
  color?: "fail" | "warn" | "pass";
}

interface Props {
  content: string;
  highlights?: HighlightRange[];
  vendorLabel?: string;
}

function simpleHighlight(line: string): { text: string; cls: string }[] {
  // Minimal syntax coloring for configuration-ish text.
  const parts: { text: string; cls: string }[] = [];

  let rest = line;
  while (rest.length > 0) {
    const quote = rest.match(/^("[^"]*"|'[^']*')/);
    if (quote) {
      parts.push({ text: quote[0], cls: "text-amber-300" });
      rest = rest.slice(quote[0].length);
      continue;
    }
    const comment = rest.match(/^(!|#|\/\/).*$/);
    if (comment) {
      parts.push({ text: rest, cls: "text-slate-600 italic" });
      break;
    }
    const keyword = rest.match(/^(config |set |edit |end|exit|interface |line |enable |service |no |edit\s?)/);
    if (keyword) {
      parts.push({ text: keyword[0], cls: "text-sky-400" });
      rest = rest.slice(keyword[0].length);
      continue;
    }
    const ip = rest.match(/^(\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?)/);
    if (ip) {
      parts.push({ text: ip[0], cls: "text-violet-300" });
      rest = rest.slice(ip[0].length);
      continue;
    }
    const num = rest.match(/^(\d+)/);
    if (num) {
      parts.push({ text: num[0], cls: "text-teal-300" });
      rest = rest.slice(num[0].length);
      continue;
    }
    parts.push({ text: rest[0], cls: "text-slate-300" });
    rest = rest.slice(1);
  }
  return parts;
}

export function ConfigViewer({ content, highlights = [], vendorLabel }: Props) {
  const lines = useMemo(() => content.split(/\r?\n/), [content]);
  const [query, setQuery] = useState("");
  const [matchLines, setMatchLines] = useState<Set<number>>(new Set());
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const searched = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    const matches: number[] = [];
    lines.forEach((l, i) => {
      if (l.toLowerCase().includes(q)) matches.push(i);
    });
    return matches;
  }, [query, lines]);

  const goToFirstMatch = () => {
    if (searched && searched.length) {
      setMatchLines(new Set(searched));
      setActiveIdx(searched[0]);
    }
  };

  const activeRanges = useMemo(
    () => highlights.filter((h) => activeIdx !== null && h.lineStart - 1 === activeIdx),
    [highlights, activeIdx]
  );

  return (
    <div className="rounded-xl border border-surface-700 bg-surface-900 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-700 bg-surface-850">
        {vendorLabel ? (
          <span className="chip border border-accent/40 bg-accent/10 text-accent">{vendorLabel}</span>
        ) : null}
        <span className="text-xs text-slate-500">{lines.length} lines</span>
        <div className="flex-1" />
        <input
          className="input w-56 !py-1 text-xs"
          placeholder="Search configuration…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIdx(null);
            if (!e.target.value.trim()) setMatchLines(new Set());
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") goToFirstMatch();
          }}
        />
      </div>
      <div className="max-h-[520px] overflow-auto font-mono text-[12.5px] leading-[1.5]">
        {lines.map((line, i) => {
          const rangeHit = highlights.find((h) => i + 1 >= h.lineStart && i + 1 <= h.lineEnd);
          const isMatch = matchLines.has(i);
          const isActive = activeIdx === i;
          const isActiveRange = activeRanges.length > 0 && i >= activeRanges[0].lineStart - 1 && i <= activeRanges[0].lineEnd - 1;

          return (
            <div
              key={i}
              className={cn(
                "flex hover:bg-surface-800/70",
                rangeHit?.color === "fail" && "bg-red-500/10 hover:bg-red-500/15",
                rangeHit?.color === "warn" && "bg-amber-500/10 hover:bg-amber-500/15",
                rangeHit?.color === "pass" && "bg-emerald-500/10 hover:bg-emerald-500/15",
                isActiveRange && "bg-accent/10",
                isMatch && "bg-sky-500/10",
                isActive && "ring-1 ring-inset ring-accent/50"
              )}
            >
              <span
                className={cn(
                  "w-12 shrink-0 text-right pr-3 select-none text-slate-600",
                  isActive && "text-accent"
                )}
              >
                {i + 1}
              </span>
              <span className="whitespace-pre flex-1 pr-3">
                {simpleHighlight(line).map((p, k) => (
                  <span key={k} className={p.cls}>
                    {p.text}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
      {searched && searched.length === 0 && query.trim() ? (
        <div className="px-4 py-2 text-xs text-slate-500 border-t border-surface-700">No matches for “{query}”</div>
      ) : null}
    </div>
  );
}