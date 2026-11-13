// ITHUB_ADMIN/src/App.tsx
// Root Application with Staff Session Lifecycle, Route Guard & View Router

import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { LoaderCircle } from "lucide-react";
import { type StaffProfile, restoreStaffSession } from "./lib/auth";
import { StaffLogin } from "./components/StaffLogin";
import { AccessDenied } from "./components/AccessDenied";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Quotations } from "./pages/Quotations";
import { Services } from "./pages/Services";
import { WebsiteContent } from "./pages/WebsiteContent";
import { Certificates } from "./pages/Certificates";
import { Settings } from "./pages/Settings";
import { SellRequests } from "./pages/SellRequests";
import { Audits } from "./pages/Audits";
import { HardwareRegistry } from "./pages/HardwareRegistry";
import { HardwareModelDetail } from "./pages/HardwareModelDetail";
import { ShopifySync } from "./pages/ShopifySync";
import { HardwareActivity } from "./pages/HardwareActivity";
import { ShopifyImport } from "./pages/ShopifyImport";

export function App() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [unauthorizedCustomerEmail, setUnauthorizedCustomerEmail] = useState<string | null>(null);

  const initSession = async () => {
    setLoading(true);
    const res = await restoreStaffSession();
    setLoading(false);

    if (res.ok && res.profile) {
      setProfile(res.profile);
      setUnauthorizedCustomerEmail(null);
    } else if (res.isUnauthorizedCustomer) {
      setProfile(null);
      setUnauthorizedCustomerEmail(res.user?.email || "customer-session");
    } else {
      setProfile(null);
      setUnauthorizedCustomerEmail(null);
    }
  };

  useEffect(() => {
    initSession();
  }, []);

  const handleLoginSuccess = (staffProfile: StaffProfile) => {
    setProfile(staffProfile);
    setUnauthorizedCustomerEmail(null);
  };

  const handleUnauthorizedCustomer = (email: string) => {
    setProfile(null);
    setUnauthorizedCustomerEmail(email);
  };

  const handleSignOut = () => {
    setProfile(null);
    setUnauthorizedCustomerEmail(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <LoaderCircle size={36} className="mx-auto animate-spin text-blue-600" />
          <p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-500">
            Verifying Staff Credentials…
          </p>
        </div>
      </div>
    );
  }

  if (unauthorizedCustomerEmail) {
    return <AccessDenied email={unauthorizedCustomerEmail} onSignOut={handleSignOut} />;
  }

  if (!profile) {
    return (
      <StaffLogin
        onSuccess={handleLoginSuccess}
        onUnauthorizedCustomer={handleUnauthorizedCustomer}
      />
    );
  }

  return (
    <BrowserRouter>
      <Layout profile={profile} onSignOut={handleSignOut}>
        <Routes>
          <Route path="/" element={<Dashboard profile={profile} />} />
          <Route
            path="/quotations"
            element={
              profile.permissions.can_manage_quotations ? (
                <Quotations role={profile.role} userId={profile.user_id} />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          {/* Stage 4B: the Hardware Specification Manager, for Admin and Staff (the PC Builder rule). The database
              enforces the same rule on every read and change. */}
          <Route
            path="/hardware"
            element={
              profile.permissions.can_manage_quotations ? (
                <HardwareRegistry role={profile.role} />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/hardware/:id"
            element={
              profile.permissions.can_manage_quotations ? (
                <HardwareModelDetail role={profile.role} />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/hardware-sync"
            element={
              profile.permissions.can_manage_quotations ? (
                <ShopifySync role={profile.role} />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/hardware-import"
            element={
              profile.permissions.can_manage_quotations ? (
                <ShopifyImport role={profile.role} />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/hardware-activity"
            element={
              profile.permissions.can_manage_quotations ? (
                <HardwareActivity />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/services"
            element={
              profile.permissions.can_manage_services ? <Services /> : <Navigate to="/" replace />
            }
          />
          <Route
            path="/content"
            element={
              profile.permissions.can_manage_content ? (
                <WebsiteContent />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/certificates"
            element={
              profile.permissions.can_manage_content ? (
                <Certificates />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route path="/reviews" element={<Navigate to="/" replace />} />
          <Route
            path="/sell-requests"
            element={
              profile.permissions.can_manage_sell_requests ? (
                <SellRequests />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/audits"
            element={
              profile.permissions.can_view_analytics ? (
                <Audits profile={profile} />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/settings"
            element={
              profile.permissions.can_manage_settings ? <Settings /> : <Navigate to="/" replace />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
