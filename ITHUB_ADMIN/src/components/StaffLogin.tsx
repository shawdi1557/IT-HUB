// ITHUB_ADMIN/src/components/StaffLogin.tsx
// IT HUB — Staff Portal Login Screen
// Supports Email OTP (Magic Code) & Password Authentication with server role verification

import { useState, type FormEvent } from "react";
import {
  Lock,
  Mail,
  KeyRound,
  ShieldCheck,
  LoaderCircle,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  requestStaffEmailOtp,
  verifyStaffEmailOtp,
  signInStaffWithPassword,
  type StaffProfile,
} from "../lib/auth";
import ithubLogo from "../assets/ithub-logo.jpeg";

interface StaffLoginProps {
  onSuccess: (profile: StaffProfile) => void;
  onUnauthorizedCustomer: (email: string) => void;
}

export function StaffLogin({ onSuccess, onUnauthorizedCustomer }: StaffLoginProps) {
  // Default to password authentication (the primary method matching Supabase admin config)
  const [authMode, setAuthMode] = useState<"password" | "otp">("password");
  const [email, setEmail] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isAccountNotFound, setIsAccountNotFound] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const handleSendOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setError("");
    setStatusMsg("");
    setIsAccountNotFound(false);
    setLoading(true);

    const res = await requestStaffEmailOtp(email);
    setLoading(false);

    if (!res.ok) {
      if (res.isAccountNotFound) {
        setIsAccountNotFound(true);
      }
      setError(res.error || "Failed to dispatch verification code.");
      return;
    }

    setOtpSent(true);
    setStatusMsg(res.message || `Verification code dispatched to ${email.trim()}`);
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setError("");
    setLoading(true);

    const res = await verifyStaffEmailOtp(email, otpToken);
    setLoading(false);

    if (!res.ok) {
      if (res.isUnauthorizedCustomer) {
        onUnauthorizedCustomer(email.trim());
        return;
      }
      setError(res.error || "Verification failed.");
      return;
    }

    if (res.profile) {
      onSuccess(res.profile);
    }
  };

  const handlePasswordSignIn = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setError("");
    setLoading(true);

    const res = await signInStaffWithPassword(email, password);
    setLoading(false);

    if (!res.ok) {
      if (res.isUnauthorizedCustomer) {
        onUnauthorizedCustomer(email.trim());
        return;
      }
      setError(res.error || "Sign in failed.");
      return;
    }

    if (res.profile) {
      onSuccess(res.profile);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        {/* Main Brand Card */}
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-md p-8 shadow-xl shadow-slate-200/60">
          {/* Header & IT HUB Logo */}
          <div className="text-center flex flex-col items-center">
            <div className="flex h-20 w-auto items-center justify-center rounded-2xl bg-slate-50 p-2.5 border border-slate-200/80 shadow-xs">
              <img src={ithubLogo} alt="IT HUB" className="h-full w-auto object-contain" />
            </div>

            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 tracking-wider uppercase border border-blue-100">
              <ShieldCheck size={13} />
              <span>Staff Portal</span>
            </div>

            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">
              SERVICE &amp; PC PORTAL
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              Authorized IT HUB Workshop &amp; Quotation Management
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="mt-6 flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setAuthMode("password");
                setError("");
                setIsAccountNotFound(false);
              }}
              className={`flex-1 rounded-lg py-2.5 min-h-[40px] transition ${
                authMode === "password"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode("otp");
                setError("");
                setIsAccountNotFound(false);
              }}
              className={`flex-1 rounded-lg py-2.5 min-h-[40px] transition ${
                authMode === "otp"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Email OTP
            </button>
          </div>

          {/* Status / Error Alerts */}
          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800">
              <div className="flex items-start gap-2.5">
                <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-700" />
                <div className="flex-1">
                  <p className="font-semibold text-red-900">
                    {isAccountNotFound ? "Staff Account Not Registered" : "Authentication Notice"}
                  </p>
                  <p className="mt-0.5 leading-relaxed text-red-800">{error}</p>
                  {isAccountNotFound && authMode === "otp" && (
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode("password");
                        setError("");
                        setIsAccountNotFound(false);
                      }}
                      className="mt-2.5 inline-flex items-center gap-1 font-bold text-blue-700 hover:text-blue-900 underline"
                    >
                      Try Password Sign In Instead &rarr;
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {statusMsg && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              <span>{statusMsg}</span>
            </div>
          )}

          {/* Form Content */}
          {authMode === "otp" ? (
            !otpSent ? (
              <form onSubmit={handleSendOtp} className="mt-6 space-y-4">
                <div className="rounded-lg bg-blue-50/70 border border-blue-100 p-2.5 text-[11px] text-blue-900 leading-relaxed">
                  <span className="font-bold">Existing Staff Only:</span> One-time codes are
                  delivered only to accounts pre-registered in Supabase Auth.
                </div>

                <div>
                  <label
                    htmlFor="staff-email"
                    className="block text-xs font-bold text-slate-700 uppercase tracking-wider"
                  >
                    Staff Email Address
                  </label>
                  <div className="relative mt-1.5">
                    <Mail size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                    <input
                      id="staff-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="technician@ithubkothamangalam.com"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 min-h-[44px] text-sm font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {loading ? (
                    <>
                      <LoaderCircle size={18} className="animate-spin" /> Dispatching Code…
                    </>
                  ) : (
                    <>
                      Send Verification Code <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="mt-6 space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="staff-otp"
                      className="block text-xs font-bold text-slate-700 uppercase tracking-wider"
                    >
                      6-Digit Security Code
                    </label>
                    <button
                      type="button"
                      onClick={() => setOtpSent(false)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Change Email
                    </button>
                  </div>
                  <div className="relative mt-1.5">
                    <KeyRound size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                    <input
                      id="staff-otp"
                      type="text"
                      required
                      maxLength={8}
                      autoFocus
                      value={otpToken}
                      onChange={(e) => setOtpToken(e.target.value.replace(/\D/g, ""))}
                      placeholder="123456"
                      className="w-full tracking-widest text-center font-mono text-lg font-bold rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || otpToken.length < 6}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 min-h-[44px] text-sm font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {loading ? (
                    <>
                      <LoaderCircle size={18} className="animate-spin" /> Verifying Credentials…
                    </>
                  ) : (
                    <>
                      Verify &amp; Enter Portal <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            )
          ) : (
            <form onSubmit={handlePasswordSignIn} className="mt-6 space-y-4">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-[11px] text-slate-600 leading-relaxed">
                Sign in with your verified administrator or technician credentials.
              </div>

              <div>
                <label
                  htmlFor="staff-pwd-email"
                  className="block text-xs font-bold text-slate-700 uppercase tracking-wider"
                >
                  Staff Email
                </label>
                <div className="relative mt-1.5">
                  <Mail size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                  <input
                    id="staff-pwd-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="technician@ithubkothamangalam.com"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="staff-password"
                  className="block text-xs font-bold text-slate-700 uppercase tracking-wider"
                >
                  Password
                </label>
                <div className="relative mt-1.5">
                  <Lock size={16} className="absolute left-3.5 top-3.5 text-slate-400" />
                  <input
                    id="staff-password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 pl-10 pr-10 text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !email.trim() || !password}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 min-h-[44px] text-sm font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {loading ? (
                  <>
                    <LoaderCircle size={18} className="animate-spin" /> Authenticating…
                  </>
                ) : (
                  <>
                    Sign In to Portal <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Security Notice */}
          <div className="mt-6 border-t border-slate-100 pt-4 text-center">
            <p className="text-[11px] text-slate-400">
              Strict access control enforced. All staff interactions are immutably logged for audit.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
