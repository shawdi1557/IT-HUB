// Real, signed-in synthetic users for database tests, so RPCs see a true caller.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";
import { TEST_ANON_KEY, TEST_SERVICE_KEY, TEST_SUPABASE_URL } from "./disposable_env.ts";

const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false } };

/** Creates a confirmed user, optionally a staff member, and returns a client signed in as them. */
export async function createSignedInUser(label: string, staffRole?: string) {
  const service = createClient(TEST_SUPABASE_URL, TEST_SERVICE_KEY, NO_SESSION);
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const password = `Synthetic-${crypto.randomUUID()}`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    phone: `+918${String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000_000).padStart(9, "0")}`,
    phone_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw new Error(`Fixture user: ${created.error?.message}`);
  }
  const id = created.data.user.id;
  if (staffRole) {
    const staff = await service
      .from("staff_members")
      .insert({ user_id: id, role: staffRole, full_name: "Synthetic Staff", email });
    if (staff.error) throw new Error(`Fixture staff: ${staff.error.message}`);
  }
  const client = createClient(TEST_SUPABASE_URL, TEST_ANON_KEY, NO_SESSION);
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw new Error(`Fixture sign-in: ${signed.error.message}`);
  return { id, email, client };
}
