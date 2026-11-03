import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, LockKeyhole, RefreshCw, Smartphone } from "lucide-react";
import { useStore } from "../app/store";
import { Button, Modal } from "./ui";
import {
  sendPhoneOtp,
  verifyPhoneOtp,
  isValidIndianMobile,
  formatIndianPhoneToE164,
} from "../lib/auth";

// Matches the wait between codes that the production Auth settings enforce.
const RESEND_SECONDS = 60;

export default function AuthModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const store = useStore();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [timer, setTimer] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!open) {
      setStep("phone");
      setOtp(["", "", "", "", "", ""]);
      setError("");
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (timer <= 0) return;
    const id = setTimeout(() => setTimer(timer - 1), 1000);
    return () => clearTimeout(id);
  }, [timer]);

  const valid = isValidIndianMobile(phone);

  const send = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError("");

    try {
      const res = await sendPhoneOtp(phone);
      if (!res.ok) {
        setError(res.error || "We couldn't send a code. Please try again.");
        return;
      }

      setTimer(RESEND_SECONDS);
      setOtp(["", "", "", "", "", ""]);
      setStep("otp");
      store.notify(`Code sent by SMS to ${res.formattedPhone}`);

      setTimeout(() => inputs.current[0]?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    const entered = otp.join("");
    if (entered.length < 6 || loading) return;
    setLoading(true);
    setError("");

    try {
      const res = await verifyPhoneOtp(phone, entered);
      if (!res.ok) {
        setError(res.error || "That code is incorrect or has expired.");
        return;
      }

      const formatted = formatIndianPhoneToE164(phone);
      const existingPhone = store.profile.phone;
      const isNew = !existingPhone || existingPhone !== formatted;

      store.set((s) => ({
        loggedIn: true,
        profile: {
          ...s.profile,
          id: res.user?.id || res.profile?.id || s.profile.id,
          role: res.profile?.role || s.profile.role || "customer",
          phone: res.profile?.phone || formatted,
          name: res.profile?.full_name || s.profile.name || "",
          email: res.profile?.email || s.profile.email || "",
          address: res.profile?.address || s.profile.address || "",
        },
      }));

      store.notify(isNew ? "Welcome to IT HUB! Your account is active." : "Welcome back!");
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const type = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < 5) inputs.current[index + 1]?.focus();
  };

  return (
    <Modal
      size="max-w-md"
      open={open}
      onOpenChange={onOpenChange}
      title={step === "phone" ? "Login or sign up" : "Enter your code"}
      description={
        step === "phone"
          ? "Enter your mobile number and we'll text you a 6-digit code. No password needed."
          : `We texted a 6-digit code to +91 ${phone}.`
      }
    >
      {step === "phone" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label className="mb-2 block text-xs font-semibold">Mobile number</label>
          <div className="flex items-center overflow-hidden rounded-xl border border-border bg-card focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
            <span className="flex items-center gap-2 border-r border-border bg-muted px-4 py-3.5 text-sm font-semibold">
              🇮🇳 +91
            </span>
            <input
              inputMode="numeric"
              autoComplete="tel-national"
              autoFocus
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              placeholder="98765 43210"
              aria-label="10-digit mobile number"
              className="w-full bg-transparent px-4 py-3.5 text-base tracking-wider"
            />
            <Smartphone size={18} className="mr-4 shrink-0 text-muted-foreground" />
          </div>
          {phone.length === 10 && !valid && (
            <p className="mt-2 text-xs text-destructive">Enter a valid Indian mobile number.</p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            New to IT HUB? Your account is created when you enter the code. Only Indian mobile
            numbers (+91) are supported.
          </p>
          <Button type="submit" disabled={!valid || loading} className="mt-5 w-full">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw size={16} className="animate-spin" /> Sending code...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                Send code <ArrowRight size={16} />
              </span>
            )}
          </Button>
          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            By continuing you agree to IT HUB's terms and privacy policy.
          </p>
        </form>
      )}

      {step === "otp" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            verify();
          }}
        >
          <div className="flex justify-between gap-2">
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                value={digit}
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                aria-label={`OTP digit ${i + 1}`}
                onChange={(e) => type(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !digit && i > 0) inputs.current[i - 1]?.focus();
                }}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                  if (text.length === 6) {
                    e.preventDefault();
                    setOtp(text.split(""));
                    inputs.current[5]?.focus();
                  }
                }}
                className="h-14 w-full min-w-0 rounded-xl border border-border bg-card text-center text-xl font-semibold focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
            ))}
          </div>
          {error && (
            <p role="alert" className="mt-3 text-xs text-destructive">
              {error}
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            The code only works for a short time. If it expires, request a new one.
          </p>
          <Button
            type="submit"
            disabled={otp.join("").length < 6 || loading}
            className="mt-5 w-full"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw size={16} className="animate-spin" /> Checking code...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                Verify & continue <ArrowRight size={16} />
              </span>
            )}
          </Button>
          <div className="mt-6 border-t border-border pt-5 text-center">
            <button
              type="button"
              disabled={timer > 0 || loading}
              onClick={send}
              className="text-xs font-semibold text-primary disabled:text-muted-foreground"
            >
              {timer > 0 ? `Didn't get it? Resend in ${timer}s` : "Resend code"}
            </button>
            <div>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setStep("phone");
                }}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary"
              >
                <ArrowLeft size={14} /> Change number
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}

export interface LoginGateProps {
  title: string;
  text: string;
}

export function LoginGate({ title, text }: LoginGateProps) {
  const store = useStore();
  return (
    <section className="mx-auto my-16 max-w-lg rounded-3xl border border-border bg-card p-10 text-center shadow-sm">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary">
        <LockKeyhole size={24} />
      </span>
      <h1 className="mt-6 text-2xl font-bold tracking-[-.02em]">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{text}</p>
      <Button className="mt-7" onClick={() => store.setAuthOpen(true)}>
        Login with mobile number <ArrowRight size={16} />
      </Button>
    </section>
  );
}
