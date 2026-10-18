import { useEffect, useRef, useState } from "react"
import {
  CheckCircle2,
  MapPin,
  ShieldCheck,
  XCircle,
  HelpCircle,
} from "lucide-react"
import WhatsAppIcon from "./WhatsAppIcon"
import { useStore } from "../app/store"
import { checkWarranty, type WarrantyResult } from "../data/catalog"
import { Button, fieldClass } from "./ui"

type Props = {
  source: string
  /** When provided, the check runs automatically whenever this PIN becomes a valid 6-digit code. */
  pincode?: string
  compact?: boolean
  className?: string
}

export default function WarrantyCheck({
  source,
  pincode,
  compact,
  className = "",
}: Props) {
  const store = useStore()
  const [pin, setPin] = useState(pincode || "")
  const [result, setResult] = useState<WarrantyResult | null>(null)
  const lastChecked = useRef("")

  const run = (value: string) => {
    const next = checkWarranty(value, store.locations)
    setResult(next)
    if (next.status === "invalid") return
    lastChecked.current = next.pincode
    store.set((previous) => ({
      warrantyChecks: [
        {
          id: crypto.randomUUID(),
          pincode: next.pincode,
          area: next.status === "unknown" ? "" : next.area,
          result: next.status,
          distanceKm: next.status === "unknown" ? null : next.distanceKm,
          source,
          date: new Date().toISOString(),
        },
        ...previous.warrantyChecks,
      ],
    }))
  }

  useEffect(() => {
    if (pincode === undefined) return
    setPin(pincode)
    if (/^\d{6}$/.test(pincode.trim())) {
      if (pincode.trim() !== lastChecked.current) run(pincode)
    } else {
      setResult(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pincode])

  const whatsapp = `https://wa.me/${store.settings.whatsapp}?text=${encodeURIComponent(
    "Hello IT HUB,\n\nI would like to ask about service options for my location.",
  )}`

  return (
    <div
      className={`rounded-lg border border-border bg-white ${
        compact ? "p-4" : "p-6"
      } ${className}`}
    >
      <p
        className={`flex items-center gap-2 font-semibold ${
          compact ? "text-sm" : "text-base"
        }`}
      >
        <ShieldCheck size={compact ? 16 : 18} className="text-primary" /> Check
        On-Site Service Eligibility
      </p>
      {pincode === undefined && (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              run(pin)
            }}
            className="mt-4 flex flex-wrap gap-2"
          >
            <input
              aria-label="PIN code"
              inputMode="numeric"
              maxLength={6}
              placeholder="Enter 6-digit PIN code"
              value={pin}
              onChange={(event) => {
                setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
                setResult(null)
              }}
              className={`${fieldClass} max-w-56`}
            />
            <Button type="submit" variant="secondary">
              <MapPin size={15} /> Check eligibility
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
                  onClick={() => {
                    setPin(quick.pin)
                    run(quick.pin)
                  }}
                  className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                >
                  {quick.label} ({quick.pin})
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {pincode !== undefined && !result && (
        <p className="mt-2 text-xs text-muted-foreground">
          Enter your delivery PIN code to check on-site service coverage.
        </p>
      )}
      {result?.status === "invalid" && (
        <p role="alert" className="mt-3 text-xs text-red-600">
          Please enter a valid 6-digit PIN code.
        </p>
      )}
      {result?.status === "unknown" && (
        <div className="mt-4 flex gap-3 rounded-md bg-muted p-4 text-sm">
          <HelpCircle
            size={18}
            className="mt-0.5 shrink-0 text-muted-foreground"
          />
          <div>
            <p className="font-semibold">
              We couldn’t map PIN code {result.pincode} yet
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Please contact IT HUB to confirm on-site service availability for
              your area.
            </p>
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary"
            >
              <WhatsAppIcon size={13} /> Contact IT HUB
            </a>
          </div>
        </div>
      )}
      {result?.status === "eligible" && (
        <div className="mt-4 flex gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <CheckCircle2
            size={18}
            className="mt-0.5 shrink-0 text-emerald-600"
          />
          <div>
            <p className="font-semibold text-emerald-800">
              ✓ On-Site Service Available
            </p>
            <p className="mt-1 text-xs leading-5 text-emerald-900">
              Your location is within our on-site service coverage area.
            </p>
            <p className="mt-1 text-xs font-medium text-emerald-900">
              Approximate service distance: {result.distanceKm} km
            </p>
            <p className="mt-2 text-[11px] leading-4 text-emerald-800/80">
              Estimated from the PIN code area to {result.location.name}. Not an
              exact road distance.
            </p>
          </div>
        </div>
      )}
      {result?.status === "ineligible" && (
        <div className="mt-4 flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm">
          <XCircle size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold text-amber-900">
              On-Site Service Not Available
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-900">
              Your location is outside our current on-site service coverage
              area.
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-900">
              You can still contact IT HUB for alternative service options.
            </p>
            <div className="mt-2 flex flex-wrap gap-4 text-xs font-semibold">
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
  )
}
