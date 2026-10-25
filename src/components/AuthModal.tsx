import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  LockKeyhole,
  MessageSquareText,
  Smartphone,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import WhatsAppIcon from "./WhatsAppIcon";
import { useStore } from "../app/store";
import { Button, Modal } from "./ui";
import {
  sendPhoneOtp,
  verifyPhoneOtp,
  isValidIndianMobile,
  formatIndianPhoneToE164,
} from "../lib/auth";

const RESEND_SECONDS = 30;

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
  const [code, setCode] = useState("");
  const [isSimulated, setIsSimulated] = useState(false);
  const [channel, setChannel] = useState<"SMS" | "WhatsApp">("SMS");
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

  const send = async (via: "SMS" | "WhatsApp") => {
    if (!valid || loading) return;
    setLoading(true);
    setError("");

    try {
      const res = await sendPhoneOtp(phone, via);
      if (!res.ok) {
        setError(res.error || "Failed to send verification code. Please try again.");
        setLoading(false);
        return;
      }

      setChannel(via);
      setTimer(RESEND_SECONDS);
      setOtp(["", "", "", "", "", ""]);
      setStep("otp");
      setIsSimulated(Boolean(res.isSimulated));

      if (res.isSimulated && res.demoCode) {
        setCode(res.demoCode);
        store.notify(`Demo code: ${res.demoCode} (configure Supabase Auth for real SMS)`);
      } else {
        setCode("");
        store.notify(`Verification code sent via SMS to ${res.formattedPhone}`);
      }

      setTimeout(() => inputs.current[0]?.focus(), 50);
    } catch (err: any) {
      setError(err?.message || "Could not connect to authentication service.");
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
      const res = await verifyPhoneOtp(phone, entered, isSimulated ? code : undefined);
      if (!res.ok) {
        setError(res.error || "Incorrect verification code. Please try again.");
        setLoading(false);
        return;
      }

      const formatted = formatIndianPhoneToE164(phone);
      const existingPhone = store.profile.phone;
      const isNew = !existingPhone || existingPhone !== formatted;

      store.set((s) => ({
        loggedIn: true,
        profile: {
          ...s.profile,
          phone: formatted,
          name: res.profile?.full_name || s.profile.name || "",
          email: res.profile?.email || s.profile.email || "",
          address: res.profile?.address || s.profile.address || "",
        },
      }));

      store.notify(isNew ? "Welcome to IT HUB! Your account is active." : "Welcome back!");
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || "Verification request failed.");
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
      title={step === "phone" ? "Login or sign up" : "Verify your number"}
      description={
        step === "phone"
          ? "Use your mobile number to continue. New here? We'll create your account."
          : `Enter the 6-digit code sent via ${channel} to +91 ${phone}.`
      }
    >
      {step === "phone" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) send("SMS");
          }}
        >
          <label className="mb-2 block text-xs font-semibold">Mobile number</label>
          <div className="flex items-center overflow-hidden rounded-xl border border-border bg-card focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
            <span className="flex items-center gap-2 border-r border-border bg-muted px-4 py-3.5 text-sm font-semibold">
              🇮🇳 +91
            </span>
            <input
              inputMode="numeric"
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
          <Button type="submit" disabled={!valid || loading} className="mt-6 w-full">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw size={16} className="animate-spin" /> Sending verification code...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                Send OTP <ArrowRight size={16} />
              </span>
            )}
          </Button>
          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            By continuing you agree to IT HUB's terms and privacy policy.
          </p>
        </form>
      ) : (
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
          {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
          {isSimulated && code ? (
            <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-[11px] text-secondary-foreground">
              Development fallback mode: your test code is <b>{code}</b>.
            </p>
          ) : (
            <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
              <CheckCircle2 size={13} className="shrink-0 text-emerald-600" />
              Verification code dispatched via Supabase Auth to +91 {phone}.
            </p>
          )}
          <Button
            type="submit"
            disabled={otp.join("").length < 6 || loading}
            className="mt-5 w-full"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw size={16} className="animate-spin" /> Verifying code...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                Verify & continue <ArrowRight size={16} />
              </span>
            )}
          </Button>
          <div className="mt-6 border-t border-border pt-5 text-center">
            <p className="text-xs text-muted-foreground">
              Didn't receive the OTP?{" "}
              {timer > 0 && <span>Resend in 0:{String(timer).padStart(2, "0")}</span>}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={timer > 0}
                onClick={() => send("SMS")}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-xs font-semibold transition hover:border-primary hover:text-primary disabled:opacity-40"
              >
                <MessageSquareText size={15} /> Resend via SMS
              </button>
              <button
                type="button"
                disabled={timer > 0}
                onClick={() => send("WhatsApp")}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-xs font-semibold transition hover:border-[#25D366] hover:text-[#1da851] disabled:opacity-40"
              >
                <WhatsAppIcon size={15} /> Resend via WhatsApp
              </button>
            </div>
            <button
              type="button"
              onClick={() => setStep("phone")}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-primary"
            >
              <ArrowLeft size={14} /> Change number
            </button>
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
