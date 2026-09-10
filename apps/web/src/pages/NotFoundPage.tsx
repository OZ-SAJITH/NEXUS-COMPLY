import { Link } from "react-router-dom";
import { Compass } from "lucide-react";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center gap-4">
      <Compass className="w-10 h-10 text-accent" aria-hidden="true" />
      <h1 className="text-3xl font-bold text-slate-100">404 · Route not found</h1>
      <p className="text-sm text-slate-500 max-w-sm">
        The page you're looking for doesn't exist or has moved.
      </p>
      <div className="flex gap-3 mt-2">
        <Link to="/app" className="btn-primary">Go to Dashboard</Link>
        <Link to="/" className="btn-outline">Product overview</Link>
      </div>
    </div>
  );
}