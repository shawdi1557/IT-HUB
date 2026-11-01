// ITHUB_ADMIN/src/components/AccessDenied.tsx
// Shield displayed when an authenticated user lacks staff portal authorization

import { ShieldAlert, LogOut, ArrowLeft } from "lucide-react";
import { signOutStaff } from "../lib/auth";
import ithubLogo from "../assets/ithub-logo.jpeg";

interface AccessDeniedProps {
  email?: string;
  onSignOut: () => void;
}

export function AccessDenied({ email, onSignOut }: AccessDeniedProps) {
  const handleSignOut = async () => {
    await signOutStaff();
    onSignOut();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-xl">
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-auto items-center justify-center rounded-xl bg-slate-50 p-2 border border-slate-200">
            <img src={ithubLogo} alt="IT HUB" className="h-full w-auto object-contain" />
          </div>
        </div>

        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-600 ring-8 ring-red-50/50">
          <ShieldAlert size={36} />
        </div>

        <h1 className="mt-5 text-xl font-bold tracking-tight text-slate-900">
          Unauthorized Access
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          Staff authorization is strictly required to view the IT HUB Service &amp; PC Portal.
        </p>

        {email && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 font-mono">
            Signed in as: <strong className="text-slate-800">{email}</strong>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-left text-xs text-amber-800">
          <p className="font-semibold">Security Policy Notice:</p>
          <p className="mt-1">
            Customer credentials do not confer staff portal privileges. If you are an IT HUB
            employee, please contact your portal administrator to verify your staff assignment.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={handleSignOut}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition min-h-[44px]"
          >
            <LogOut size={16} /> Sign Out &amp; Switch Account
          </button>

          <a
            href="/"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition min-h-[44px]"
          >
            <ArrowLeft size={16} /> Return to Login
          </a>
        </div>
      </div>
    </div>
  );
}
