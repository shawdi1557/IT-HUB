import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import WhatsAppIcon from "./WhatsAppIcon";
import { useStore } from "../app/store";
import { type WarrantyResult } from "../data/catalog";
import { lookupPincodeCoverage } from "../lib/pincodeLookup";
import { Button, fieldClass } from "./ui";

type Props = {
  source: string;
  /** When provided, the check runs automatically whenever this PIN becomes a valid 6-digit code. */
  pincode?: string;
  compact?: boolean;
  className?: string;
};

export default function WarrantyCheck({ source, pincode, compact, className = "" }: Props) {
  const store = useStore();
  const [pin, setPin] = useState(pincode || "");
  const [result, setResult] = useState<WarrantyResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const lastChecked = useRef("");
  const pendingCheckRef = useRef<string | null>(null);

  const run = async (value: string, force = false) => {
    const clean = value.trim().replace(/\D/g, "").slice(0, 6);

    if (!/^[1-9]\d{5}$/.test(clean)) {
      setResult({ status: "invalid", message: "Please enter a valid 6-digit PIN code." });
      return;
    }

    // Prevent duplicate requests unless forced (e.g. retry clicked)
    if (!force && isChecking) return;
    if (!force && lastChecked.current === clean && result) return;

    setIsChecking(true);
    pendingCheckRef.current = clean;

    try {
      const next = await lookupPincodeCoverage(clean, store.locations);

      // Verify response matches current active request
      if (pendingCheckRef.current === clean) {
        setResult(next);
        lastChecked.current = clean;

        if (next.status !== "invalid") {
          store.set((previous) => ({
            warrantyChecks: [
              {
                id: crypto.randomUUID(),
                pincode: clean,
                area: "area" in next ? next.area : "",
                result: next.status,
                distanceKm: "distanceKm" in next ? next.distanceKm : null,
                source,
                date: new Date().toISOString(),
              },
              ...previous.warrantyChecks,
            ],
          }));
        }
      }
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    if (pincode === undefined) return;
    setPin(pincode);
    if (/^[1-9]\d{5}$/.test(pincode.trim())) {
      if (pincode.trim() !== lastChecked.current) {
        run(pincode);
      }
    } else {
      setResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pincode]);

  const whatsapp = `https://wa.me/${store.settings.whatsapp}?text=${encodeURIComponent(
    `Hello IT HUB,\n\nI would like to ask about on-site service options for PIN code ${pin || "my location"}.`,
  )}`;

  return (
    <div
      className={`rounded-lg border border-border bg-white ${compact ? "p-4" : "p-6"} ${className}`}
    >
      <p className={`flex items-center gap-2 font-semibold ${compact ? "text-sm" : "text-base"}`}>
        <ShieldCheck size={compact ? 16 : 18} className="text-primary" /> Check On-Site Service
        Eligibility
      </p>

      {pincode === undefined && (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              run(pin);
            }}
            className="mt-4 flex flex-wrap gap-2"
          >
            <input
              aria-label="PIN code"
              inputMode="numeric"
              maxLength={6}
              disabled={isChecking}
              placeholder="Enter 6-digit PIN code"
              value={pin}
              onChange={(event) => {
                const nextVal = event.target.value.replace(/\D/g, "").slice(0, 6);
                setPin(nextVal);
                if (result) setResult(null);
              }}
              className={`${fieldClass} max-w-56 disabled:opacity-60`}
            />
            <Button type="submit" variant="secondary" disabled={isChecking}>
              {isChecking ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Checking...
                </>
              ) : (
                <>
                  <MapPin size={15} /> Check eligibility
                </>
              )}
            </Button>
          </form>

          {!compact && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>Quick check:</span>
              {[
                { label: "Kothamangalam", pin: "686691" },
                { label: "M.A. College", pin: "686666" },
                { label: "Kottappady", pin: "686692" },
                { label: "Keerampara", pin: "686681" },
                { label: "Muvattupuzha", pin: "686661" },
              ].map((quick) => (
                <button
                  key={quick.pin}
                  type="button"
                  disabled={isChecking}
                  onClick={() => {
                    setPin(quick.pin);
                    run(quick.pin);
                  }}
                  className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
                >
                  {quick.label} ({quick.pin})
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {pincode !== undefined && !result && !isChecking && (
        <p className="mt-2 text-xs text-muted-foreground">
          Enter your delivery PIN code to check on-site service coverage.
        </p>
      )}

      {isChecking && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin text-primary" />
          <span>Verifying service coverage for PIN {pin}...</span>
        </div>
      )}

      {result?.status === "invalid" && (
        <p role="alert" className="mt-3 text-xs font-medium text-red-600">
          {result.message || "Please enter a valid 6-digit Indian PIN code."}
        </p>
      )}

      {result?.status === "eligible" && (
        <div className="mt-4 flex gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
          <div className="w-full">
            <p className="font-semibold text-emerald-800">✓ On-Site Service Available</p>
            <p className="mt-1 text-xs leading-5 text-emerald-900">
              Your location ({result.area || `PIN ${result.pincode}`}) is within our on-site service
              coverage area.
            </p>
            <p className="mt-1 text-xs font-medium text-emerald-900">
              Approximate service distance: {result.distanceKm} km (Coverage limit:{" "}
              {result.serviceRadiusKm} km from {result.location.name})
            </p>
            <p className="mt-2 text-[11px] leading-4 text-emerald-800/80">
              Estimated straight-line distance from the area postal centroid. Not an exact road
              distance.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link
                to={`/services/book?method=On-site%20service&pin=${encodeURIComponent(result.pincode)}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-800"
              >
                Request On-Site Service <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {result?.status === "ineligible" && (
        <div className="mt-4 flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm">
          <XCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold text-amber-900">On-Site Service Not Available</p>
            <p className="mt-1 text-xs leading-5 text-amber-900">
              Your location ({result.area || `PIN ${result.pincode}`}) is outside our current{" "}
              {result.serviceRadiusKm} km doorstep service coverage area.
            </p>
            <p className="mt-1 text-xs font-medium text-amber-900">
              Approximate distance: {result.distanceKm} km from {result.location.name}
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-900">
              You can still book our Store Walk-In service or Insured Courier Pickup across Kerala.
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-xs font-semibold">
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-primary"
              >
                <WhatsAppIcon size={13} /> WhatsApp IT HUB
              </a>
              <a href={`tel:${store.settings.phone}`} className="text-primary">
                Call {store.settings.phone}
              </a>
              <Link
                to="/services/book?method=Visit%20IT%20HUB"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Book Walk-In / Courier <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {result?.status === "unknown" && (
        <div className="mt-4 flex gap-3 rounded-md border border-blue-200 bg-blue-50/70 p-4 text-sm">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-blue-600" />
          <div>
            <p className="font-semibold text-blue-900">Unable to Verify Service Coverage</p>
            <p className="mt-1 text-xs leading-5 text-blue-900">
              {result.message ||
                `We could not determine geographical coordinates for PIN ${result.pincode} automatically. This does not mean your location is outside our coverage area.`}
            </p>
            <p className="mt-1 text-xs text-blue-800/80">
              Please double check the 6-digit PIN code, or contact our support desk to verify your
              exact address manually.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold">
              <button
                type="button"
                disabled={isChecking}
                onClick={() => run(pin, true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-2.5 py-1 text-blue-800 transition hover:bg-blue-50"
              >
                <RefreshCw size={12} className={isChecking ? "animate-spin" : ""} /> Retry check
              </button>
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-primary"
              >
                <WhatsAppIcon size={13} /> WhatsApp IT HUB
              </a>
              <a href={`tel:${store.settings.phone}`} className="text-primary">
                Call {store.settings.phone}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
