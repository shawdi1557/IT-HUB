import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react"
import { Link } from "react-router"
import * as Dialog from "@radix-ui/react-dialog"
import {
  ArrowRight,
  X,
  PackageOpen,
  Check,
  ChevronDown,
  LoaderCircle,
  Star,
} from "lucide-react"
import { SplitText } from "./reactbits"
import ShinyText from "./ShinyText"
import logo from "../imports/ITHUBLOGO-1.jpeg"

export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(26,79,214,.6)] transition hover:-translate-y-0.5 hover:bg-[#0c2f8a] hover:shadow-[0_14px_30px_-10px_rgba(26,79,214,.7)] disabled:opacity-40"
export const secondaryClass =
  "inline-flex items-center justify-center gap-2 rounded-full border border-border bg-white px-6 py-3 text-sm font-semibold transition hover:border-primary hover:text-primary disabled:opacity-40"
export const fieldClass =
  "w-full rounded-xl border border-border bg-white px-4 py-3 text-sm transition focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:bg-muted"
export const containerClass =
  "mx-auto w-full max-w-[1320px] px-5 md:px-9 lg:px-12"
export function Button({
  variant = "primary",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary"
}) {
  return (
    <button
      {...props}
      className={`${
        variant === "primary" ? buttonClass : secondaryClass
      } ${props.className || ""}`}
    >
      {children}
    </button>
  )
}
export function ActionLink({
  to,
  children,
  secondary = false,
  className = "",
}: {
  to: string
  children: ReactNode
  secondary?: boolean
  className?: string
}) {
  return (
    <Link
      to={to}
      className={`${secondary ? secondaryClass : buttonClass} ${className}`}
    >
      {children}
    </Link>
  )
}
export function Logo({ large = false }: { large?: boolean }) {
  return (
    <img
      src={logo}
      alt="IT HUB — The Complete IT Store, since 2011"
      className={`${
        large ? "h-36 w-36" : "h-[66px] w-[66px]"
      } shrink-0 rounded-sm bg-white object-contain`}
    />
  )
}
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  link,
  to,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  link?: string
  to?: string
}) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-3 text-[10px] font-bold tracking-[.18em]">
            <ShinyText
              text={eyebrow}
              color="var(--primary)"
              shineColor="#8fa9ef"
              speed={2.4}
              delay={1.2}
            />
          </p>
        )}
        <h2 className="text-3xl font-extrabold tracking-[-.03em] md:text-[44px] md:leading-[1.05]">
          <SplitText text={title} />
        </h2>
        {subtitle && (
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {to && (
        <Link
          to={to}
          className="flex shrink-0 items-center gap-2 text-xs font-semibold text-primary md:text-sm"
        >
          {link || "Explore all"}
          <ArrowRight size={16} />
        </Link>
      )}
    </div>
  )
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string
  title: string
  description?: string
  children?: ReactNode
}) {
  return (
    <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[.18em] text-primary">
          <ShinyText
            text={eyebrow || "IT HUB · THE COMPLETE IT STORE"}
            color="var(--primary)"
            shineColor="#8fa9ef"
            speed={2.4}
            delay={1.2}
          />
        </p>
        <h1 className="text-4xl font-extrabold tracking-[-.03em] md:text-5xl">
          <SplitText text={title} />
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  )
}
export function Page({ children }: { children: ReactNode }) {
  return <div className={`${containerClass} py-10 md:py-14`}>{children}</div>
}
export function Badge({
  children,
  tone = "blue",
}: {
  children: ReactNode
  tone?: "blue" | "green" | "amber" | "red" | "gray"
}) {
  const colors = {
    blue: "bg-secondary text-primary",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    gray: "bg-muted text-muted-foreground",
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-semibold ${colors[tone]}`}
    >
      {children}
    </span>
  )
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = "max-w-2xl",
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  size?: string
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-900/40" />
        <Dialog.Content
          data-lenis-prevent
          className={`fixed left-1/2 top-1/2 z-[81] max-h-[90dvh] w-[calc(100%-32px)] ${size} -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-3xl bg-white p-6 shadow-md md:p-8`}
        >
          <Dialog.Title className="pr-8 font-display text-2xl font-bold">
            {title}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-muted-foreground">
            {description || "Explore and manage your IT HUB experience."}
          </Dialog.Description>
          <Dialog.Close
            aria-label="Close dialog"
            className="absolute right-5 top-5 rounded-full p-2 hover:bg-muted"
          >
            <X size={20} />
          </Dialog.Close>
          <div className="mt-6">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
export function Empty({
  title,
  description,
  to,
  label,
}: {
  title: string
  description: string
  to?: string
  label?: string
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/60 px-6 py-16 text-center">
      <PackageOpen className="mx-auto mb-5 text-primary" size={38} />
      <h3 className="text-xl font-bold">{title}</h3>
      <p className="my-3 text-sm text-muted-foreground">{description}</p>
      {to && (
        <ActionLink to={to}>
          {label || "Explore products"}
          <ArrowRight size={16} />
        </ActionLink>
      )}
    </div>
  )
}
export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold">{label}</span>
      {children}
    </label>
  )
}
export function Timeline({
  steps,
  current,
}: {
  steps: string[]
  current: number
}) {
  return (
    <div className="space-y-0">
      {steps.map((step, index) => (
        <div key={step} className="relative flex gap-4 pb-7 last:pb-0">
          {index < steps.length - 1 && (
            <div
              className={`absolute left-[15px] top-8 h-[calc(100%-32px)] w-px ${
                index < current ? "bg-primary" : "bg-border"
              }`}
            />
          )}
          <div
            className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs ${
              index < current
                ? "bg-primary text-white"
                : index === current
                  ? "bg-secondary text-primary ring-4 ring-primary/10"
                  : "border border-border bg-white text-muted-foreground"
            }`}
          >
            {index < current ? (
              <Check size={14} />
            ) : index === current ? (
              <span className="h-2 w-2 rounded-full bg-primary" />
            ) : (
              index + 1
            )}
          </div>
          <div className="pt-1">
            <p
              className={`text-sm font-semibold ${
                index > current ? "text-muted-foreground" : ""
              }`}
            >
              {step}
            </p>
            {index === current && (
              <p className="mt-1 text-xs text-primary">Current status</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
export function Loading() {
  return (
    <div className={`${containerClass} py-16`}>
      <LoaderCircle className="mb-8 animate-spin text-primary" />
      <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-72 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  )
}

export function Stars({
  size = 16,
  className = "",
}: {
  size?: number
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 align-middle ${className}`}
      role="img"
      aria-label="5 out of 5 stars"
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} size={size} fill="currentColor" strokeWidth={0} />
      ))}
    </span>
  )
}

export interface SelectOption {
  value: string
  label: string
}

/** Styled dropdown — replaces native <select> so the list always opens below, in theme. */
export function Select({
  value,
  options,
  onChange,
  label,
  className = "",
  align = "left",
}: {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  label?: string
  className?: string
  align?: "left" | "right"
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = options.find((option) => option.value === value) ?? options[0]
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) =>
      event.key === "Escape" && setOpen(false)
    document.addEventListener("pointerdown", close)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("pointerdown", close)
      document.removeEventListener("keydown", escape)
    }
  }, [open])
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`${fieldClass} flex items-center justify-between gap-3 text-left ${
          open ? "border-primary ring-4 ring-primary/10" : ""
        }`}
      >
        <span className="truncate">{current?.label}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-muted-foreground transition ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <ul
          role="listbox"
          data-lenis-prevent
          className={`absolute top-[calc(100%+6px)] z-40 max-h-72 min-w-full overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-1.5 shadow-xl  ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {options.map((option) => {
            const selected = option.value === current?.value
            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition ${
                    selected
                      ? "bg-secondary font-semibold text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  {option.label}
                  {selected && <Check size={14} />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
