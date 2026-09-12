import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional heading override (e.g. "Workspace crashed") for top-level boundaries. */
  title?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
  detail: string;
}

/** Top-level guard so a single page/component failure never blanks the entire console. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, detail: "" };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error, detail: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("NEXUS error boundary caught:", error, info.componentStack);
    this.setState({ detail: `${error.message}\n${info.componentStack ?? ""}`.trim() });
  }

  private reload = () => {
    if (this.props.children) {
      // Reset boundary state; children re-render in place.
      this.setState({ error: null, detail: "" });
    } else {
      throw new Error("unreachable");
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="card !p-8 max-w-lg w-full text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-status-danger/15 border border-status-danger/30 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-400" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold text-slate-100 mt-4">{this.props.title ?? "Something went wrong"}</h2>
          <p className="text-sm text-slate-400 mt-1">NEXUS-COMPLY hit an unexpected condition. Your audit data is safe.</p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button className="btn-outline text-sm" onClick={() => (window.location.href = window.location.href)}>
              <RotateCcw className="w-4 h-4" aria-hidden="true" /> Reload console
            </button>
            <button className="btn-primary text-sm" onClick={this.reload}>
              Try again
            </button>
          </div>
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-300">Technical details</summary>
            <pre className="mt-2 overflow-auto rounded-lg bg-surface-950 border border-surface-700 p-3 text-[11px] text-slate-400 whitespace-pre-wrap">
              {this.state.detail}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}