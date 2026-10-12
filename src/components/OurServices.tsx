import { Link } from "react-router"
import { motion } from "motion/react"
import {
  ArrowRight,
  ArrowUpRight,
  Code2,
  Laptop,
  Monitor,
  Printer,
  Smartphone,
} from "lucide-react"
import banner from "../imports/services-banner.png"

// Each card shows its photo cropped from the attached services banner (1536×1024).
const services = [
  {
    name: "PC Service",
    text: "Diagnostics, Repairs, Upgrades & Custom Builds",
    Icon: Monitor,
    to: "/services/book?service=PC%20Repair",
    x: "0.8%",
    tint: "from-[#e3ecff] to-[#f5f8ff]",
    badge: "bg-[#1a4fd6]",
  },
  {
    name: "Laptop Services",
    text: "Repairs, Upgrades, Screen Replacement & Maintenance",
    Icon: Laptop,
    to: "/services/book?service=Laptop%20Repair",
    x: "32.3%",
    tint: "from-[#fff0e3] to-[#fff9f3]",
    badge: "bg-[#f47b20]",
  },
  {
    name: "Mobile Services",
    text: "Screen Replacement, Battery Service, Repairs & Software Support",
    Icon: Smartphone,
    to: "/services/book?service=Mobile%20Repair",
    x: "63.8%",
    tint: "from-[#e2f5ee] to-[#f4fbf8]",
    badge: "bg-[#16946b]",
  },
  {
    name: "Website & Software Solutions",
    text: "Custom Websites, Web Applications & Software Development",
    Icon: Code2,
    to: "/services/development",
    x: "95.5%",
    tint: "from-[#ede8ff] to-[#f8f6ff]",
    badge: "bg-[#6c4ce0]",
  },
  {
    name: "Printer Services",
    text: "Installation, Maintenance, Driver Setup & Troubleshooting",
    Icon: Printer,
    to: "/services/book?service=Printer%20Service&device=Printer",
    img: "https://images.unsplash.com/photo-1650696868612-4b836291b323?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
    tint: "from-[#e0f4fb] to-[#f3fbfe]",
    badge: "bg-[#0e8fbf]",
  },
]

function CompactServices() {
  return (
    <div className="rounded-[2rem] bg-[linear-gradient(180deg,#f4f5f7_0%,#ffffff_100%)] px-5 py-10 md:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.3em] text-[#0b1530]/60">
            Sales · Service · Solutions · Support
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-[-.03em] text-[#0b1530] md:text-4xl">
            Our{" "}
            <span className="bg-gradient-to-r from-[#1a4fd6] to-[#6c4ce0] bg-clip-text text-transparent">
              Services
            </span>
          </h2>
        </div>
        <Link
          to="/services"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
        >
          View all services <ArrowRight size={15} />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {services.map(({ name, text, Icon, to, tint, badge }) => (
          <Link
            key={name}
            to={to}
            className={`group flex flex-col rounded-2xl border border-white bg-gradient-to-b ${tint} p-5 transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-24px_rgba(12,47,138,.45)]`}
          >
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-full ${badge} text-white`}
            >
              <Icon size={19} strokeWidth={1.8} />
            </span>
            <h3 className="mt-4 text-sm font-bold text-[#0b1530]">{name}</h3>
            <p className="mt-1.5 flex-1 text-[11px] leading-5 text-[#0b1530]/65">
              {text}
            </p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">
              {to.includes("development")
                ? "Start a Project"
                : "Request Service"}
              <ArrowUpRight
                size={13}
                className="transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

// `compact` is the short Home-page version; the full banner-style layout lives on /services.
// `bleedTop` pulls the background up under the breadcrumb bar so it starts right below the navbar.
export default function OurServices({
  bleedTop = false,
  compact = false,
}: {
  bleedTop?: boolean
  compact?: boolean
}) {
  if (compact) return <CompactServices />
  return (
    <div
      className={`relative left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-[linear-gradient(180deg,#f4f5f7_0%,#fafafb_45%,#ffffff_100%)] px-5 pb-14 md:px-9 lg:px-12 ${
        bleedTop
          ? "-mt-[calc(2.5rem+3.5rem)] pt-[calc(3.5rem+3.5rem)] md:-mt-[calc(3.5rem+3.5rem)]"
          : "pt-14"
      }`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_80%_at_50%_0%,rgba(15,23,42,.035),transparent)]" />
      <div className="relative text-center">
        <h2 className="text-[clamp(2.6rem,7vw,5.2rem)] font-extrabold uppercase leading-[.92] tracking-[-.03em]">
          <span className="block text-[#0b1530]">Our</span>
          <span className="block bg-gradient-to-r from-[#1a4fd6] via-[#2f5cf0] to-[#6c4ce0] bg-clip-text text-transparent">
            Services
          </span>
        </h2>
        <p className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] font-medium uppercase tracking-[.4em] text-[#0b1530] md:text-xs">
          {["Sales", "Service", "Solutions", "Support"].map((word, i) => (
            <span key={word} className="flex items-center gap-4">
              {i > 0 && <span className="text-[#0b1530]/30">|</span>}
              {word}
            </span>
          ))}
        </p>
        <div className="mx-auto mt-5 h-0.5 w-20 rounded-full bg-primary" />
        <p className="mt-4 text-base text-[#0b1530]/80 md:text-lg">
          Your One-Stop IT Solution Partner
        </p>
      </div>

      <div className="relative mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {services.map(({ name, text, Icon, to, x, img, tint, badge }, i) => (
          <motion.div
            key={name}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
          >
            <Link
              to={to}
              className={`group flex h-full flex-col overflow-hidden rounded-3xl border border-white bg-gradient-to-b ${tint} text-center shadow-[0_18px_40px_-28px_rgba(12,47,138,.45)] transition hover:-translate-y-1 hover:shadow-[0_28px_50px_-26px_rgba(12,47,138,.55)]`}
            >
              <div className="flex flex-1 flex-col items-center px-5 pt-7">
                <span
                  className={`flex h-16 w-16 items-center justify-center rounded-full ${badge} text-white shadow-lg ring-4 ring-white/70`}
                >
                  <Icon size={28} strokeWidth={1.7} />
                </span>
                <h3 className="mt-5 text-lg font-extrabold uppercase leading-tight tracking-[-.01em] text-[#0b1530]">
                  {name}
                </h3>
                <p className="mt-2 max-w-[15rem] text-[13px] leading-5 text-[#0b1530]/70">
                  {text}
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary opacity-80 transition group-hover:opacity-100">
                  {to.includes("development")
                    ? "Start a Project"
                    : "Request Service"}
                  <ArrowUpRight
                    size={14}
                    className="transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  />
                </span>
              </div>
              <div
                aria-hidden
                className="mt-4 aspect-[358/322] w-full bg-no-repeat transition duration-500 group-hover:scale-[1.04]"
                style={
                  img
                    ? {
                        backgroundImage: `url(${img})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : {
                        backgroundImage: `url(${banner})`,
                        backgroundSize: "429% auto",
                        backgroundPosition: `${x} 92.6%`,
                      }
                }
              />
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
