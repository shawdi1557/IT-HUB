import { useEffect, useState } from "react"
import { LoginGate } from "../components/AuthModal"
import { Link, useNavigate, useParams, useSearchParams } from "react-router"
import {
  Laptop,
  Smartphone,
  Monitor,
  Wrench,
  ArrowUpRight,
  ArrowRight,
  Truck,
  CheckCircle2,
  MapPin,
  Search,
  ShieldCheck,
  CalendarCheck,
  ClipboardCheck,
  PackageCheck,
  Printer,
  AppWindow,
  Code2,
  AlertCircle,
  Info,
} from "lucide-react"
import OurServices from "../components/OurServices"
import WarrantyCheck from "../components/WarrantyCheck"
import { useStore } from "../app/store"
import { track } from "../lib/analytics"
import { serviceTypes, problemsFor, serviceStatuses, money } from "../data/catalog"
import {
  ActionLink,
  Badge,
  Button,
  Empty,
  Field,
  Logo,
  Page,
  PageHeading,
  Timeline,
  fieldClass,
} from "../components/ui"

const serviceCategories = [
  {
    name: "Laptop Services",
    Icon: Laptop,
    text: "Repair, upgrades, software support and diagnostics.",
    items: ["Laptop Repair", "Laptop Cleaning", "SSD Upgrade", "RAM Upgrade"],
    service: "Laptop Repair",
    device: "Laptop",
  },
  {
    name: "Mobile Services",
    Icon: Smartphone,
    text: "Device diagnostics, repair and technical assistance.",
    items: ["Mobile Repair", "Hardware Diagnostics", "Data Recovery"],
    service: "Mobile Repair",
    device: "Mobile",
  },
  {
    name: "Computer / PC Services",
    Icon: Monitor,
    text: "Repair, upgrades, maintenance and custom PC builds.",
    items: ["PC Repair", "PC Upgrade", "PC Maintenance", "PC Builder"],
    service: "PC Repair",
    device: "Desktop",
  },
  {
    name: "Printer Services",
    Icon: Printer,
    text: "Installation, maintenance and troubleshooting.",
    items: ["Printer Service", "Driver Setup", "Network Printing"],
    service: "Printer Service",
    device: "Printer",
  },
  {
    name: "Software Services",
    Icon: AppWindow,
    text: "OS installation, software setup and virus removal.",
    items: ["Windows Installation", "Software Installation", "Virus Removal"],
    service: "Software Installation",
  },
  {
    name: "Web & Software Development",
    Icon: Code2,
    text: "Websites, web applications and custom software for your business.",
    items: ["Website Development", "Web Applications", "Custom Software"],
    service: "Website Development",
  },
]
const pcServiceLink = (item: string) =>
  item === "PC Builder"
    ? "/pc-builder"
    : `/services/book?service=${encodeURIComponent(
        item === "PC Upgrade" ? "Hardware Upgrade" : item === "PC Maintenance" ? "PC Troubleshooting" : item,
      )}`

export function Services() {
  return (
    <Page>
      <OurServices bleedTop />
      <section id="on-site" className="mt-14 grid gap-8 overflow-hidden rounded-[2rem] border border-primary/20 bg-secondary/50 p-7 md:grid-cols-[1fr_1.1fr] md:p-10">
        <div>
          <p className="text-[10px] font-semibold tracking-[.17em] text-primary">ON-SITE SERVICE</p>
          <h2 className="mt-3 text-2xl font-bold tracking-[-.02em] md:text-3xl">
            IT Support at Your Location
          </h2>
          <p className="mt-3 max-w-md text-sm leading-7 text-muted-foreground">
            Professional technical assistance without needing to bring your
            device to the store. Available within about 15 km of an IT HUB
            location — check your PIN code to confirm.
          </p>
          <ol className="mt-6 grid gap-2 text-xs sm:grid-cols-2">
            {["Request Service", "Enter PIN", "Check availability", "Schedule / contact IT HUB"].map((step, index) => (
              <li key={step} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <ActionLink to="/services/book?method=On-site%20service" className="mt-6">
            Request On-Site Service <ArrowRight size={15} />
          </ActionLink>
        </div>
        <WarrantyCheck source="Services on-site" />
      </section>
      <section className="mt-14 overflow-hidden rounded-[2rem] border border-border bg-card">
        <div className="flex flex-col gap-4 border-b border-border bg-secondary/60 px-7 py-8 md:flex-row md:items-end md:justify-between md:px-10">
          <div>
            <p className="text-[10px] font-semibold tracking-[.17em] text-primary">
              HOW SERVICE WORKS
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-[-.02em] md:text-3xl">
              Simple from start to finish.
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">
            Seven clear steps, with updates at every stage. Nothing is repaired
            without your approval.
          </p>
        </div>
        <ol className="grid gap-x-4 gap-y-8 px-7 py-10 sm:grid-cols-2 md:px-10 lg:grid-cols-7">
          {[
            [CalendarCheck, "Book", "Choose your service and a convenient slot."],
            [Truck, "Pickup / drop-off", "Visit the store or schedule a courier."],
            [Search, "Diagnosis", "Our technicians find the root cause."],
            [ClipboardCheck, "Approval", "You approve the quote before any work."],
            [Wrench, "Repair", "Fixed with genuine, quality parts."],
            [ShieldCheck, "Quality check", "Tested thoroughly before handover."],
            [PackageCheck, "Return", "Collect it or get it delivered back."],
          ].map(([Icon, step, text], index, all) => {
            const StepIcon = Icon as typeof Wrench
            return (
              <li key={step as string} className="relative flex gap-4 lg:block">
                {index < all.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute left-6 top-14 h-[calc(100%-1.5rem)] w-px bg-gradient-to-b from-primary/40 to-transparent sm:hidden lg:left-14 lg:top-6 lg:block lg:h-px lg:w-[calc(100%-2.5rem)] lg:bg-gradient-to-r"
                  />
                )}
                <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-[0_10px_24px_-10px_rgba(26,79,214,.8)]">
                  <StepIcon size={20} />
                </span>
                <div className="lg:mt-5">
                  <p className="text-[11px] font-bold tracking-wider text-primary">
                    STEP {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="mt-1 text-sm font-semibold">{step as string}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                    {text as string}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
        <p className="flex items-center gap-2 border-t border-border px-7 py-5 text-xs text-muted-foreground md:px-10">
          <Truck size={15} className="shrink-0 text-primary" /> Send your device
          to IT HUB through courier and receive it back after service. Courier
          availability is simulated.
        </p>
      </section>
      <section id="warranty-check" className="mt-10 flex flex-col gap-4 rounded-2xl border border-border bg-card p-7 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold">Need Warranty Help?</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Find official warranty and customer-care information for laptops,
            mobiles and printers — or contact IT HUB for assistance.
          </p>
        </div>
        <ActionLink to="/support?view=warranty">
          Help & Support <ArrowRight size={15} />
        </ActionLink>
      </section>
    </Page>
  )
}
export function ServiceBooking() {
  /** Fixed courier charge per leg (pickup → IT HUB, IT HUB → customer). */
  const COURIER_CHARGE_PER_LEG = 150
  const store = useStore()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const chosen = params.get("service") || "Laptop Repair"
  const presetDevice = params.get("device")
  const [step, setStep] = useState(0)
  useEffect(() => track("Service Booking Started", { service: chosen }), [])
  const [busy, setBusy] = useState(false)
  const [details, setDetails] = useState({
    device: presetDevice || (chosen.includes("Mobile")
      ? "Mobile"
      : chosen.includes("PC")
        ? "Desktop"
        : chosen.includes("Printer")
          ? "Printer"
          : "Laptop"),
    model: "",
    problem: chosen.includes("Recovery")
      ? "Data recovery"
      : presetDevice === "Printer" || chosen.includes("Printer")
        ? "Not printing"
        : "Overheating",
    notes: "",
    method: params.get("method")?.includes("On-site")
      ? "On-site service"
      : "Visit IT HUB",
    name: store.profile.name,
    email: store.profile.email,
    address: store.profile.address,
    date: "",
    time: "10:00 – 12:00 (demo)",
  })
  const update = (key: string, value: string) =>
    setDetails({ ...details, [key]: value })
  const steps = [
    "Device",
    "Problem",
    "Service method",
    "Your details",
    "Date & time",
    "Confirm",
  ]
  const next = async () => {
    if (step < 5) {
      setStep(step + 1)
      return
    }
    setBusy(true)
    await new Promise((resolve) => setTimeout(resolve, 650))
    const id = `SRV-${crypto.randomUUID().slice(0, 7).toUpperCase()}`
    const isCourier = details.method === "Courier to IT HUB"
    const request = {
      ...details,
      id,
      status: 0,
      quote: details.problem === "Screen issue" ? 9500 : 1500,
      quoteState: "pending" as const,
      technician: "Unassigned",
      ...(isCourier && {
        courierCharge: {
          // Customer ships to IT HUB at their own cost — no inbound charge from IT HUB.
          // IT HUB charges only for the return delivery (after repair OR after rejection).
          returnDelivery: COURIER_CHARGE_PER_LEG,
        },
      }),
    }
    track("Service Request Created", { request: id, device: details.device, problem: details.problem })
    store.set((previous) => ({
      requests: [request, ...previous.requests],
      notifications: [
        `Service request ${id} created`,
        ...previous.notifications,
      ],
    }))
    store.log(`Service request ${id} submitted`)
    store.notify("Service request submitted")
    navigate(`/service-success/${id}`)
  }
  if (!store.loggedIn)
    return (
      <Page>
        <LoginGate title="Login to book a service" text="Sign in with your mobile number to book a repair, schedule a pickup and track your service request." />
      </Page>
    )
  return (
    <Page>
      <PageHeading
        title="Let’s get your device back on track."
        description={`Book ${chosen.toLowerCase()}. Tell us what’s wrong — we’ll take it from there.`}
      />
      <div className="mb-9 flex gap-3 overflow-x-auto pb-2">
        {steps.map((label, index) => (
          <button
            key={label}
            disabled={index > step}
            onClick={() => setStep(index)}
            className={`flex shrink-0 items-center gap-2 text-xs ${
              index === step
                ? "font-bold text-primary"
                : "text-muted-foreground"
            }`}
          >
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full ${
                index <= step ? "bg-primary text-white" : "bg-muted"
              }`}
            >
              {index < step ? "✓" : index + 1}
            </span>
            {label}
            {index < 5 && <span className="ml-2 text-border">—</span>}
          </button>
        ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <form
          className="rounded-lg border border-border p-6 md:p-8"
          onSubmit={(event) => {
            event.preventDefault()
            void next()
          }}
        >
          <h2 className="mb-6 text-xl font-bold">
            {
              [
                "What needs our attention?",
                "Tell us what’s happening.",
                "How would you like to reach us?",
                "Your contact & address details",
                "Choose a preferred appointment.",
                "Review your service request.",
              ][step]
            }
          </h2>
          {step === 0 && (
            <>
              <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {["Laptop", "Desktop", "Mobile", "Printer", "Other"].map(
                  (device) => (
                    <button
                      type="button"
                      key={device}
                      onClick={() =>
                        setDetails((current) => ({
                          ...current,
                          device,
                          problem: problemsFor(device).includes(current.problem) ? current.problem : problemsFor(device)[0],
                        }))
                      }
                      className={`rounded-md border p-5 text-center text-sm ${
                        details.device === device
                          ? "border-primary bg-secondary text-primary"
                          : "border-border"
                      }`}
                    >
                      {device === "Mobile" ? (
                        <Smartphone className="mx-auto mb-3" />
                      ) : device === "Laptop" ? (
                        <Laptop className="mx-auto mb-3" />
                      ) : device === "Printer" ? (
                        <Printer className="mx-auto mb-3" />
                      ) : (
                        <Monitor className="mx-auto mb-3" />
                      )}
                      {device}
                    </button>
                  ),
                )}
              </div>
              <Field label="Device brand & model">
                <input
                  required
                  minLength={2}
                  placeholder={details.device === "Printer" ? "e.g. HP DeskJet 2331, Canon PIXMA G3010, Epson L3250" : details.device === "Mobile" ? "e.g. Samsung Galaxy A54" : "e.g. Dell Inspiron 15"}
                  value={details.model}
                  onChange={(event) => update("model", event.target.value)}
                  className={fieldClass}
                />
              </Field>
            </>
          )}
          {step === 1 && (
            <>
              <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {problemsFor(details.device).map((problem) => (
                  <button
                    type="button"
                    key={problem}
                    onClick={() => update("problem", problem)}
                    className={`rounded-md border p-4 text-left text-xs ${
                      details.problem === problem
                        ? "border-primary bg-secondary text-primary"
                        : "border-border"
                    }`}
                  >
                    {problem}
                  </button>
                ))}
              </div>
              <Field label="Anything else we should know?">
                <textarea
                  required={details.problem === "Other"}
                  value={details.notes}
                  onChange={(event) => update("notes", event.target.value)}
                  className={fieldClass}
                  rows={3}
                  placeholder="Describe symptoms, when they started, or any important details."
                />
              </Field>
            </>
          )}
          {step === 2 && (
            <div className="space-y-4">
              {[
                {
                  name: "Visit IT HUB",
                  Icon: MapPin,
                  text: "Bring your device to our Kothamangalam store.",
                },
                {
                  name: "Courier to IT HUB",
                  Icon: Truck,
                  text: "Ship your device to IT HUB's address. We'll diagnose, repair, and courier it back.",
                },
                {
                  name: "On-site service",
                  Icon: Wrench,
                  text: "Request assistance at your location.",
                },
              ].map(({ name, Icon, text }) => (
                <button
                  type="button"
                  key={name}
                  onClick={() => update("method", name)}
                  className={`flex w-full items-center gap-4 rounded-lg border p-5 text-left ${
                    details.method === name
                      ? "border-primary bg-secondary/50"
                      : "border-border"
                  }`}
                >
                  <Icon size={25} className="text-primary" />
                  <span className="flex-1">
                    <strong className="text-sm">{name}</strong>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {text}
                    </span>
                  </span>
                  {details.method === name && (
                    <CheckCircle2 size={19} className="text-primary" />
                  )}
                </button>
              ))}
              {/* Courier info — shown only when Courier to IT HUB is selected */}
              {details.method === "Courier to IT HUB" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                  <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-amber-800">
                    <Truck size={14} className="shrink-0" />
                    How courier service works
                  </p>
                  <ol className="space-y-2 text-xs leading-6 text-amber-700">
                    <li className="flex gap-2"><span className="font-bold text-amber-900">1.</span> You ship the device to IT HUB's address at your own courier cost.</li>
                    <li className="flex gap-2"><span className="font-bold text-amber-900">2.</span> IT HUB diagnoses and sends you a repair quotation for approval.</li>
                    <li className="flex gap-2"><span className="font-bold text-amber-900">3.</span> IT HUB couriers the device back to you after repair — or after rejection.</li>
                  </ol>
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-white px-4 py-2.5 text-xs font-medium">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <ShieldCheck size={13} className="text-primary" />
                      Diagnosis Charge (includes inspection & return logistics)
                    </span>
                    <strong className="text-foreground">₹{COURIER_CHARGE_PER_LEG}</strong>
                  </div>
                  <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-100 px-3 py-2.5 text-xs leading-5 text-amber-800">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    <span>
                      If you approve the repair quotation, diagnosis is adjusted against your repair total. If you <strong>decline the quotation</strong>, only the <strong>Diagnosis Charge (₹{COURIER_CHARGE_PER_LEG})</strong> is payable.
                    </span>
                  </p>
                </div>
              )}
              {/* On-site 15 km info */}
              {details.method === "On-site service" && (
                <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-700">
                  <Info size={14} className="mt-0.5 shrink-0" />
                  <span>On-site service is available within approximately <strong>15 km</strong> of IT HUB Kothamangalam. Your PIN code will be checked in the next step.</span>
                </div>
              )}
            </div>
          )}
          {step === 3 && (
            <div className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Full name">
                  <input
                    required
                    minLength={2}
                    value={details.name}
                    onChange={(event) => update("name", event.target.value)}
                    className={fieldClass}
                  />
                </Field>
                <Field label="Email address">
                  <input
                    required
                    type="email"
                    value={details.email}
                    onChange={(event) => update("email", event.target.value)}
                    className={fieldClass}
                  />
                </Field>
              </div>
              <Field
                label={
                  details.method === "Visit IT HUB"
                    ? "Address (optional for store visit)"
                    : details.method === "Courier to IT HUB"
                      ? "Your return address (where to ship the device back)"
                      : "Service address in Kerala"
                }
              >
                <textarea
                  required={details.method !== "Visit IT HUB"}
                  value={details.address}
                  onChange={(event) => update("address", event.target.value)}
                  rows={3}
                  placeholder="Street, city and PIN code"
                  className={fieldClass}
                />
              </Field>
              {details.method === "Visit IT HUB" && (
                <p className="rounded-lg bg-muted p-4 text-xs text-muted-foreground">
                  Visit IT HUB in Kothamangalam, Kerala. Contact the store to
                  confirm its exact location and availability.
                </p>
              )}
              {details.method === "On-site service" && (
                <WarrantyCheck
                  compact
                  source="Service booking"
                  pincode={details.address.match(/\b\d{6}\b/)?.[0] || ""}
                />
              )}
            </div>
          )}
          {step === 4 && (
            <div className="space-y-5">
              <Field label="Preferred date">
                <input
                  required
                  type="date"
                  min={new Date().toLocaleDateString("en-CA")}
                  value={details.date}
                  onChange={(event) => update("date", event.target.value)}
                  className={fieldClass}
                />
              </Field>
              <Field label="Preferred time (illustrative, not store hours)">
                <select
                  value={details.time}
                  onChange={(event) => update("time", event.target.value)}
                  className={fieldClass}
                >
                  {[
                    "10:00 – 12:00 (demo)",
                    "12:00 – 14:00 (demo)",
                    "14:00 – 16:00 (demo)",
                  ].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </Field>
              <p className="text-xs leading-6 text-muted-foreground">
                These are prototype scheduling options, not confirmed opening
                hours. IT HUB would confirm the appointment before service.
              </p>
            </div>
          )}
          {step === 5 && (
            <>
              <dl className="space-y-4">
                {[
                  ["Device", `${details.device} · ${details.model}`],
                  ["Issue", details.problem],
                  ["Method", details.method],
                  ["Customer", `${details.name} · ${details.email}`],
                  ["Address", details.address || "Store visit · Kothamangalam"],
                  ["Appointment", `${details.date} · ${details.time}`],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="grid grid-cols-[90px_1fr] gap-5 border-b border-border pb-3 text-sm"
                  >
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="break-words font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              {/* Diagnosis charge notice — shown only for Courier to IT HUB */}
              {details.method === "Courier to IT HUB" && (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-amber-800">
                    <ShieldCheck size={14} className="shrink-0 text-amber-800" />
                    Service & Diagnosis Charge Policy
                  </p>
                  <ul className="space-y-1.5 text-xs text-amber-700">
                    <li className="flex items-center justify-between">
                      <span>Inbound shipping to IT HUB</span>
                      <span className="font-medium text-muted-foreground">Self-arranged</span>
                    </li>
                    <li className="flex items-center justify-between border-t border-amber-200 pt-2 font-semibold">
                      <span>Diagnosis Charge</span>
                      <strong className="text-foreground">₹{COURIER_CHARGE_PER_LEG}</strong>
                    </li>
                  </ul>
                  <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-100 px-3 py-2.5 text-xs leading-5 text-amber-800">
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    <span>
                      The <strong>Diagnosis Charge (₹{COURIER_CHARGE_PER_LEG})</strong> is only payable if you choose to reject the final repair quotation. If repair is approved, diagnosis is adjusted into the repair invoice.
                    </span>
                  </p>
                </div>
              )}
              <label className="mt-6 flex items-start gap-2 text-xs leading-6">
                <input
                  required
                  type="checkbox"
                  className="mt-1 accent-primary"
                />{" "}
                {details.method === "Courier to IT HUB"
                  ? "I understand this is a demo service request. I acknowledge that the diagnosis charge (₹150) applies only if I decline the repair quotation."
                  : "I understand this is a demo service request. No actual appointment or pickup is created."}
              </label>
            </>
          )}
          <div className="mt-9 flex justify-between gap-3">
            <Button
              variant="secondary"
              type="button"
              onClick={() =>
                step > 0 ? setStep(step - 1) : navigate("/services")
              }
            >
              Back
            </Button>
            <Button type="submit" disabled={busy}>
              {busy
                ? "Submitting…"
                : step === 5
                  ? "Confirm service request"
                  : "Continue"}
              <ArrowRight size={16} />
            </Button>
          </div>
        </form>
        <aside className="self-start rounded-lg bg-muted p-6">
          <Logo />
          <h3 className="mt-5 text-lg font-bold">
            Expert care. Clear communication.
          </h3>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            Your device is diagnosed first. A quotation is provided for your
            approval before the repair proceeds.
          </p>
          <div className="mt-6 space-y-4 text-xs">
            {[
              "No repair without your approval",
              "Track every step of the process",
              "Local product & service support",
            ].map((value) => (
              <p key={value} className="flex gap-2">
                <ShieldCheck size={15} className="shrink-0 text-primary" />
                {value}
              </p>
            ))}
          </div>
        </aside>
      </div>
    </Page>
  )
}
export function ServiceSuccess() {
  const { id } = useParams()
  const store = useStore()
  const request = store.requests.find((item) => item.id === id)
  if (!request)
    return (
      <Page>
        <Empty
          title="Request not found"
          description="Start a service booking to create a demo request."
          to="/services/book"
          label="Book a service"
        />
      </Page>
    )
  return (
    <Page>
      <div className="mx-auto max-w-2xl rounded-xl border border-border p-8 text-center md:p-12">
        <CheckCircle2 size={48} className="mx-auto mb-5 text-emerald-600" />
        <Badge tone="green">SERVICE REQUEST CREATED</Badge>
        <h1 className="mt-5 text-3xl font-bold">You’re in good hands.</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Your demo request has been submitted to IT HUB.
        </p>
        <div className="my-7 rounded-lg bg-muted p-6 text-left">
          {[
            ["Request ID", request.id],
            ["Device", request.model],
            ["Issue", request.problem],
            ["Service", request.method],
            ["Status", "Requested"],
          ].map(([label, value]) => (
            <p key={label} className="mb-3 flex justify-between gap-4 text-sm">
              <span className="text-muted-foreground">{label}</span>
              <strong>{value}</strong>
            </p>
          ))}
        </div>
        <ActionLink to={`/track-service/${request.id}`}>
          Track service <ArrowRight size={16} />
        </ActionLink>
        <p className="mt-5 text-xs text-muted-foreground">
          Prototype only. No actual service appointment was created.
        </p>
      </div>
    </Page>
  )
}
export function ServiceTracking() {
  const { id } = useParams()
  const navigate = useNavigate()
  const store = useStore()
  const [query, setQuery] = useState(id || "")
  const request = store.requests.find((item) => item.id === id)
  const update = (changes: Partial<NonNullable<typeof request>>) => {
    store.set((previous) => ({
      requests: previous.requests.map((item) =>
        item.id === id ? { ...item, ...changes } : item,
      ),
    }))
  }
  return (
    <Page>
      <PageHeading
        title="Your device. Every detail."
        description="Stay in the loop from diagnosis to delivery."
      />
      <form
        onSubmit={(event) => {
          event.preventDefault()
          navigate(`/track-service/${encodeURIComponent(query.trim())}`)
        }}
        className="mb-8 flex max-w-xl gap-3"
      >
        <input
          required
          aria-label="Service request ID"
          placeholder="Enter your service request ID"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={fieldClass}
        />
        <Button type="submit">
          Track <Search size={16} />
        </Button>
      </form>
      {request ? (
        <div className="grid gap-8 lg:grid-cols-[.9fr_1.1fr]">
          <div className="rounded-lg border border-border p-7">
            <div className="mb-7 flex flex-wrap justify-between gap-3">
              <h2 className="text-lg font-bold">{request.id}</h2>
              <Badge>{serviceStatuses[request.status]}</Badge>
            </div>
            <Timeline steps={serviceStatuses} current={request.status} />
          </div>
          <div className="space-y-6">
            <div className="rounded-lg bg-muted p-7">
              <h2 className="mb-5 text-lg font-bold">Service details</h2>
              <dl className="grid grid-cols-2 gap-5 text-sm">
                {[
                  ["Device", request.model],
                  ["Issue", request.problem],
                  ["Service method", request.method],
                  [
                    "Preferred appointment",
                    `${request.date} · ${request.time}`,
                  ],
                  ["Technician", request.technician],
                  ["Address", request.address || "IT HUB, Kothamangalam"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {request.status < 4 ? (
              <div className="rounded-lg border border-primary/20 p-7">
                <Badge>PROTOTYPE WALKTHROUGH</Badge>
                <h3 className="mt-4 text-lg font-bold">
                  Explore the diagnosis & quotation.
                </h3>
                <p className="my-4 text-xs leading-6 text-muted-foreground">
                  Simulate the next stage to review a sample quotation. In the
                  real service, the IT HUB team would diagnose your device
                  first.
                </p>
                <Button
                  onClick={() => {
                    update({ status: 4 })
                    store.notify("Demo diagnosis complete. Quotation ready.")
                  }}
                >
                  Preview diagnosis & quote <ArrowRight size={16} />
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-border p-7">
                <Badge
                  tone={
                    request.quoteState === "approved"
                      ? "green"
                      : request.quoteState === "rejected"
                        ? "red"
                        : "amber"
                  }
                >
                  {request.quoteState === "approved"
                    ? "REPAIR APPROVED"
                    : request.quoteState === "rejected"
                      ? "QUOTATION DECLINED"
                      : "DIAGNOSIS COMPLETE · SAMPLE QUOTATION"}
                </Badge>
                <h2 className="mt-5 text-xl font-bold">
                  {request.problem === "Screen issue"
                    ? "Display replacement recommended."
                    : "Device servicing recommended."}
                </h2>
                <p className="mt-3 text-xs leading-6 text-muted-foreground">
                  {request.problem === "Screen issue"
                    ? "Demo diagnosis: laptop display panel replacement is required."
                    : `Demo diagnosis for ${request.problem.toLowerCase()}: inspection, servicing and testing.`}
                </p>
                <div className="my-6 space-y-3 text-sm">
                  <p className="flex justify-between">
                    <span>
                      {request.problem === "Screen issue"
                        ? "Display panel"
                        : "Parts / servicing"}
                    </span>
                    {money(Math.max(0, request.quote - 1000))}
                  </p>
                  <p className="flex justify-between">
                    <span>Labour</span>
                    {money(Math.min(1000, request.quote))}
                  </p>
                  {/* Diagnosis charge — only for Courier to IT HUB requests */}
                  {request.courierCharge && (
                    <p className={`flex justify-between ${request.quoteState === "rejected" ? "font-medium text-red-600" : "text-muted-foreground"}`}>
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck size={13} className="text-primary" />
                        Diagnosis Charge
                        {request.quoteState === "rejected" && (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">PAYABLE</span>
                        )}
                      </span>
                      {money(request.courierCharge.returnDelivery)}
                    </p>
                  )}
                  <p className="flex justify-between border-t border-border pt-4 text-lg font-bold">
                    <span>
                      {request.courierCharge && request.quoteState === "approved"
                        ? "Total"
                        : request.courierCharge && request.quoteState === "rejected"
                          ? "Amount due (Diagnosis Charge)"
                          : "Total"}
                    </span>
                    {request.courierCharge && request.quoteState !== "pending"
                      ? money(request.quote + request.courierCharge.returnDelivery)
                      : money(request.quote)}
                  </p>
                </div>
                {request.quoteState === "pending" ? (
                  <>
                    {/* Rejection warning — shown before the customer clicks Reject */}
                    {request.courierCharge && (
                      <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
                        <AlertCircle size={13} className="mt-0.5 shrink-0" />
                        <span>
                          If you <strong>reject</strong> this quote, the <strong>Diagnosis Charge (₹{request.courierCharge.returnDelivery})</strong> covers bench inspection, testing, and return logistics.
                        </span>
                      </p>
                    )}
                    <div className="flex gap-3">
                      <Button
                        onClick={() => {
                          update({ quoteState: "approved", status: 5 })
                          store.log(`Repair ${request.id} approved`)
                          store.notify(
                            "Repair approved. IT HUB will proceed with the repair (demo).",
                          )
                        }}
                      >
                        Approve repair
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          update({ quoteState: "rejected" })
                          store.log(`Repair ${request.id} declined`)
                          store.notify(
                            request.courierCharge
                              ? `Quotation declined. Diagnosis Charge of ₹${request.courierCharge.returnDelivery} applies.`
                              : "Quotation declined. No repair will proceed.",
                          )
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  </>
                ) : (
                  <p
                    className={`rounded-md p-4 text-xs leading-6 ${
                      request.quoteState === "approved"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {request.quoteState === "approved"
                      ? "Repair approved. IT HUB will proceed with the repair. Follow its progress in the timeline."
                      : request.courierCharge
                        ? `You declined this quotation. The Diagnosis Charge of ₹${request.courierCharge.returnDelivery} is payable — IT HUB will safely dispatch your device. Contact IT HUB to arrange payment.`
                        : "You declined this quotation. No repair will proceed. Contact IT HUB for next steps."}
                  </p>
                )}
                <p className="mt-4 text-[10px] text-muted-foreground">
                  Illustrative diagnosis and pricing. No actual repair is
                  authorised.
                </p>
              </div>
            )}
            <ActionLink secondary to="/account/support">
              Contact support
            </ActionLink>
          </div>
        </div>
      ) : (
        <Empty
          title={id ? "Service request not found" : "No device left behind."}
          description={
            id
              ? "Check your request ID or find it in your account."
              : "Book a demo service to track its progress here."
          }
          to={store.requests.length ? "/account/services" : "/services/book"}
          label={store.requests.length ? "View my requests" : "Book a service"}
        />
      )}
    </Page>
  )
}
