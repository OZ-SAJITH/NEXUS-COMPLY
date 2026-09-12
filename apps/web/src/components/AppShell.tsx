import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ShieldCheck,
  ListChecks,
  Flag,
  Box,
  Server,
  Network,
  Cpu,
  Plus,
  History,
  FileText,
  Sparkles,
  ShieldAlert,
  Lightbulb,
  ClipboardCheck,
  Settings,
  Search,
  Bell,
  RefreshCw,
  Menu,
  ChevronsLeft,
  ChevronsRight,
  X,
  Globe2,
  Layers,
  GitPullRequest,
  Scale,
  LifeBuoy,
  Boxes,
  ScrollText,
  FlaskConical,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { AnimatedNexusLogo, type NexusLogoState } from "./motion/AnimatedNexusLogo";
import { ErrorBoundary } from "./ErrorBoundary";
import { LoadingScreen } from "./LoadingScreen";
import { CommandPalette } from "./CommandPalette";
import { BackgroundFx } from "./motion/BackgroundFx";
import { cn } from "../utils/cn";
import { useAiMode } from "../hooks/useAiMode";
import { currentUser, sessionRole } from "../session";
import { api } from "../services/api";
import { API_BASE, DEMO_MODE, fetchApi } from "../services/apiConfig";
import { timeAgo } from "../utils/cn";
import type { AuditRecord, DashboardStats } from "../types";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    title: "Main",
    items: [{ to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true }],
  },
  {
    title: "Compliance",
    items: [
      { to: "/app/compliance", label: "Overview", icon: ShieldCheck, end: true },
      { to: "/app/reviews", label: "Human Review", icon: ClipboardCheck },
      { to: "/app/compliance/frameworks", label: "Frameworks", icon: ListChecks },
      { to: "/app/compliance/controls", label: "Controls", icon: ListChecks },
      { to: "/app/compliance/findings", label: "Findings", icon: Flag },
    ],
  },
  {
    title: "Infrastructure",
    items: [
      { to: "/app/infrastructure", label: "Vendors", icon: Box, end: true },
      { to: "/app/infrastructure/devices", label: "Devices", icon: Server },
      { to: "/app/infrastructure/networks", label: "Networks", icon: Network },
      { to: "/app/infrastructure/assets", label: "Assets", icon: Cpu },
    ],
  },
  {
    title: "Audits",
    items: [
      { to: "/app/audits/new", label: "New Audit", icon: Plus },
      { to: "/app/audits/history", label: "Audit History", icon: History },
      { to: "/app/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { to: "/app/intelligence", label: "AI Insights", icon: Sparkles, end: true },
      { to: "/app/intelligence/risk", label: "Risk Analysis", icon: ShieldAlert },
      { to: "/app/intelligence/recommendations", label: "Recommendations", icon: Lightbulb },
    ],
  },
  {
    title: "Global Governance",
    items: [
      { to: "/app/governance", label: "Passport", icon: Globe2, end: true },
      { to: "/app/governance/frameworks", label: "Frameworks", icon: Layers },
      { to: "/app/governance/controls", label: "Control Mapping", icon: ListChecks },
      { to: "/app/governance/regulatory", label: "Regulatory", icon: Scale },
      { to: "/app/governance/scenarios", label: "Scenario Lab", icon: FlaskConical },
      { to: "/app/governance/changes", label: "Change Governance", icon: GitPullRequest },
      { to: "/app/governance/exceptions", label: "Exceptions", icon: LifeBuoy },
      { to: "/app/governance/vendors", label: "Vendor Risk", icon: Boxes },
      { to: "/app/governance/audit-trail", label: "Audit Trail", icon: ScrollText },
      { to: "/app/governance/drift", label: "Drift", icon: Activity },
    ],
  },
  {
    title: "System",
    items: [{ to: "/app/settings", label: "Settings", icon: Settings, end: true }],
  },
];

const BASE = API_BASE ?? "";

function Breadcrumbs({ pathname }: { pathname: string }) {
  const crumbs = useMemo(() => {
    const labels: Record<string, string> = {
      app: "Workspace",
      compliance: "Compliance",
      frameworks: "Frameworks",
      controls: "Controls",
      findings: "Findings",
      reviews: "Human Review",
      infrastructure: "Infrastructure",
      vendors: "Vendors",
      devices: "Devices",
      networks: "Networks",
      assets: "Assets",
      audits: "Audits",
      new: "New Audit",
      history: "Audit History",
      reports: "Reports",
      intelligence: "Intelligence",
      risk: "Risk Analysis",
      recommendations: "Recommendations",
      settings: "Settings",
      dashboard: "Dashboard",
      governance: "Global Governance",
      passport: "Passport",
      regulatory: "Regulatory",
      scenarios: "Scenario Lab",
      changes: "Change Governance",
      exceptions: "Exceptions",
      "audit-trail": "Audit Trail",
    };
    const parts = pathname.split("/").filter(Boolean).filter((p) => p !== "app");
    const out: { key: string; label: string }[] = [{ key: "app", label: "Workspace" }];
    parts.forEach((p, i) => {
      const label = labels[p] ?? (parts[i - 1] === "audits" && /^[a-z0-9-]+$/i.test(p) ? p.slice(0, 8) : p);
      out.push({ key: p, label });
    });
    return out;
  }, [pathname]);

  return (
    <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
      {crumbs.map((c, i) => (
        <span key={c.key} className="flex items-center gap-1.5">
          {i > 0 ? <span aria-hidden="true">/</span> : null}
          <span className={i === crumbs.length - 1 ? "text-slate-300 font-medium" : ""}>{c.label}</span>
        </span>
      ))}
    </nav>
  );
}

function SearchBar() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const navigate = useNavigate();
  const wrapRef = useRef<HTMLDivElement>(null);

  const openPanel = () => {
    setOpen(true);
    if (!audits.length) api.listAudits().then(setAudits).catch(() => setAudits([]));
  };

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const matches = q.trim() ? audits.filter((a) => (a.configurationName + a.id).toLowerCase().includes(q.toLowerCase())) : audits.slice(0, 6);

  const go = (id: string) => {
    setOpen(false);
    setQ("");
    navigate(`/app/audits/${id}`);
  };

  return (
    <div ref={wrapRef} className="relative hidden md:block w-full max-w-xs">
      <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" aria-hidden="true" />
      <input
        className="input !pl-9 h-10"
        placeholder="Search audits, devices…"
        value={q}
        onFocus={openPanel}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && matches[0] && go(matches[0].id)}
        aria-label="Search audits and devices"
        aria-expanded={open}
      />
      <kbd className="absolute right-2.5 top-2.5 pointer-events-none hidden sm:block text-[10px] text-slate-500 border border-surface-600 rounded px-1.5 py-0.5">Ctrl K</kbd>
      {open ? (
        <ul className="absolute z-50 top-12 left-0 right-0 rounded-lg glass shadow-lift p-1.5 max-h-72 overflow-auto toast-in">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-xs text-slate-500">No audits match.</li>
          ) : (
            matches.map((a) => (
              <li key={a.id}>
                <button className="w-full text-left px-3 py-2 rounded-md hover:bg-surface-800 transition-colors" onClick={() => go(a.id)}>
                  <div className="text-xs font-medium text-slate-200">{a.configurationName}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {a.vendor.toUpperCase()} · {timeAgo(a.completedAt)}
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const [risks, setRisks] = useState<DashboardStats["topRisks"]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  const openPanel = () => {
    setOpen((v) => !v);
    if (!risks.length) api.getDashboard().then((d) => setRisks(d.topRisks.slice(0, 5))).catch(() => setRisks([]));
  };

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <button
        className="relative w-9 h-9 rounded-lg border border-surface-700 bg-surface-900 flex items-center justify-center text-slate-400 hover:text-slate-100 hover:border-accent/40 transition-colors"
        onClick={openPanel}
        aria-label={`Notifications${risks.length ? ` (${risks.length} alerts)` : ""}`}
        aria-expanded={open}
      >
        <Bell className="w-4 h-4" aria-hidden="true" />
        {risks.length ? (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-status-danger text-white text-[9px] font-bold flex items-center justify-center ai-ring-pulse">
            {risks.length}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-50 w-80 max-w-[85vw] rounded-xl glass shadow-lift p-2 toast-in">
          <div className="px-2 pt-1.5 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Open alerts</div>
          {risks.length === 0 ? (
            <p className="px-2 pb-2 text-xs text-slate-500">No alerts. All systems nominal.</p>
          ) : (
            <ul className="max-h-72 overflow-auto">
              {risks.map((f) => (
                <li key={f.id}>
                  <a href={`#/app/audits/${f.auditId}`} onClick={() => setOpen(false)} className="block px-2 py-2 rounded-md hover:bg-surface-800 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("text-[10px] font-bold uppercase", f.severity === "CRITICAL" ? "text-red-400" : f.severity === "HIGH" ? "text-orange-400" : "text-amber-400")}>{f.severity}</span>
                      <span className="text-[10px] text-slate-500">{f.auditId}</span>
                    </div>
                    <div className="text-xs text-slate-200 mt-0.5 line-clamp-2">{f.what || f.controlName}</div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="hidden xl:flex items-center gap-1.5 text-xs text-slate-500 font-mono" aria-label="Current date and time">
      <span className="w-1.5 h-1.5 rounded-full bg-status-ok animate-pulse-dot" aria-hidden="true" />
      {now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}{" "}
      {now.toLocaleTimeString()}
    </span>
  );
}

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [health, setHealth] = useState<"checking" | "ok" | "down">("checking");
  const [booting, setBooting] = useState(true);
  const [logoState, setLogoState] = useState<NexusLogoState>("IDLE");
  const location = useLocation();
  const navigate = useNavigate();
  const { mode, checked } = useAiMode();
  const role = sessionRole();
  const user = currentUser();
  const userRef = useRef<HTMLDivElement>(null);
  const healthRef = useRef(health);
  healthRef.current = health;

  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 1100);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const check = () => {
      if (!BASE && !DEMO_MODE) {
        setHealth("down");
        return;
      }
      fetchApi("/health")
        .then((r) => setHealth(r.ok ? "ok" : "down"))
        .catch(() => setHealth("down"));
    };
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setUserMenu(false);
  }, [location.pathname]);

  // NEXUS logo reflects real application state.
  // Priority: AI analysis (live event from the audit engine) > pending human review > nominal.
  useEffect(() => {
    let alive = true;
    let aiActive = false;
    const checkReview = () => {
      api
        .getReviewQueue()
        .then((q) => {
          if (!alive) return;
          const pending = q.counts.PENDING_REVIEW + q.counts.CHANGES_REQUESTED + q.counts.AI_GENERATED;
          setLogoState(
            healthRef.current === "down"
              ? "CRITICAL"
              : aiActive
                ? "AI_ANALYZING"
                : pending > 0
                  ? "REVIEW_REQUIRED"
                  : "IDLE"
          );
        })
        .catch(() => {
          if (alive) setLogoState(healthRef.current === "down" ? "CRITICAL" : aiActive ? "AI_ANALYZING" : "IDLE");
        });
    };
    const onAi = (e: Event) => {
      const s = (e as CustomEvent<string>).detail;
      aiActive = s === "analyzing";
      checkReview();
    };
    checkReview();
    window.addEventListener("nexus:ai", onAi);
    window.addEventListener("nexus:refresh", checkReview);
    return () => {
      alive = false;
      window.removeEventListener("nexus:ai", onAi);
      window.removeEventListener("nexus:refresh", checkReview);
    };
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!userRef.current?.contains(e.target as Node)) setUserMenu(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const dispatchRefresh = () => window.dispatchEvent(new CustomEvent("nexus:refresh"));

  let navItemIndex = 0;

  const sidebarInner = (
    <div className="flex flex-col h-full">
      <div className={cn("h-[72px] flex items-center border-b border-surface-800 px-5", collapsed ? "justify-center" : "justify-start")}>
        <Link
          to="/app"
          aria-label="NEXUS-COMPLY workspace"
          title={collapsed ? "NEXUS-COMPLY" : undefined}
          className={cn("flex items-center", collapsed ? "" : "gap-3")}
        >
          <AnimatedNexusLogo
            key={booting ? "boot" : "ready"}
            state={logoState}
            size={collapsed ? 34 : 40}
            intro={!booting}
            interactive
          />
          {!collapsed ? (
            <span className="nav-item-in flex flex-col gap-1 leading-none min-w-0">
              <span className="text-[14.5px] font-extrabold tracking-[0.13em] text-slate-100 whitespace-nowrap">NEXUS-COMPLY</span>
              <span className="text-[8px] font-semibold uppercase tracking-[0.26em] text-accent whitespace-nowrap">AI Compliance Engine</span>
            </span>
          ) : null}
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 space-y-4" aria-label="Primary">
        {NAV.map((section) => (
          <div key={section.title}>
            <div className={cn("px-2 mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600", collapsed && "text-center")}>
              {collapsed ? section.title.charAt(0) : section.title}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const idx = navItemIndex++;
                return (
                <li key={item.to + item.label} className="nav-item-in" style={{ ["--d" as never]: `${100 + idx * 40}ms` }}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        "nav-pill group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-200 whitespace-nowrap",
                        collapsed && "justify-center px-0",
                        isActive
                          ? "nav-pill-active text-accent bg-accent/10 border border-accent/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_0_20px_rgba(56,189,248,0.10)]"
                          : "text-slate-400 hover:text-slate-100 hover:bg-surface-800/70 border border-transparent"
                      )
                    }
                  >
                    <item.icon className="w-[18px] h-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110" aria-hidden="true" />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    {collapsed ? <span className="nav-tip" role="tooltip">{item.label}</span> : null}
                  </NavLink>
                </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-surface-800 p-3 space-y-2">
        <div className={cn("flex items-center gap-2 rounded-lg border border-surface-700 bg-surface-900 px-2.5 py-2", collapsed && "justify-center px-1")} title={collapsed ? "System healthy" : undefined}>
          <span className={cn("w-2 h-2 rounded-full shrink-0", health === "ok" ? "bg-status-ok animate-pulse-dot" : health === "down" ? "bg-status-danger" : "bg-slate-500")} aria-hidden="true" />
          {!collapsed ? (
            <span className="text-[11px] text-slate-400 leading-tight">
              {health === "ok" ? "All systems operational" : health === "down" ? "Engine offline" : "Checking…"}
            </span>
          ) : null}
        </div>
        <div className="relative" ref={userRef}>
          <button
            className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-800 transition-colors"
            onClick={() => setUserMenu((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={userMenu}
          >
            <span className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-accent-dim text-slate-950 flex items-center justify-center text-xs font-bold shrink-0">
              {user.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
            </span>
            {!collapsed ? (
              <span className="flex-1 text-left min-w-0">
                <span className="block text-xs font-semibold text-slate-200 truncate">{user}</span>
                <span className="block text-[10px] text-slate-500">{role === "reviewer" ? "Security Review Lead" : "Security Analyst (view-only)"}</span>
              </span>
            ) : null}
          </button>
          {userMenu && !collapsed ? (
            <div className="absolute z-50 right-0 bottom-full mb-1 w-48 rounded-lg border border-surface-600 bg-surface-900 shadow-lift py-1">
              <button className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-surface-800" onClick={() => navigate("/app/settings")}>
                <Settings className="w-3.5 h-3.5" aria-hidden="true" /> Workspace settings
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen relative">
      {booting ? <LoadingScreen /> : null}
      <BackgroundFx className="fixed inset-0" />

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex fixed inset-y-0 left-0 z-40 flex-col border-r border-white/5 bg-surface-950/70 backdrop-blur-xl transition-all duration-200",
          collapsed ? "w-[var(--sidebar-collapsed-width)]" : "w-[var(--sidebar-width)]"
        )}
        aria-label="Sidebar"
      >
        {sidebarInner}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm modal-back" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-[var(--drawer-width)] max-w-[85vw] flex flex-col bg-surface-950/90 backdrop-blur-xl border-r border-white/5 modal-panel" aria-label="Sidebar">
            <button className="absolute top-4 right-3 text-slate-400 hover:text-slate-100" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
            {sidebarInner}
          </aside>
        </div>
      ) : null}

      {/* Main column */}
      <div className={cn("relative z-10 transition-all duration-200", collapsed ? "lg:ml-[var(--sidebar-collapsed-width)]" : "lg:ml-[var(--sidebar-width)]")}>
        <header className="sticky top-0 z-30 border-b border-white/5 bg-surface-950/60 backdrop-blur-xl">
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" aria-hidden="true" />
          <div className="flex items-center gap-3 px-4 lg:px-6 h-16">
            <button className="lg:hidden w-9 h-9 rounded-lg border border-surface-700 flex items-center justify-center text-slate-400" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu className="w-4 h-4" aria-hidden="true" />
            </button>
            <div className="lg:hidden flex items-center">
              <Link to="/app" aria-label="NEXUS-COMPLY workspace" className="flex items-center">
                <AnimatedNexusLogo state={logoState} size={30} />
              </Link>
            </div>
            <button
              className="hidden lg:flex w-9 h-9 rounded-lg border border-surface-700 text-slate-400 hover:text-slate-100 items-center justify-center transition-colors"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronsRight className="w-4 h-4" aria-hidden="true" /> : <ChevronsLeft className="w-4 h-4" aria-hidden="true" />}
            </button>
            <Breadcrumbs pathname={location.pathname} />
            <div className="flex-1" />
            <SearchBar />
            {checked ? (
              <button
                className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-accent/25 bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent"
                onClick={() => navigate("/app/settings")}
                title={`AI provider: ${mode === "live" ? "live LLM" : "offline deterministic mock"}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot" aria-hidden="true" />
                {mode === "live" ? "AI LIVE" : "AI OFFLINE"}
              </button>
            ) : null}
            <LiveClock />
            <button className="w-9 h-9 rounded-lg border border-surface-700 text-slate-400 hover:text-slate-100 flex items-center justify-center transition-colors" onClick={dispatchRefresh} aria-label="Refresh data">
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
            </button>
            <Notifications />
          </div>
        </header>
        <main className="px-4 lg:px-6 py-6 lg:py-8 max-w-[1560px] mx-auto">
          <div key={location.pathname} className="page-enter">
            <ErrorBoundary title="Section failed to load">
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
        <footer className="px-4 lg:px-6 pb-6 text-center lg:text-right text-[11px] text-slate-600">
          NEXUS-COMPLY · evidence-driven adaptive compliance · {mode === "live" ? "live AI" : "offline demo mode"}
        </footer>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} nav={NAV} />
    </div>
  );
}