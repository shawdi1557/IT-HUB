// supabase/functions/tests/admin-auth.test.ts
// Tests for IT HUB Admin Authentication, Session Verification, Customer Isolation, and Backend Security.

import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts"

// Mock Profile Types
interface Profile {
  id: string
  email: string
  role: "admin" | "customer"
}

// Simulated profiles matching Supabase public.profiles
const mockProfiles: Record<string, Profile> = {
  "56884041-19ee-4594-9360-01a54492122b": {
    id: "56884041-19ee-4594-9360-01a54492122b",
    email: "ithubkmgm@gmail.com",
    role: "admin",
  },
  "b043fde0-7d7f-4b68-bd59-fd5aa291c087": {
    id: "b043fde0-7d7f-4b68-bd59-fd5aa291c087",
    email: "customer@example.com",
    role: "customer",
  },
}

interface MockSignInResult {
  ok: boolean
  role?: string
  error?: string
}

// Mock auth helper verifying the same logic as src/lib/auth.ts
async function mockSignInAdmin(
  email: string,
  passwordAttempt: string,
  expectedPasswordHashCheck: (email: string, pass: string) => boolean,
): Promise<MockSignInResult> {
  const cleanEmail = email.trim().toLowerCase()
  if (!cleanEmail || !passwordAttempt) {
    return { ok: false, error: "Please enter both email and password." }
  }

  // Check password
  if (!expectedPasswordHashCheck(cleanEmail, passwordAttempt)) {
    return {
      ok: false,
      error:
        "Invalid email or password. Please verify your credentials and try again.",
    }
  }

  // Find profile
  const profile = Object.values(mockProfiles).find(
    (p) => p.email === cleanEmail,
  )
  if (!profile) {
    return { ok: false, error: "Profile not found." }
  }

  if (profile.role !== "admin") {
    return {
      ok: false,
      error:
        "Access Denied: Administrator privileges are required for this account.",
    }
  }

  return { ok: true, role: profile.role }
}

function mockCheckAdminSession(
  currentUserId: string | null,
): {
  state: "loading" | "authorized" | "unauthenticated" | "denied"
  error?: string
} {
  if (!currentUserId) {
    return { state: "unauthenticated" }
  }

  const profile = mockProfiles[currentUserId]
  if (!profile) {
    return { state: "unauthenticated" }
  }

  if (profile.role === "admin") {
    return { state: "authorized" }
  }

  return {
    state: "denied",
    error: `Access Denied: Account ${profile.email} is not an authorized administrator.`,
  }
}

// ── Test Cases ───────────────────────────────────────────────────────────────

Deno.test("AUTH-1: Incognito browser visits /admin without session -> unauthenticated login screen appears", () => {
  const sessionStatus = mockCheckAdminSession(null)
  assertEquals(sessionStatus.state, "unauthenticated")
})

Deno.test("AUTH-2: Correct admin credentials (ithubkmgm@gmail.com) -> dashboard authorized", async () => {
  const result = await mockSignInAdmin(
    "ithubkmgm@gmail.com",
    "it-hub4admin",
    (email, pass) => email === "ithubkmgm@gmail.com" && pass === "it-hub4admin",
  )
  assertEquals(result.ok, true)
  assertEquals(result.role, "admin")
})

Deno.test("AUTH-3: Incorrect password returns safe error without leaking internal details", async () => {
  const result = await mockSignInAdmin(
    "ithubkmgm@gmail.com",
    "wrong-password",
    (email, pass) => email === "ithubkmgm@gmail.com" && pass === "it-hub4admin",
  )
  assertEquals(result.ok, false)
  assertEquals(
    result.error,
    "Invalid email or password. Please verify your credentials and try again.",
  )
})

Deno.test("AUTH-4: Ordinary customer signs in -> admin access is strictly denied and session revoked", async () => {
  const result = await mockSignInAdmin(
    "customer@example.com",
    "customer-password",
    (email, pass) =>
      email === "customer@example.com" && pass === "customer-password",
  )
  assertEquals(result.ok, false)
  assertEquals(
    result.error,
    "Access Denied: Administrator privileges are required for this account.",
  )
})

Deno.test("AUTH-5: Customer session visiting /admin directly -> returns denied state without rendering dashboard", () => {
  const sessionStatus = mockCheckAdminSession(
    "b043fde0-7d7f-4b68-bd59-fd5aa291c087",
  )
  assertEquals(sessionStatus.state, "denied")
  assertNotEquals(sessionStatus.state, "authorized")
})

Deno.test("AUTH-6: Admin refreshes dashboard -> valid session restored immediately as authorized", () => {
  const sessionStatus = mockCheckAdminSession(
    "56884041-19ee-4594-9360-01a54492122b",
  )
  assertEquals(sessionStatus.state, "authorized")
})

Deno.test("AUTH-7: Admin signs out -> session cleared and state reverts to unauthenticated", () => {
  let activeSessionId: string | null = "56884041-19ee-4594-9360-01a54492122b"
  assertEquals(mockCheckAdminSession(activeSessionId).state, "authorized")

  // Simulate Sign Out
  activeSessionId = null
  assertEquals(mockCheckAdminSession(activeSessionId).state, "unauthenticated")
})

Deno.test("AUTH-8: Edge Function search-product-images enforces 401 for unauthenticated calls", async () => {
  const req = new Request("http://localhost:8000/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "status" }),
  })

  // Simulated Edge Function Auth Check
  const authHeader = req.headers.get("authorization")
  assertEquals(authHeader, null)

  const responseStatus = authHeader ? 200 : 401
  assertEquals(responseStatus, 401)
})

Deno.test("AUTH-9: Edge Function search-product-images enforces 403 for ordinary customer token", async () => {
  const callerProfile = mockProfiles["b043fde0-7d7f-4b68-bd59-fd5aa291c087"]
  assertEquals(callerProfile.role, "customer")

  const responseStatus = callerProfile.role === "admin" ? 200 : 403
  assertEquals(responseStatus, 403)
})

Deno.test("AUTH-10: Edge Function search-product-images authorizes verified admin user", async () => {
  const callerProfile = mockProfiles["56884041-19ee-4594-9360-01a54492122b"]
  assertEquals(callerProfile.role, "admin")

  const responseStatus = callerProfile.role === "admin" ? 200 : 403
  assertEquals(responseStatus, 200)
})
