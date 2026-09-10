import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import AppShell from "./components/AppShell";
import LandingPage from "./pages/LandingPage";
import DashboardPage from "./pages/DashboardPage";
import AuditPage from "./pages/AuditPage";
import AuditResultPage from "./pages/AuditResultPage";
import AuditHistoryPage from "./pages/AuditHistoryPage";
import ReportsPage from "./pages/ReportsPage";
import CompliancePage from "./pages/CompliancePage";
import InfrastructurePage from "./pages/InfrastructurePage";
import IntelligencePage from "./pages/IntelligencePage";
import SettingsPage from "./pages/SettingsPage";
import FindingDetailPage from "./pages/FindingDetailPage";
import ReviewsPage from "./pages/ReviewsPage";
import NotFoundPage from "./pages/NotFoundPage";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}

function RedirectToAudit() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/app/audits/${id}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Navigate to="/app" replace />} />

        <Route path="/app" element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="reviews" element={<ReviewsPage />} />
          <Route path="audits/new" element={<AuditPage />} />
          <Route path="audits/history" element={<AuditHistoryPage />} />
          <Route path="audits/:id" element={<AuditResultPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="compliance" element={<CompliancePage />} />
          <Route path="compliance/frameworks" element={<CompliancePage />} />
          <Route path="compliance/controls" element={<CompliancePage />} />
          <Route path="compliance/findings" element={<CompliancePage />} />
          <Route path="infrastructure" element={<InfrastructurePage />} />
          <Route path="infrastructure/devices" element={<InfrastructurePage />} />
          <Route path="infrastructure/networks" element={<InfrastructurePage />} />
          <Route path="infrastructure/assets" element={<InfrastructurePage />} />
          <Route path="intelligence" element={<IntelligencePage />} />
          <Route path="intelligence/risk" element={<IntelligencePage />} />
          <Route path="intelligence/recommendations" element={<IntelligencePage />} />
          <Route path="findings/:id" element={<FindingDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* Legacy route aliases — keep old bookmarks working */}
        <Route path="/dashboard" element={<Navigate to="/app" replace />} />
        <Route path="/audit" element={<Navigate to="/app/audits/new" replace />} />
        <Route path="/audit/:id" element={<RedirectToAudit />} />
        <Route path="/reports" element={<Navigate to="/app/reports" replace />} />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}