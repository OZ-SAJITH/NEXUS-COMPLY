import { useState, useCallback } from "react";
import { Building2, MapPin, Globe2, AlertTriangle, Clock, GitCompareArrows, ShieldAlert, CheckCircle2, ChevronDown, ChevronRight, Info, Shield } from "lucide-react";
import type { CompliancePassport, FrameworkApplicability, GovernanceEvaluation, OrganizationProfile, PolicyConflict } from "@nexus/shared-types";
import { api } from "../../services/api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { PageHeader } from "../../components/PageHeader";
import { LoadingState, ErrorState } from "../../components/states";
import { MetricCard } from "../../components/MetricCard";
import { ComplianceRing } from "../../components/ComplianceRing";
import { GovTabs } from "./GovTabs";
import { HelpTooltip } from "../../components/gov/HelpTooltip";
import { Toast } from "../../components/motion/Toast";
import { RegionChip } from "../../components/gov/RegionChip";
import { cn } from "../../utils/cn";

// ---------------------------------------------------------------------------
// NEXUS Healthcare demo profiles
// ---------------------------------------------------------------------------

const NEXUS_HEALTHCARE_INDIA: OrganizationProfile = {
  id: "nexus-healthcare",
  name: "NEXUS Healthcare",
  description: "Healthcare provider — India primary region.",
  size: "ENTERPRISE",
  regions: ["IN"],
  primaryRegion: "IN",
  industries: ["healthcare"],
  criticality: "HIGH",
  dataTypes: ["PERSONAL", "HEALTH", "CUSTOMER"],
  cloud: "CLOUD",
  cloudProviders: ["AWS"],
  customerRegions: ["IN"],
  businessSectors: ["HEALTH"],
  dataResidency: ["IN"],
};

const NEXUS_HEALTHCARE_IN_EU: OrganizationProfile = {
  ...NEXUS_HEALTHCARE_INDIA,
  id: "nexus-healthcare-eu",
  name: "NEXUS Healthcare",
  description: "Healthcare provider — India + EU operations.",
  regions: ["IN", "DE"],
  primaryRegion: "IN",
  customerRegions: ["IN", "EU"],
  dataResidency: ["IN", "EU"],
};

const NEXUS_FINANCIAL_IN_EU: OrganizationProfile = {
  ...NEXUS_HEALTHCARE_IN_EU,
  id: "nexus-financial",
  name: "NEXUS Financial Services",
  description: "Financial regulated entity — India + EU operations.",
  industries: ["banking"],
  criticality: "CRITICAL",
  dataTypes: ["PERSONAL", "FINANCIAL"],
  cloud: "HYBRID",
  cloudProviders: ["Azure"],
  businessSectors: ["FINANCE"],
};

// ---------------------------------------------------------------------------
// Category section labels and colors
// ---------------------------------------------------------------------------

const CATEGORY_META: Record<string, { label: string; color: string; bg: string }> = {
  GLOBAL_BASELINE: { label: "Global Baseline", color: "text-sky-300", bg: "bg-sky-500/10 border-sky-500/20" },
  REGIONAL: { label: "Regional Requirement", color: "text-violet-300", bg: "bg-violet-500/10 border-violet-500/20" },
  INDUSTRY: { label: "Industry Requirement", color: "text-amber-300", bg: "bg-amber-500/10 border-amber-500/20" },
  SECURITY_BASELINE: { label: "Security Baseline", color: "text-emerald-300", bg: "bg-emerald-500/10 border-emerald-500/20" },
};

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
  CONDITIONAL: "text-amber-400 border-amber-500/40 bg-amber-500/10",
  NOT_APPLICABLE: "text-slate-500 border-slate-600/40 bg-slate-600/10",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ContextCard({ evaluation, onContextChange, loading }: { evaluation: GovernanceEvaluation; onContextChange: (p: OrganizationProfile) => void; loading: boolean }) {
  const ctx = evaluation.context;
  return (
    <div className="card !p-5">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-3 flex items-center gap-1.5">
        <Globe2 className="w-3.5 h-3.5" aria-hidden="true" /> Governance Context
      </div>
      <div className="space-y-3">
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Primary Region</div>
          <div className="flex items-center gap-2">
            <RegionChip code={ctx.primaryRegion} />
            <span className="text-xs text-slate-400">{ctx.primaryRegionLabel}</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Operating Regions</div>
          <div className="flex flex-wrap gap-1.5">
            {ctx.operatingRegions.map((r) => (
              <RegionChip key={r} code={r} />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Industry</div>
            <div className="text-xs text-slate-300">{ctx.industryLabels.join(", ")}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Org Type</div>
            <div className="text-xs text-slate-300">{ctx.orgType}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Data Types</div>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {ctx.dataTypes.map((d) => (
                <span key={d} className="px-2 py-0.5 rounded-full border border-surface-700 bg-surface-800/70 text-[10px] text-slate-300">{d}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Criticality</div>
            <span className={cn("px-2 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide", ctx.criticality === "CRITICAL" ? "text-red-400 border-red-500/40 bg-red-500/10" : ctx.criticality === "HIGH" ? "text-amber-400 border-amber-500/40 bg-amber-500/10" : "text-slate-400 border-surface-700 bg-surface-800/70")}>
              {ctx.criticality}
            </span>
          </div>
        </div>
      </div>

      {/* Demo scenario quick-switch buttons */}
      <div className="mt-4 pt-3 border-t border-surface-700">
        <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Demo scenarios</div>
        <div className="flex flex-wrap gap-2">
          <button
            disabled={loading}
            onClick={() => onContextChange(NEXUS_HEALTHCARE_INDIA)}
            className={cn(
              "px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all",
              ctx.organization.id === "nexus-healthcare" && ctx.operatingRegions.length === 1
                ? "border-accent/50 bg-accent/10 text-accent"
                : "border-surface-700 bg-surface-800/50 text-slate-400 hover:text-slate-200 hover:border-surface-500"
            )}
          >
            NEXUS Healthcare (India)
          </button>
          <button
            disabled={loading}
            onClick={() => onContextChange(NEXUS_HEALTHCARE_IN_EU)}
            className={cn(
              "px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all",
              ctx.organization.id === "nexus-healthcare-eu" && ctx.operatingRegions.length === 2
                ? "border-accent/50 bg-accent/10 text-accent"
                : "border-surface-700 bg-surface-800/50 text-slate-400 hover:text-slate-200 hover:border-surface-500"
            )}
          >
            India + EU (Healthcare)
          </button>
          <button
            disabled={loading}
            onClick={() => onContextChange(NEXUS_FINANCIAL_IN_EU)}
            className={cn(
              "px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all",
              ctx.organization.id === "nexus-financial"
                ? "border-accent/50 bg-accent/10 text-accent"
                : "border-surface-700 bg-surface-800/50 text-slate-400 hover:text-slate-200 hover:border-surface-500"
            )}
          >
            Financial Services (India + EU)
          </button>
        </div>
      </div>
    </div>
  );
}

function WhyPanel({ reasons }: { reasons: FrameworkApplicability["reasons"] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((p) => !p);
        }}
        className="flex items-center gap-1.5 text-[11px] text-accent hover:text-accent-soft transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Why{open ? "" : " active?"}
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5 pl-1 animate-fade-in">
          {reasons.filter((r) => r.matched).map((r) => (
            <li key={r.key} className="flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed">
              <span className="text-emerald-400 mt-0.5 shrink-0">✓</span>
              <span>{r.text}</span>
            </li>
          ))}
          {reasons.filter((r) => !r.matched).map((r) => (
            <li key={r.key} className="flex items-start gap-2 text-[11px] text-slate-500/60 leading-relaxed">
              <span className="text-slate-600 mt-0.5 shrink-0">–</span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PolicyFrameworkCard({ fw }: { fw: FrameworkApplicability }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-all cursor-pointer",
        fw.status === "ACTIVE"
          ? "border-emerald-500/25 bg-emerald-500/5 hover:bg-emerald-500/8"
          : fw.status === "CONDITIONAL"
            ? "border-amber-500/25 bg-amber-500/5 hover:bg-amber-500/8"
            : "border-surface-700 bg-surface-800/30 opacity-50"
      )}
      onClick={() => setExpanded((p) => !p)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", fw.status === "ACTIVE" ? "bg-emerald-400" : fw.status === "CONDITIONAL" ? "bg-amber-400" : "bg-slate-600")} />
          <span className="text-sm font-medium text-slate-200 truncate">{fw.shortName}</span>
          <span className="text-[10px] text-slate-500 font-mono">v{fw.version}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("px-2 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide", STATUS_STYLE[fw.status])}>
            {fw.status}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">{fw.controlIds.length} ctrl</span>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-surface-700/50 animate-fade-in space-y-2">
          <div className="text-xs text-slate-400 leading-relaxed">{fw.name}</div>
          {fw.condition && (
            <div className="text-[11px] text-amber-400/80 bg-amber-500/5 rounded px-2 py-1.5 border border-amber-500/15">
              <Info className="w-3 h-3 inline mr-1.5 -mt-0.5" />
              {fw.condition}
            </div>
          )}
          <WhyPanel reasons={fw.reasons} />
        </div>
      )}
    </div>
  );
}

function PolicyGroup({ title, color, items, animKey }: { title: string; color: string; items: FrameworkApplicability[]; animKey: string }) {
  if (items.length === 0) return null;
  return (
    <div key={animKey} className="animate-fade-in-up">
      <div className={cn("text-[11px] uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5", color)}>
        <Shield className="w-3 h-3" aria-hidden="true" />
        {title} <span className="text-[10px] font-normal text-slate-500 ml-1">({items.length})</span>
      </div>
      <div className="space-y-2">
        {items.map((fw) => (
          <PolicyFrameworkCard key={`${animKey}-${fw.frameworkId}`} fw={fw} />
        ))}
      </div>
    </div>
  );
}

function ConflictCard({ conflict, onRequestReview, requested }: { conflict: PolicyConflict; onRequestReview?: (id: string) => void; requested?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-4">
      <div className="flex items-start justify-between gap-3 cursor-pointer" onClick={() => setExpanded((p) => !p)}>
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
            <span className="font-semibold text-sm text-slate-200">{conflict.topic}</span>
          </div>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{conflict.description}</p>
        </div>
        {requested ? (
          <span className="text-[10px] text-emerald-400 font-medium whitespace-nowrap shrink-0">REVIEW REQUESTED</span>
        ) : (
          <button
            className="text-[10px] text-accent border border-accent/30 bg-accent/5 rounded px-2 py-1 whitespace-nowrap hover:bg-accent/10 transition-colors shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onRequestReview?.(conflict.id);
            }}
          >
            REQUEST HUMAN REVIEW
          </button>
        )}
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-surface-700/50 space-y-3 animate-fade-in">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="rounded bg-surface-800/50 p-2.5 border border-surface-700">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Requirement A</div>
              <p className="text-xs text-slate-300 leading-relaxed">{conflict.requirementA}</p>
              <div className="text-[10px] text-slate-500 mt-1">From: {conflict.requirementAFrom}</div>
            </div>
            <div className="rounded bg-surface-800/50 p-2.5 border border-surface-700">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">Requirement B</div>
              <p className="text-xs text-slate-300 leading-relaxed">{conflict.requirementB}</p>
              <div className="text-[10px] text-slate-500 mt-1">From: {conflict.requirementBFrom}</div>
            </div>
          </div>
          <div className="text-xs text-slate-400">
            <span className="font-semibold text-slate-300">Affected control:</span> {conflict.affectedControl}
          </div>
          <div className="text-xs text-amber-400/80">
            <span className="font-semibold">Potential impact:</span> {conflict.potentialImpact}
          </div>
          <div className="text-xs text-accent">
            <span className="font-semibold">Recommended review:</span> {conflict.recommendedReview}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {conflict.frameworks.map((f) => (
              <span key={`${f.region}-${f.frameworks.join(",")}`} className="px-2 py-0.5 rounded border border-surface-700 bg-surface-800/50 text-[10px] text-slate-300">
                <span className="mr-1">{f.label}</span>
                <span className="text-slate-500">{f.frameworks.join(", ")}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ScoresPanel({ scores }: { scores: GovernanceEvaluation["scores"] }) {
  return (
    <div className="card !p-5">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-3 flex items-center gap-1.5">
        <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" /> Region-Aware Compliance Scores
        <HelpTooltip label="compliance scores">
          Scores are computed deterministically per applicable framework from your org context (region, industry, data types, criticality). No LLM is involved — every score maps to a matched control.
        </HelpTooltip>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="rounded-lg bg-surface-800/70 border border-surface-700 p-3 text-center">
          <div className="text-2xl font-bold text-slate-100">{scores.overall}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Overall</div>
        </div>
        <div className="rounded-lg bg-surface-800/70 border border-surface-700 p-3 text-center">
          <div className="text-2xl font-bold text-sky-300">{scores.globalBaseline}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Global Baseline</div>
        </div>
        <div className="rounded-lg bg-surface-800/70 border border-surface-700 p-3 text-center">
          <div className="text-2xl font-bold text-violet-300">{scores.regional}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Regional</div>
        </div>
        <div className="rounded-lg bg-surface-800/70 border border-surface-700 p-3 text-center">
          <div className="text-2xl font-bold text-amber-300">{scores.industry}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Industry</div>
        </div>
      </div>
      {scores.byRegion.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Per Region</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {scores.byRegion.map((r) => (
              <div key={r.region} className="rounded-lg border border-surface-700 bg-surface-800/50 p-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>{r.flag}</span>
                  <span className="text-xs text-slate-300 font-medium">{r.label}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-slate-400">{r.activeFrameworks} active</span>
                  <span className="text-slate-500">{r.conditionalFrameworks} conditional</span>
                  <span className="font-mono font-bold text-slate-200 text-xs">{r.score}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-3 text-[10px] text-slate-500 leading-relaxed">{scores.method}</p>
    </div>
  );
}

function OrgSelector({ passports, loading }: { passports: CompliancePassport; loading: boolean }) {
  const { data: profiles, refresh } = useAsyncData<OrganizationProfile[]>(() => api.gov.organizations(), []);
  if (!profiles || profiles.length === 0) return null;

  return (
    <div className="card !p-4">
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-3">Organization profile</div>
      <div className="flex flex-wrap gap-2">
        {profiles.map((p) => {
          const active = p.id === passports.organization.id;
          return (
            <button
              key={p.id}
              disabled={active || loading}
              onClick={() => {
                api.gov
                  .updateContext(p)
                  .then(() => {
                    window.dispatchEvent(new CustomEvent("nexus:refresh"));
                    refresh();
                  })
                  .catch(() => undefined);
              }}
              className={cn(
                "px-3 py-2 rounded-lg border text-left text-sm transition-colors",
                active ? "border-accent/50 bg-accent/10 text-accent font-medium" : "border-surface-700 bg-surface-800/50 text-slate-300 hover:border-surface-500"
              )}
            >
              {p.name}
              <span className="block text-[10px] text-slate-500 mt-0.5 font-normal">{p.size} · {p.cloud} · {p.regions.join(", ")}</span>
            </button>
          );
        })}
      </div>
      {passports.organization.id !== "nexus-enterprise" ? (
        <button
          className="btn-outline text-xs mt-3"
          disabled={loading}
          onClick={() => {
            api.gov.resetOrganization().then(() => window.dispatchEvent(new CustomEvent("nexus:refresh"))).catch(() => undefined);
          }}
        >
          Reset to default profile
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function GlobalCompliancePage() {
  const { data: passport, loading: passportLoading, error: passportError, refresh: refreshPassport } = useAsyncData<CompliancePassport>(() => api.gov.passport(), []);
  const { data: evaluation, loading: evalLoading, error: evalError, refresh: refreshEval } = useAsyncData<GovernanceEvaluation>(() => api.gov.evaluate(), []);

  const handleContextChange = useCallback((profile: OrganizationProfile) => {
    api.gov
      .updateContext(profile)
      .then(() => {
        window.dispatchEvent(new CustomEvent("nexus:refresh"));
      })
      .catch(() => undefined);
  }, []);

  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const handleRequestReview = useCallback((id: string) => {
    api.gov
      .requestConflictReview(id)
      .then((r) => {
        setToast(r.message);
        setRequestedIds((prev) => new Set(prev).add(id));
      })
      .catch((e: unknown) => setToast("Review request failed: " + String(e instanceof Error ? e.message : e)));
  }, []);

  if ((passportLoading || evalLoading) && !passport && !evaluation) return <LoadingState label="Computing governance context and compliance passport…" />;
  if (passportError && !passport) return <ErrorState title="Could not load passport" detail={passportError} onRetry={refreshPassport} />;
  if (evalError && !evaluation) return <ErrorState title="Could not evaluate governance context" detail={evalError} onRetry={refreshEval} />;
  if (!passport || !evaluation) return null;

  const org = passport.organization;
  const animKey = JSON.stringify(evaluation.context.operatingRegions);

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Global Compliance Passport"
        subtitle="A single, portfolio-wide view of regulatory posture across every framework, region and industry your organization operates in."
      />
      <GovTabs />

      <OrgSelector passports={passport} loading={evalLoading} />

      <div className="grid lg:grid-cols-[320px_1fr] gap-6">
        <div className="space-y-4">
          <div className="glass-card !p-6">
            <div className="flex flex-col items-center gap-3">
              <ComplianceRing value={passport.globalScore} size={170} sublabel="global score" />
              <div className="text-center">
                <div className="flex items-center justify-center gap-2">
                  <Building2 className="w-4 h-4 text-accent" aria-hidden="true" />
                  <span className="font-semibold text-slate-100">{org.name}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {org.size} · {org.cloud} · {org.businessSectors.join(", ")}
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-surface-800/70 border border-surface-700 p-2">
                <div className="text-sm font-bold text-emerald-400">{evaluation.activeCount}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">active</div>
              </div>
              <div className="rounded-lg bg-surface-800/70 border border-surface-700 p-2">
                <div className="text-sm font-bold text-amber-400">{evaluation.conditionalCount}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">conditional</div>
              </div>
              <div className="rounded-lg bg-surface-800/70 border border-surface-700 p-2">
                <div className="text-sm font-bold text-slate-400">{evaluation.notApplicableCount}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">not appl.</div>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Regions</div>
              <div className="flex flex-wrap gap-1.5">
                {org.regions.map((r) => (
                  <RegionChip key={r} code={r} />
                ))}
              </div>
            </div>
            <div className="mt-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Data types</div>
              <div className="flex flex-wrap gap-1.5">
                {org.dataTypes.map((d) => (
                  <span key={d} className="px-2 py-0.5 rounded-full border border-surface-700 bg-surface-800/70 text-[11px] text-slate-300">{d}</span>
                ))}
              </div>
            </div>
          </div>

          <ContextCard evaluation={evaluation} onContextChange={handleContextChange} loading={evalLoading} />
        </div>

        <div className="space-y-6">
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <MetricCard icon={<ShieldAlert className="w-4 h-4" aria-hidden="true" />} label="Critical findings" value={passport.openCritical} context="open at critical severity" accent="danger" link={{ to: "/app/compliance/findings", label: "Review findings" }} />
            <MetricCard icon={<AlertTriangle className="w-4 h-4" aria-hidden="true" />} label="High severity findings" value={passport.openHigh} context="open at high severity" accent="warn" />
            <MetricCard icon={<Clock className="w-4 h-4" aria-hidden="true" />} label="Active exceptions" value={passport.activeExceptions} context="require a decision" accent="warn" link={{ to: "/app/governance/exceptions", label: "Exception Guardian" }} />
            <MetricCard icon={<CheckCircle2 className="w-4 h-4" aria-hidden="true" />} label="Pending approvals" value={passport.pendingApprovals} context="awaiting four-eyes approval" accent="accent" link={{ to: "/app/governance/changes", label: "Open changes" }} />
            <MetricCard icon={<GitCompareArrows className="w-4 h-4" aria-hidden="true" />} label="Compliance drift" value={passport.driftCount} context="controls drifted from baseline" accent="warn" />
            <MetricCard icon={<MapPin className="w-4 h-4" aria-hidden="true" />} label="Avg vendor risk" value={`${passport.vendorRiskAvg}%`} context="across the vendor graph" accent="accent" link={{ to: "/app/governance/vendors", label: "Vendor risk" }} />
          </div>

          <ScoresPanel scores={evaluation.scores} />

          {/* Active governance policies grouped by category */}
          <div className="card !p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-100">Active Governance Policies</h2>
                <p className="text-xs text-slate-500 mt-0.5">Frameworks are auto-selected from your region, industry, data types and criticality — no LLM involved.</p>
              </div>
            </div>
            <div className="space-y-6">
              <PolicyGroup
                title="Global Baseline"
                color={CATEGORY_META.GLOBAL_BASELINE.color}
                items={evaluation.globalBaselines}
                animKey={`${animKey}-global`}
              />
              <PolicyGroup
                title="Regional Requirements"
                color={CATEGORY_META.REGIONAL.color}
                items={evaluation.regional}
                animKey={`${animKey}-regional`}
              />
              <PolicyGroup
                title="Industry Requirements"
                color={CATEGORY_META.INDUSTRY.color}
                items={evaluation.industryDriven}
                animKey={`${animKey}-industry`}
              />
              <PolicyGroup
                title="Security Baselines"
                color={CATEGORY_META.SECURITY_BASELINE.color}
                items={evaluation.securityBaselines}
                animKey={`${animKey}-security`}
              />
            </div>
          </div>

          {/* Policy conflicts */}
          {evaluation.conflicts.length > 0 && (
            <div className="card !p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-100">Policy Conflicts</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Regulatory obligations that interact across your operating regions and may need legal review.</p>
                </div>
                <span className="px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-400 font-semibold uppercase tracking-wide">{evaluation.conflicts.length} detected</span>
              </div>
              <div className="space-y-3">
                {evaluation.conflicts.map((c) => (
                  <ConflictCard key={c.id} conflict={c} onRequestReview={handleRequestReview} requested={requestedIds.has(c.id)} />
                ))}
              </div>
            </div>
          )}

          {/* Framework coverage (existing) */}
          <div className="card !p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-100">Framework Coverage</h2>
                <p className="text-xs text-slate-500 mt-0.5">Controls mapped and assessed per framework.</p>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-x-6 gap-y-3">
              {passport.frameworks.map((c) => (
                <div key={c.frameworkId} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", c.status === "COMPLIANT" ? "bg-emerald-400" : c.status === "PARTIAL" ? "bg-amber-400" : c.status === "AT_RISK" ? "bg-red-400" : "bg-slate-600")} />
                    <span className="text-slate-200 text-sm font-medium truncate">{c.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 h-1.5 rounded-full bg-surface-800 overflow-hidden" aria-hidden="true">
                        <div className={cn("h-full rounded-full", c.status === "COMPLIANT" ? "bg-emerald-500" : c.status === "PARTIAL" ? "bg-amber-500" : c.status === "AT_RISK" ? "bg-red-500" : "bg-slate-600")} style={{ width: `${Math.max(0, Math.min(100, c.score))}%` }} />
                      </div>
                      <span className="font-mono text-xs text-slate-400 tabular-nums">{c.score}%</span>
                    </div>
                    <span className={cn("px-2 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wide", c.status === "COMPLIANT" ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10" : c.status === "PARTIAL" ? "text-amber-400 border-amber-500/40 bg-amber-500/10" : c.status === "AT_RISK" ? "text-red-400 border-red-500/40 bg-red-500/10" : "text-slate-500 border-slate-500/40 bg-slate-500/10")}>{c.status.replaceAll("_", " ")}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Disclaimer */}
          <div className="card !p-4 border-surface-700/50 bg-surface-800/30">
            <p className="text-[11px] text-slate-500 leading-relaxed text-center">
              {evaluation.disclaimer}
            </p>
          </div>
        </div>
      </div>
      {toast ? <Toast tone="success" onDismiss={() => setToast(null)}>{toast}</Toast> : null}
    </div>
  );
}
