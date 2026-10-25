import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AppWindow,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  Check,
  Code2,
  GraduationCap,
  LayoutDashboard,
  Mail,
  Phone,
  ShoppingCart,
  Sparkles,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import WhatsAppIcon from "../components/WhatsAppIcon";
import { useStore } from "../app/store";
import { Button, Field, Page, PageHeading, fieldClass, secondaryClass } from "../components/ui";

const projectTypes = [
  {
    id: "Website",
    Icon: Code2,
    text: "A site customers visit in the browser — informational, booking or online store.",
  },
  {
    id: "Software",
    Icon: AppWindow,
    text: "Custom software, web apps, billing, inventory or internal tools.",
  },
];

interface PurposeItem {
  label: string;
  Icon: typeof Code2;
}

const purposes: Record<string, PurposeItem[]> = {
  Website: [
    { label: "E-commerce / Online Store", Icon: ShoppingCart },
    { label: "Business / Company Website", Icon: Building2 },
    { label: "Portfolio / Personal", Icon: Briefcase },
    { label: "Restaurant / Booking", Icon: UtensilsCrossed },
    { label: "School / Institution", Icon: GraduationCap },
    { label: "Something else", Icon: Sparkles },
  ],
  Software: [
    { label: "Billing / POS", Icon: Store },
    { label: "Inventory / Stock Management", Icon: LayoutDashboard },
    { label: "Custom Web Application", Icon: AppWindow },
    { label: "CRM / Customer Management", Icon: Briefcase },
    { label: "School / Institution System", Icon: GraduationCap },
    { label: "Something else", Icon: Sparkles },
  ],
};

const budgetTiers = [
  {
    range: "₹25,000 – ₹75,000",
    name: "Essential",
    level: 1,
    points: ["Clean, responsive design", "Core features & pages", "SSL & standard security"],
  },
  {
    range: "₹75,000 – ₹2,00,000",
    name: "Professional",
    level: 2,
    points: [
      "Custom premium design",
      "Admin panel, payments & integrations",
      "Advanced security & backups",
    ],
  },
  {
    range: "Above ₹2,00,000",
    name: "Enterprise",
    level: 3,
    points: [
      "Top-tier quality & performance",
      "Fully custom features, scalable",
      "Enterprise-grade security & support",
    ],
  },
];
const budgets = [...budgetTiers.map((t) => t.range), "Not sure yet (from ₹25,000)"];
const timelines = ["Flexible", "Within 2 weeks", "Within 1 month", "1–3 months"];
const steps = ["Purpose", "Requirements", "Contact IT HUB"];

export default function DevRequest() {
  const store = useStore();
  const settings = store.settings;
  const [step, setStep] = useState(0);
  const [type, setType] = useState("Website");
  const [purpose, setPurpose] = useState("");
  const [details, setDetails] = useState({
    requirements: "",
    features: "",
    budget: budgets[0],
    timeline: timelines[0],
  });

  const summary = [
    "Hello IT HUB, I'd like to discuss a development project.",
    `Type: ${type}`,
    `Purpose: ${purpose}`,
    `Requirements: ${details.requirements}`,
    details.features && `Key features: ${details.features}`,
    `Budget: ${details.budget}`,
    `Timeline: ${details.timeline}`,
  ]
    .filter(Boolean)
    .join("\n");
  const whatsapp = `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(summary)}`;
  const canNext = step === 0 ? !!purpose : details.requirements.trim().length >= 10;

  return (
    <Page>
      <PageHeading
        eyebrow="WEB & SOFTWARE DEVELOPMENT"
        title="Let's build your project."
        description="Tell us what you need in three quick steps. The IT HUB development team will review it and get back to you with a plan and quotation."
      />

      <ol className="mb-8 flex flex-wrap gap-2">
        {steps.map((label, index) => (
          <li
            key={label}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${
              index === step
                ? "border-primary bg-primary text-white"
                : index < step
                  ? "border-primary/30 bg-secondary text-primary"
                  : "border-border text-muted-foreground"
            }`}
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px]">
              {index < step ? <Check size={12} /> : index + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>

      <div className="rounded-[2rem] border border-border bg-card p-6 md:p-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
          >
            {step === 0 && (
              <div>
                <h2 className="text-2xl font-bold tracking-[-.02em]">What are you looking for?</h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {projectTypes.map(({ id, Icon, text }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setType(id);
                        setPurpose("");
                      }}
                      className={`flex items-start gap-4 rounded-2xl border p-5 text-left transition ${
                        type === id
                          ? "border-primary bg-secondary/70"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                          type === id ? "bg-primary text-white" : "bg-secondary text-primary"
                        }`}
                      >
                        <Icon size={22} strokeWidth={1.6} />
                      </span>
                      <span>
                        <span className="block font-bold">{id}</span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          {text}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                <h3 className="mt-9 text-lg font-bold">
                  What is the purpose of the {type.toLowerCase()}?
                </h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {purposes[type].map(({ label, Icon }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setPurpose(label)}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-sm font-medium transition ${
                        purpose === label
                          ? "border-primary bg-primary text-white"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <Icon
                        size={18}
                        strokeWidth={1.7}
                        className={purpose === label ? "text-white" : "text-primary"}
                      />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="grid gap-5">
                <div>
                  <h2 className="text-2xl font-bold tracking-[-.02em]">
                    Describe your requirements
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {type} · {purpose}
                  </p>
                </div>
                <Field label="What should it do? *">
                  <textarea
                    rows={5}
                    className={fieldClass}
                    value={details.requirements}
                    onChange={(e) => setDetails({ ...details, requirements: e.target.value })}
                    placeholder="E.g. An online store for our mobile accessories with product listing, cart, UPI payment and order tracking."
                  />
                </Field>
                <Field label="Key features or reference sites (optional)">
                  <input
                    className={fieldClass}
                    value={details.features}
                    onChange={(e) => setDetails({ ...details, features: e.target.value })}
                    placeholder="Admin panel, Malayalam language, WhatsApp integration…"
                  />
                </Field>
                <div>
                  <span className="mb-1 block text-xs font-semibold">Approximate budget</span>
                  <p className="mb-3 text-xs text-muted-foreground">
                    The higher the budget, the higher the quality, the more features and the
                    stronger the security.
                  </p>
                  <div className="grid gap-3 md:grid-cols-3">
                    {budgetTiers.map((tier) => {
                      const active = details.budget === tier.range;
                      return (
                        <button
                          key={tier.range}
                          type="button"
                          onClick={() => setDetails({ ...details, budget: tier.range })}
                          className={`rounded-2xl border p-5 text-left transition ${
                            active
                              ? "border-primary bg-secondary/70 ring-4 ring-primary/10"
                              : "border-border hover:border-primary/40"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">
                              {tier.name}
                            </span>
                            <span className="flex gap-1">
                              {[1, 2, 3].map((n) => (
                                <span
                                  key={n}
                                  className={`h-1.5 w-4 rounded-full ${
                                    n <= tier.level ? "bg-primary" : "bg-border"
                                  }`}
                                />
                              ))}
                            </span>
                          </div>
                          <p className="mt-2 font-bold">{tier.range}</p>
                          <ul className="mt-3 grid gap-1.5 text-[11px] text-muted-foreground">
                            {tier.points.map((pt) => (
                              <li key={pt} className="flex items-start gap-1.5">
                                <Check size={13} className="mt-0.5 shrink-0 text-primary" /> {pt}
                              </li>
                            ))}
                          </ul>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetails({ ...details, budget: budgets[3] })}
                    className={`mt-3 text-xs font-medium ${
                      details.budget === budgets[3]
                        ? "text-primary underline"
                        : "text-muted-foreground hover:text-primary"
                    }`}
                  >
                    Not sure yet? We'll suggest the right plan (from ₹25,000)
                  </button>
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Timeline">
                    <select
                      className={fieldClass}
                      value={details.timeline}
                      onChange={(e) => setDetails({ ...details, timeline: e.target.value })}
                    >
                      {timelines.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-8 md:grid-cols-[1.1fr_1fr]">
                <div>
                  <h2 className="text-2xl font-bold tracking-[-.02em]">Contact IT HUB</h2>
                  <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    Send your project summary to our team. We usually reply within one working day
                    with questions, a plan and a quotation.
                  </p>
                  <div className="mt-6 grid gap-3">
                    <a
                      href={whatsapp}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-[#1a4fd6] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#0c2f8a]"
                    >
                      <WhatsAppIcon size={17} /> Send on WhatsApp
                    </a>
                    {settings.phone && (
                      <a href={`tel:${settings.phone}`} className={secondaryClass}>
                        <Phone size={16} /> Call {settings.phone}
                      </a>
                    )}
                    {settings.email && (
                      <a
                        href={`mailto:${settings.email}?subject=${encodeURIComponent(`${type} project enquiry`)}&body=${encodeURIComponent(summary)}`}
                        className={secondaryClass}
                      >
                        <Mail size={16} /> Email {settings.email}
                      </a>
                    )}
                  </div>
                  <p className="mt-5 text-xs text-muted-foreground">
                    Or visit us at {settings.address}.
                  </p>
                </div>
                <div className="rounded-2xl bg-[#0c2f8a] p-6 text-white">
                  <p className="text-[10px] font-semibold tracking-[.17em] text-blue-300">
                    YOUR PROJECT SUMMARY
                  </p>
                  <dl className="mt-4 grid gap-3 text-sm">
                    {[
                      ["Type", type],
                      ["Purpose", purpose],
                      ["Budget", details.budget],
                      ["Timeline", details.timeline],
                    ].map(([k, v]) => (
                      <div
                        key={k}
                        className="flex justify-between gap-4 border-b border-white/10 pb-2"
                      >
                        <dt className="text-blue-200">{k}</dt>
                        <dd className="text-right font-medium">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-4 whitespace-pre-line text-xs leading-6 text-blue-100">
                    {details.requirements}
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-10 flex items-center justify-between border-t border-border pt-6">
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className={`${secondaryClass} ${step === 0 ? "invisible" : ""}`}
          >
            <ArrowLeft size={16} /> Back
          </button>
          {step < 2 && (
            <Button disabled={!canNext} onClick={() => setStep(step + 1)}>
              Continue <ArrowRight size={16} />
            </Button>
          )}
        </div>
      </div>
    </Page>
  );
}
