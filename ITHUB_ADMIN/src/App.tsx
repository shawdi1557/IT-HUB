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
                <Quotations />
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
          <Route path="/content" element={<WebsiteContent />} />
          <Route path="/certificates" element={<Certificates />} />
          <Route path="/reviews" element={<Navigate to="/" replace />} />
          <Route path="/sell-requests" element={<SellRequests />} />
          <Route path="/audits" element={<Audits profile={profile} />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
