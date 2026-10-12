import { useState } from "react"
import { Link } from "react-router"
import {
  ArrowRight,
  ArrowUpRight,
  Laptop,
  Cpu,
  Monitor,
  Headphones,
  Smartphone,
  Keyboard,
  HardDrive,
  ShieldCheck,
  Wrench,
  MapPin,
  ChevronRight,
  Star,
  Check,
  Package,
  Headset,
  RefreshCcw,
  RefreshCw,
  BadgeIndianRupee,
  Printer,
  Wifi,
  Gamepad2,
  Code2,
} from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import heroBanner from "../imports/Futuristic Blue Tech Showroom Banner.png"
import ShinyText from "../components/ShinyText"
import { useStore } from "../app/store"
import { images } from "../data/catalog"
import OurServices from "../components/OurServices"
import WarrantyCheck from "../components/WarrantyCheck"
import ProductCard from "../components/ProductCard"
import {
  ActionLink,
  SectionHeading,
  containerClass,
  Logo,
  Modal,
  Stars,
} from "../components/ui"
import {
  CountUp,
  FadeContent,
  GradientText,
  ScrollVelocity,
  SpotlightCard,
} from "../components/reactbits"

const homeCategories: { name: string label?: string Icon: typeof Laptop }[] = [
  { name: "Laptops", Icon: Laptop },
  { name: "Mobiles", Icon: Smartphone },
  { name: "PC Components", Icon: Cpu },
  { name: "Printers", Icon: Printer },
  { name: "Monitors", Icon: Monitor },
  { name: "Storage", Icon: HardDrive },
  { name: "Accessories", label: "Computer Accessories", Icon: Keyboard },
  { name: "Audio", label: "Headphones & Audio", Icon: Headphones },
  { name: "Networking", Icon: Wifi },
  { name: "Gaming", Icon: Gamepad2 },
]
const homeServices = [
  {
    name: "Laptop Services",
    Icon: Laptop,
    text: "Repair, upgrades, software support and diagnostics.",
    service: "Laptop Repair",
  },
  {
    name: "Mobile Services",
    Icon: Smartphone,
    text: "Device diagnostics, repair and technical assistance.",
    service: "Mobile Repair",
  },
  {
    name: "PC Services",
    Icon: Monitor,
    text: "PC repair, upgrades and maintenance.",
    service: "PC Repair",
  },
  {
    name: "Printer Services",
    Icon: Printer,
    text: "Installation, maintenance and troubleshooting.",
    service: "Printer Service",
  },
  {
    name: "Web & Software Development",
    Icon: Code2,
    text: "Websites, web apps and custom software for businesses.",
    service: "Website Development",
  },
]
export default function Home() {
  const store = useStore()
  const reduce = useReducedMotion()
  const [viewer, setViewer] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
  const SHOWCASE_LIMIT = 4
  const enter = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 14, filter: "blur(6px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: {
            duration: 0.6,
            delay,
            ease: [0.22, 1, 0.36, 1] as const,
          },
        }
  return (
    <>
      <div className={`${containerClass} pt-7 md:pt-9`}>
        <div className="relative isolate -mt-7 ml-[calc(50%-50vw)] flex min-h-[min(680px,90svh)] w-screen flex-col justify-center overflow-hidden bg-[#e8f1fd] md:-mt-9">
          <img
            src={heroBanner}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full object-cover object-center"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-radial-[ellipse_at_center] from-white/70 via-white/20 to-transparent"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background via-background/40 to-transparent"
          />
          <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
            <div className="flex max-w-3xl flex-col items-center">
              <motion.p
                {...enter(0)}
                className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/80 bg-white/80 px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur"
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 animate-pulse rounded-full bg-primary"
                />
                <ShinyText
                  text="Your Trusted Tech Hub · Since 2011"
                  color="var(--muted-foreground)"
                  shineColor="var(--primary)"
                  speed={2.5}
                  delay={0.6}
                />
              </motion.p>
              <motion.h1
                {...enter(0.08)}
                className="text-balance font-display text-5xl font-bold tracking-[-.04em] text-foreground sm:text-6xl md:text-7xl"
              >
                Everything Tech.{" "}
                <GradientText>Sales, Service & Support.</GradientText>
              </motion.h1>
              <motion.p
                {...enter(0.16)}
                className="mt-6 max-w-xl text-pretty text-base font-normal text-muted-foreground sm:text-lg"
              >
                Shop laptops, computers, mobiles, printers, accessories and
                components — backed by professional IT services and after-sales
                support from IT HUB.
              </motion.p>
              <motion.div
                {...enter(0.24)}
                className="mt-9 flex flex-wrap items-center justify-center gap-3"
              >
                <ActionLink to="/products" className="group h-11">
                  Shop Products
                  <ArrowRight
                    size={16}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </ActionLink>
                <ActionLink
                  secondary
                  to="/services"
                  className="h-11 bg-white/80 backdrop-blur hover:bg-white"
                >
                  <Wrench size={16} /> Explore Services
                </ActionLink>
              </motion.div>
            </div>
          </div>
        </div>
        <ScrollVelocity
          className="ml-[calc(50%-50vw)] mt-6 w-screen py-4 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)] font-display text-2xl font-extrabold tracking-[-.03em] text-[#0c2f8a]/80 md:text-4xl"
          items={[
            "Laptops",
            "Mobiles",
            "Printers",
            "Laptop Repair",
            "Monitors",
            "On-Site Service",
            "Accessories",
            "Warranty Support",
          ]}
        />
        <div className="grid grid-cols-2 gap-5 border-b border-border py-7 md:grid-cols-4">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-amber-50 p-2.5">
              <Star size={20} className="fill-amber-400 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-bold">
                <CountUp to={4.8} decimals={1} />{" "}
                <span className="text-[11px] font-normal text-muted-foreground">
                  / 5
                </span>{" "}
                <Stars size={11} className="text-amber-500" />
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Customer rating · static value
              </p>
            </div>
          </div>
          {[
            {
              Icon: ShieldCheck,
              title: "Trusted locally",
              text: "Serving customers since 2011",
            },
            {
              Icon: Package,
              title: "Shop. Service. Support.",
              text: "Products backed by IT services",
            },
            {
              Icon: Wrench,
              title: "Expert support",
              text: "Real people. Personal assistance.",
            },
          ].map(({ Icon, title, text }) => (
            <div key={title} className="flex items-center gap-3">
              <Icon
                size={25}
                strokeWidth={1.5}
                className="shrink-0 text-primary"
              />
              <div>
                <p className="text-xs font-semibold">{title}</p>
                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                  {text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <section className={`${containerClass} py-14`}>
        <SectionHeading
          eyebrow="WHAT CAN I BUY FROM IT HUB?"
          title="Shop by Category"
          subtitle="Laptops, mobiles, printers, components and accessories — all in one store."
          to="/products"
          link="All products"
        />
        <ul className="grid border-t border-border md:grid-cols-2 md:gap-x-10">
          {homeCategories.map(({ name, label, Icon }, index) => {
            const count = store.products.filter(
              (product) => product.category === name,
            ).length
            return (
              <li key={name} className="border-b border-border">
                <Link
                  to={`/products?category=${encodeURIComponent(name)}`}
                  className="group flex items-center gap-4 py-4 transition"
                >
                  <span className="w-6 text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary transition group-hover:bg-primary group-hover:text-white">
                    <Icon size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold tracking-[-.01em] transition group-hover:text-primary">
                      {label || name}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {count} {count === 1 ? "product" : "products"}
                    </span>
                  </span>
                  <ArrowRight
                    size={16}
                    className="shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary"
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      </section>
      <section className={`${containerClass} pb-16`}>
        <SectionHeading
          eyebrow="POPULAR AT IT HUB"
          title="Featured Products"
          subtitle="Our featured picks for work, play and everything in between."
          link="Shop all products"
          to="/products"
        />
        <FadeContent className="grid grid-cols-2 gap-3 md:gap-5 lg:grid-cols-4">
          {store.products.slice(0, 8).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </FadeContent>
      </section>
      <section className={`${containerClass}`}>
        <OurServices compact />
      </section>
      {/* ── CERTIFIED PRE-OWNED & HARDWARE BUYBACK ── */}
      <section className={`${containerClass} py-8`}>
        <div className="rounded-[2.5rem] border border-amber-200/80 bg-gradient-to-br from-amber-50/70 via-orange-50/20 to-background p-7 md:p-12 shadow-sm">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-100/80 px-3.5 py-1 text-[11px] font-bold text-amber-900">
                <RefreshCw size={12} className="text-amber-800" />
                VERIFIED SECOND-HAND & TRADE-IN
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                Certified Pre-Owned & Gadget Buyback
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Save up to 50% on thoroughly inspected, stress-tested pre-owned laptops, MacBooks, GPUs, and smartphones — or trade in your old devices for an instant evaluation and fair cash payout.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/second-hand"
                className="inline-flex items-center gap-2 rounded-full bg-amber-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700"
              >
                Browse Pre-Owned <ArrowRight size={14} />
              </Link>
              <Link
                to="/sell"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-5 py-2.5 text-xs font-semibold text-foreground transition hover:border-emerald-600 hover:text-emerald-700"
              >
                <BadgeIndianRupee size={15} className="text-emerald-600" /> Sell Your Device
              </Link>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4">
            {store.products
              .filter((p) => p.secondHand)
              .slice(0, 4)
              .map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
          </div>
        </div>
      </section>
      <section className={`${containerClass} py-14`}>
        <div className="grid gap-8 rounded-[2rem] border border-primary/20 bg-secondary/50 p-7 md:grid-cols-[1fr_1.1fr] md:p-10">
          <div>
            <p className="text-[10px] font-bold tracking-[.15em] text-primary">
              ON-SITE SERVICE
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-[-.02em] md:text-3xl">
              IT Support at Your Location
            </h2>
            <p className="mt-3 max-w-md text-sm leading-7 text-muted-foreground">
              Professional technical assistance without needing to bring your
              device to the store. Available within about 15 km of IT HUB.
            </p>
            <ol className="mt-6 grid gap-2 text-xs sm:grid-cols-2">
              {[
                "Request Service",
                "Enter PIN",
                "Check availability",
                "Schedule / contact IT HUB",
              ].map((step, index) => (
                <li
                  key={step}
                  className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <ActionLink
              to="/services/book?method=On-site%20service"
              className="mt-6"
            >
              Request On-Site Service <ArrowRight size={15} />
            </ActionLink>
          </div>
          <WarrantyCheck source="Home on-site" compact />
        </div>
      </section>
      <section className={`${containerClass} pb-14`}>
        <SectionHeading
          eyebrow="AFTER-SALES SUPPORT"
          title="We're Here After Your Purchase Too."
          subtitle="IT HUB isn't just a website that sells products."
          link="Get support"
          to="/support"
        />
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <div className="rounded-2xl bg-[#0c2f8a] p-7 text-white">
            <ShieldCheck size={26} className="text-blue-200" />
            <h3 className="mt-4 text-2xl font-bold">Need Warranty Help?</h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-blue-100">
              Find official warranty and customer-care information for your
              device.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {[
                { name: "Laptops", Icon: Laptop },
                { name: "Mobiles", Icon: Smartphone },
                { name: "Printers", Icon: Printer },
              ].map(({ name, Icon }) => (
                <Link
                  key={name}
                  to="/support?view=warranty"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-xs font-semibold text-[#0c2f8a] transition hover:bg-secondary"
                >
                  <Icon size={15} /> {name}
                </Link>
              ))}
            </div>
            <Link
              to="/services#on-site"
              className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-blue-200"
            >
              Check On-Site Warranty Eligibility <ArrowRight size={13} />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                Icon: Headset,
                title: "Brand Customer Care",
                text: "Official contacts for your device brand.",
                to: "/support?view=warranty",
              },
              {
                Icon: Wrench,
                title: "IT HUB Service",
                text: "Repairs and upgrades at our service centre.",
                to: "/services",
              },
              {
                Icon: MapPin,
                title: "On-Site Support",
                text: "Assistance at your home or office.",
                to: "/services#on-site",
              },
              {
                Icon: RefreshCcw,
                title: "Service Requests",
                text: "Raise or track a request from your account.",
                to: "/account/support",
              },
            ].map(({ Icon, title, text, to }) => (
              <Link
                key={title}
                to={to}
                className="rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40"
              >
                <Icon size={20} className="text-primary" />
                <h3 className="mt-3 text-sm font-semibold">{title}</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {text}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className={`${containerClass} pb-14`}>
        <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:items-center">
          <img
            src={images.pc}
            alt="Custom desktop PC assembled at IT HUB"
            className="h-24 w-full rounded-xl object-cover sm:w-32"
            loading="lazy"
          />
          <div className="flex-1">
            <p className="text-[10px] font-bold tracking-[.14em] text-primary">
              PC SERVICES
            </p>
            <h2 className="mt-1 text-lg font-bold">
              Build Your PC With IT HUB
            </h2>
            <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
              Choose your components and get an estimated configuration price.
              Our team can help finalize your build.
            </p>
          </div>
          <ActionLink secondary to="/pc-builder">
            Start PC Builder <Cpu size={15} />
          </ActionLink>
        </div>
      </section>
      <section className={`${containerClass} pb-14`}>
        <SectionHeading
          eyebrow="IT HUB EXPERIENCE"
          title="Your Local Technology Hub Since 2011"
          subtitle="IT sales, technology services, mobiles, software development and customer support — right here in Kothamangalam."
        />
        {store.showcase.length > 0 && (
          <FadeContent className="columns-2 gap-3 md:columns-4 md:gap-4">
            {(showAll
              ? store.showcase
              : store.showcase.slice(0, SHOWCASE_LIMIT)
            ).map((item, index) => (
              <button
                key={item.id}
                onClick={() => setViewer(index)}
                className="group relative mb-3 block w-full overflow-hidden rounded-2xl border border-border bg-muted text-left md:mb-4"
              >
                <img
                  src={item.src}
                  alt={item.caption}
                  loading="lazy"
                  className="w-full transition duration-700 group-hover:scale-[1.04]"
                />
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-10 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100">
                  {item.caption}
                  <Stars size={13} className="text-amber-300" />
                </span>
              </button>
            ))}
          </FadeContent>
        )}
        {store.showcase.length > SHOWCASE_LIMIT && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => setShowAll(!showAll)}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-6 py-3 text-sm font-semibold transition hover:border-primary hover:text-primary"
            >
              {showAll
                ? "Show less"
                : `Show more (${store.showcase.length - SHOWCASE_LIMIT} more)`}
              <ChevronRight
                size={16}
                className={`transition ${showAll ? "-rotate-90" : "rotate-90"}`}
              />
            </button>
          </div>
        )}
        <Modal
          size="max-w-3xl"
          open={viewer !== null}
          onOpenChange={(open) => !open && setViewer(null)}
          title="Happy customers"
          description={
            viewer !== null ? store.showcase[viewer]?.caption : undefined
          }
        >
          {viewer !== null && store.showcase[viewer] && (
            <div>
              <img
                src={store.showcase[viewer].src}
                alt={store.showcase[viewer].caption}
                className="mx-auto max-h-[65dvh] rounded-2xl object-contain"
              />
              <div className="mt-5 flex items-center justify-between">
                <button
                  onClick={() =>
                    setViewer(
                      (viewer - 1 + store.showcase.length) %
                        store.showcase.length,
                    )
                  }
                  className="rounded-full border border-border px-4 py-2 text-xs font-semibold hover:border-primary hover:text-primary"
                >
                  ← Previous
                </button>
                <span className="text-xs text-muted-foreground">
                  {viewer + 1} / {store.showcase.length}
                </span>
                <button
                  onClick={() =>
                    setViewer((viewer + 1) % store.showcase.length)
                  }
                  className="rounded-full border border-border px-4 py-2 text-xs font-semibold hover:border-primary hover:text-primary"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </Modal>
      </section>
      <section className={`${containerClass}`}>
        <div className="grid gap-10 rounded-[2rem] bg-muted px-7 py-14 md:grid-cols-2 md:px-12">
          <div>
            <p className="text-[10px] font-bold tracking-[.16em] text-primary">
              ROOTED IN KOTHAMANGALAM
            </p>
            <h2 className="mt-4 text-3xl font-bold">
              Local store. Complete solutions.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">
              Since 2011, IT HUB brings technology products, IT services,
              mobiles, software and after-sales support together under one roof.
              A technology store you can actually visit and trust.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <a
                href="https://maps.app.goo.gl/EGCik7Q3VUkBWmWq8"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(26,79,214,.6)] transition hover:-translate-y-0.5"
              >
                <MapPin size={16} /> Get directions
              </a>
              <Link
                to="/about"
                className="inline-flex items-center gap-2 text-xs font-semibold text-primary"
              >
                Get to know IT HUB <ArrowRight size={15} />
              </Link>
            </div>
          </div>
          <div className="relative min-h-80 overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
            <iframe
              title="IT HUB location on Google Maps"
              src="https://www.google.com/maps?q=IT+HUB+Kothamangalam+Kerala&z=16&output=embed"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0"
            />
            <a
              href="https://maps.app.goo.gl/EGCik7Q3VUkBWmWq8"
              target="_blank"
              rel="noreferrer"
              className="absolute bottom-3 left-3 flex items-center gap-3 rounded-2xl border border-border bg-white/95 px-4 py-3 shadow-lg backdrop-blur transition hover:border-primary/40"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-primary">
                <MapPin size={17} />
              </span>
              <span>
                <span className="block text-sm font-bold">
                  IT HUB, Kothamangalam
                </span>
                <span className="flex items-center gap-1 text-[11px] font-semibold text-primary">
                  Get directions <ArrowUpRight size={12} />
                </span>
              </span>
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
