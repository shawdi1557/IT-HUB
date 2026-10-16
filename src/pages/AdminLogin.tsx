// src/pages/AdminLogin.tsx
// IT HUB — Secure Admin Login Component
// Features: IT HUB branding, light theme, password visibility toggle, accessible error handling,
// and role verification via Supabase Auth.

import { useState, type FormEvent } from "react"
import { Link } from "react-router"
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  LoaderCircle,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  ArrowLeft,
  LogOut,
} from "lucide-react"
import logo from "../imports/ITHUBLOGO-1.jpeg"
import {
  signInAdminWithPassword,
  signOutUser,
  type CustomerProfile,
} from "../lib/auth"
import type { User } from "@supabase/supabase-js"

interface AdminLoginProps {
  onLoginSuccess: (user: User, profile: CustomerProfile) => void
}

export function AdminLogin({ onLoginSuccess }: AdminLoginProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (loading) return

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError("Please enter your administrator email address.")
      return
    }
    if (!password) {
      setError("Please enter your administrator password.")
      return
    }

    setLoading(true)
    setError("")

    try {
      const res = await signInAdminWithPassword(trimmedEmail, password)
      if (!res.ok) {
        setError(res.error || "Invalid credentials. Please try again.")
        setLoading(false)
        return
      }

      if (res.user && res.profile) {
        onLoginSuccess(res.user, res.profile)
      } else {
        setError("Failed to retrieve administrator profile.")
        setLoading(false)
      }
    } catch (err: any) {
      setError(
        err?.message || "An unexpected error occurred. Please try again.",
      )
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        {/* Main Card */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-xl shadow-slate-200/50">
          {/* Header & Logo */}
          <div className="text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-white p-2 shadow-sm">
              <img
                src={logo}
                alt="IT HUB Logo"
                className="h-full w-full object-contain"
              />
            </div>
            <div className="mt-4 flex items-center justify-center gap-1.5 text-xs font-semibold tracking-wider text-primary uppercase">
              <ShieldCheck size={15} />
              <span>Management Portal</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground font-display">
              Admin Sign In
            </h1>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Sign in with your verified administrator credentials to manage IT
              HUB operations and inventory.
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div
              role="alert"
              className="mt-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50/80 p-3.5 text-xs text-red-800"
            >
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-600" />
              <div className="flex-1 font-medium leading-relaxed">{error}</div>
            </div>
          )}

          {/* Form */}
          <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
            <div>
              <label
                htmlFor="admin-email"
                className="block text-xs font-semibold text-foreground"
              >
                Admin Email
              </label>
              <div className="relative mt-1.5">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
                  <Mail size={16} />
                </div>
                <input
                  id="admin-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  placeholder="admin@ithub.com"
                  className="block w-full rounded-lg border border-border bg-background py-2.5 pr-3 pl-10 text-sm text-foreground transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="admin-password"
                className="block text-xs font-semibold text-foreground"
              >
                Password
              </label>
              <div className="relative mt-1.5">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
                  <Lock size={16} />
                </div>
                <input
                  id="admin-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  placeholder="••••••••••••"
                  className="block w-full rounded-lg border border-border bg-background py-2.5 pr-10 pl-10 text-sm text-foreground transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground transition hover:text-foreground"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 px-4 text-sm font-semibold text-white shadow-md shadow-primary/25 transition hover:bg-[#0c2f8a] hover:shadow-lg hover:shadow-primary/30 focus:ring-2 focus:ring-primary/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <LoaderCircle size={16} className="animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <span>Sign In to Admin Workspace</span>
              )}
            </button>
          </form>

          {/* Footer Security Note */}
          <div className="mt-6 border-t border-border pt-4 text-center">
            <p className="text-[11px] text-muted-foreground">
              Protected by Supabase Auth with Row Level Security.
            </p>
          </div>
        </div>

        {/* Back to store navigation */}
        <div className="mt-6 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-primary"
          >
            <ArrowLeft size={14} />
            <span>Return to IT HUB Storefront</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

interface AdminAccessDeniedProps {
  customerEmail: string
  onSignOut: () => void
}

export function AdminAccessDenied({
  customerEmail,
  onSignOut,
}: AdminAccessDeniedProps) {
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    await signOutUser()
    setSigningOut(false)
    onSignOut()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="overflow-hidden rounded-2xl border border-red-200 bg-card p-8 shadow-xl shadow-red-100/30">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <ShieldAlert size={36} />
            </div>
            <h1 className="mt-4 text-xl font-bold tracking-tight text-foreground font-display">
              Access Denied
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              You are signed in as{" "}
              <strong className="text-foreground">{customerEmail}</strong>. This
              account does not have administrative privileges for the IT HUB
              operations portal.
            </p>
          </div>

          <div className="mt-6 space-y-3">
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 px-4 text-sm font-semibold text-white transition hover:bg-[#0c2f8a] disabled:opacity-60"
            >
              {signingOut ? (
                <>
                  <LoaderCircle size={16} className="animate-spin" />
                  <span>Signing out...</span>
                </>
              ) : (
                <>
                  <LogOut size={16} />
                  <span>Sign Out & Switch Account</span>
                </>
              )}
            </button>

            <Link
              to="/"
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background py-2.5 px-4 text-sm font-semibold text-foreground transition hover:bg-muted"
            >
              <ArrowLeft size={16} />
              <span>Return to Storefront</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export function AdminAuthLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-white p-2 shadow-sm">
          <img
            src={logo}
            alt="IT HUB Logo"
            className="h-full w-full object-contain"
          />
        </div>
        <div className="mt-5 flex items-center justify-center gap-2 text-xs font-semibold text-primary">
          <LoaderCircle size={16} className="animate-spin" />
          <span>Verifying administrator authorization...</span>
        </div>
      </div>
    </div>
  )
}
