import { useState } from "react";
import type { AiInterpretation } from "../types";
import { api } from "../services/api";
import { Card } from "./ui";
import { cn } from "../utils/cn";

interface Props {
  auditId: string;
  ai: AiInterpretation;
  onChanged: () => void;
}

const INTENT_LABELS: Record<string, string> = {
  RESTRICT_ADMIN_ACCESS: "Restricted Administrative Access",
  DISABLE_INSECURE_PROTOCOL: "Disable Insecure Protocol",
  REQUIRE_LOGGING: "Require Logging",
  RESTRICT_SOURCE_NETWORK: "Restrict Source Network",
  DENY_UNAUTHORIZED_TRAFFIC: "Deny Unauthorized Traffic",
  REQUIRE_STRONG_AUTHENTICATION: "Require Strong Authentication",
  SECURE_MANAGEMENT_INTERFACE: "Secure Management Interface",
  DEFAULT_DENY: "Default Deny",
  NETWORK_SEGMENTATION: "Network Segmentation",
};

export function AiReview({ auditId, ai, onChanged }: Props) {
  const [busy, setBusy] = useState<"approve" | "reject" | "edit" | null>(null);
  const [message, setMessage] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editIntent, setEditIntent] = useState<string>(ai.securityIntent);
  const [editProtocol, setEditProtocol] = useState(ai.protocol ?? "ssh");
  const [editRestriction, setEditRestriction] = useState(ai.sourceRestriction);

  const fp = ai.syntaxFingerprint ?? "";

  const approve = async () => {
    setBusy("approve");
    setMessage("");
    try {
      await api.approveAiInterpretation(ai.id!, auditId, fp);
      setMessage("Mapping approved and stored. It can now be reused for future configurations with this syntax.");
      onChanged();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    setBusy("reject");
    setMessage("");
    try {
      await api.rejectAiInterpretation(ai.id!, auditId, fp);
      setMessage("Interpretation rejected. Nothing was saved.");
      onChanged();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(null);
    }
  };

  const saveEdit = async () => {
    setBusy("edit");
    setMessage("");
    try {
      await api.editAiInterpretation(ai.id!, auditId, fp, {
        securityIntent: editIntent,
        protocol: editProtocol,
        sourceRestriction: editRestriction,
      });
      setEditMode(false);
      onChanged();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(null);
    }
  };

  if (ai.status === "APPROVED") {
    return (
      <Card className="border-emerald-500/40">
        <div className="font-semibold text-emerald-400 mb-1">✓ Mapping approved</div>
        <p className="text-sm text-slate-400">
          This interpretation can now be reused for future configurations of this syntax. The system becomes more adaptable through human-approved learning.
        </p>
      </Card>
    );
  }

  if (ai.status === "REJECTED") {
    return (
      <Card className="border-red-500/40">
        <div className="font-semibold text-red-400 mb-1">✕ Mapping rejected</div>
        <p className="text-sm text-slate-400">This interpretation was not saved and will not be reused.</p>
        <button className="btn-outline mt-3" onClick={onChanged}>
          Reconsider
        </button>
      </Card>
    );
  }

  return (
    <Card className="border-amber-500/40">
      <div className="flex items-center gap-2 mb-3">
        <span className="chip border border-amber-500/40 bg-amber-500/10 text-amber-300">⚠ UNKNOWN CONFIGURATION FORMAT</span>
        <span className="chip border border-sky-500/40 bg-sky-500/10 text-sky-400">AI INTERPRETATION REVIEW</span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="label">Candidate Intent</div>
          <div className="font-medium text-slate-100">{INTENT_LABELS[ai.securityIntent] ?? ai.securityIntent}</div>
        </div>
        <div>
          <div className="label">Protocol</div>
          <div className="font-medium text-slate-100 uppercase">{ai.protocol ?? "—"}</div>
        </div>
        <div>
          <div className="label">Current Exposure</div>
          <div className={cn("font-medium", ai.sourceRestriction ? "text-emerald-400" : "text-red-400")}>
            {ai.sourceRestriction ? "Restricted" : "Unrestricted"}
          </div>
        </div>
        <div>
          <div className="label">AI Confidence</div>
          <div className="text-lg font-bold text-slate-100">{Math.round(ai.confidence * 100)}%</div>
        </div>
        <div>
          <div className="label">Logging</div>
          <div className="font-medium text-slate-100">{ai.loggingEnabled ? "Enabled" : "Not enabled"}</div>
        </div>
        <div>
          <div className="label">Evidence</div>
          <div className="font-medium text-slate-100">
            {ai.evidence.map((e) => `Lines ${e.lineStart}–${e.lineEnd}`).join(", ")}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="label">AI Reason</div>
        <div className="rounded-lg bg-surface-800 border border-surface-700 p-3 text-sm text-slate-300">
          {ai.evidence.map((e) => (
            <div key={`${e.lineStart}-${e.lineEnd}`} className="mb-1.5 last:mb-0">
              <span className="text-sky-400">L{e.lineStart}–{e.lineEnd}: </span>
              {e.reason}
              {e.snippet ? <pre className="mt-1 font-mono text-[11px] text-slate-500 whitespace-pre-wrap">{e.snippet}</pre> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="label">Suggested Remediation</div>
        <p className="text-sm text-slate-300">{ai.suggestedRemediation}</p>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span className="chip border border-slate-600 text-slate-400">{ai.provider === "mock" ? "AI Mode: DEMO (deterministic)" : "AI Mode: LIVE"}</span>
        <div className="flex-1" />
        {editMode ? (
          <div className="flex items-center gap-2">
            <select className="input" value={editIntent} onChange={(e) => setEditIntent(e.target.value)}>
              {Object.entries(INTENT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select className="input" value={editProtocol} onChange={(e) => setEditProtocol(e.target.value)}>
              {["ssh", "telnet", "http", "https", "snmp"].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <label className="text-xs text-slate-400 flex items-center gap-1">
              <input type="checkbox" checked={editRestriction} onChange={(e) => setEditRestriction(e.target.checked)} />
              Source restricted
            </label>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex gap-3">
        {editMode ? (
          <>
            <button className="btn-success" onClick={saveEdit} disabled={busy !== null}>
              {busy === "edit" ? "Saving…" : "Save edited mapping"}
            </button>
            <button className="btn-outline" onClick={() => setEditMode(false)} disabled={busy !== null}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="btn-success" onClick={approve} disabled={busy !== null || ai.status !== "PENDING"}>
              {busy === "approve" ? "Approving…" : "APPROVE MAPPING"}
            </button>
            <button className="btn-danger" onClick={reject} disabled={busy !== null || ai.status !== "PENDING"}>
              {busy === "reject" ? "Rejecting…" : "REJECT"}
            </button>
            <button className="btn-outline" onClick={() => setEditMode(true)} disabled={busy !== null || ai.status !== "PENDING"}>
              EDIT
            </button>
          </>
        )}
      </div>

      {message ? <div className="mt-3 text-sm text-slate-300">{message}</div> : null}
    </Card>
  );
}