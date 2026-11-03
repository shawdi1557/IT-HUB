import { useRef, useState } from "react";
import { useStore } from "../app/store";
import { updateCustomerProfile } from "../lib/auth";
import { CHECKOUT_EMAIL_REQUIRED, isValidCheckoutEmail } from "../lib/shopify-orders";
import { Button, Modal } from "./ui";

/**
 * Asks for the email address that order confirmations and delivery updates go to. It's a contact
 * detail stored on the profile. It never touches Supabase Auth, so it can't be used to sign in.
 */
export default function CheckoutEmailPrompt({
  open,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  onSubmit: (email: string) => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  return (
    <Modal
      size="max-w-md"
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title="Where should we send your order updates?"
      description="We need an email address for your order confirmation and delivery updates. You'll still sign in with your mobile number."
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!isValidCheckoutEmail(email)) {
            setError("Please enter a valid email address.");
            return;
          }
          setError("");
          onSubmit(email.trim());
        }}
      >
        <label htmlFor="checkout-email" className="mb-2 block text-xs font-semibold">
          Email address
        </label>
        <input
          id="checkout-email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(error)}
          className="w-full rounded-xl border border-border bg-card px-4 py-3.5 text-sm focus:border-primary focus:ring-4 focus:ring-primary/10"
        />
        {error && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="mt-5 w-full">
          Continue to checkout
        </Button>
      </form>
    </Modal>
  );
}

/**
 * Checkout's email requirement. `ensureEmail` resolves to the customer's address, asking for it
 * first if the profile has none, or to null if they decline, which must stop the checkout.
 */
export function useCheckoutEmail() {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const settle = useRef<((email: string | null) => void) | null>(null);

  const finish = (email: string | null) => {
    setOpen(false);
    settle.current?.(email);
    settle.current = null;
  };

  const ensureEmail = (): Promise<string | null> => {
    const saved = (store.profile.email || "").trim();
    if (isValidCheckoutEmail(saved)) return Promise.resolve(saved);
    return new Promise((resolve) => {
      settle.current = resolve;
      setOpen(true);
    });
  };

  const emailPrompt = (
    <CheckoutEmailPrompt
      open={open}
      onCancel={() => finish(null)}
      onSubmit={(email) => {
        store.set((state) => ({ profile: { ...state.profile, email } }));
        // The order can go ahead if this fails: Shopify receives the address either way.
        updateCustomerProfile({ email }).catch(() => {});
        finish(email);
      }}
    />
  );

  return { ensureEmail, emailPrompt, emailRequiredMessage: CHECKOUT_EMAIL_REQUIRED };
}
