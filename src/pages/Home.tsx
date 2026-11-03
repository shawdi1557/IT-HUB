import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router";
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
  X,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import heroBanner from "../imports/Futuristic Blue Tech Showroom Banner.png";
import mobileHeroBanner from "../imports/Mobile_Banner.png";
import ShinyText from "../components/ShinyText";
import AnimatedContent from "../components/AnimatedContent";
import PromotionalHeroCarousel from "../components/PromotionalHeroCarousel";
import { useStore } from "../app/store";
import { supabase } from "../lib/supabase";
import { images } from "../data/catalog";
import OurServices from "../components/OurServices";
import WarrantyCheck from "../components/WarrantyCheck";
import ProductCard from "../components/ProductCard";
import { filterFeaturedFreshProducts, calculateCategoryCounts } from "../lib/catalog";
import { fetchBlogArticles } from "../lib/blog";
import { type BlogArticle } from "../data/blog";
import { ActionLink, SectionHeading, containerClass, Logo, Modal, Stars } from "../components/ui";
import {
  CountUp,
  FadeContent,
  GradientText,
  ScrollVelocity,
  SpotlightCard,
} from "../components/reactbits";

interface HomeCategoryEntry {
  name: string;
  label?: string;
  Icon: typeof Laptop;
}

const homeCategories: HomeCategoryEntry[] = [
  { name: "Laptops", Icon: Laptop },
  { name: "Mobiles", Icon: Smartphone },
  { name: "PC Components", Icon: Cpu },
  { name: "Printers", Icon: Printer },
  { name: "Monitors", Icon: Monitor },
  { name: "Storage", Icon: HardDrive },
  { name: "Computer Accessories", label: "Computer Accessories", Icon: Keyboard },
  { name: "Headphones & Audio", label: "Headphones & Audio", Icon: Headphones },
  { name: "Networking", Icon: Wifi },
  { name: "Gaming", Icon: Gamepad2 },
];
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
];
export default function Home() {
  const store = useStore();
  const categoryCounts = useMemo(() => calculateCategoryCounts(store.products), [store.products]);
  const reduce = useReducedMotion();
  const [viewer, setViewer] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const announcement = store.announcement;
  const promotionalCampaigns = store.promotionalCampaigns || [];
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [blogArticles, setBlogArticles] = useState<BlogArticle[]>([]);

  useEffect(() => {
    fetchBlogArticles().then((data) => {
      if (data && data.length > 0) setBlogArticles(data);
    });
  }, []);

  const SHOWCASE_LIMIT = 4;
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
        };
  return (
    <>
      {announcement && !bannerDismissed && (
        <div className={`${containerClass} pt-3 pb-1 relative isolate z-30`}>
          <div className="relative flex flex-col sm:flex-row items-center justify-between gap-4 overflow-hidden rounded-2xl border border-blue-200/80 bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 p-4 text-white shadow-lg">
            <div className="flex items-center gap-4">
              {announcement.image_url && (
                <img
                  src={announcement.image_url}
                  alt=""
                  className="hidden sm:block h-14 w-14 rounded-xl object-cover border border-white/20 shrink-0"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              <div className="space-y-1 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <span className="rounded-full bg-blue-500/30 border border-blue-400/40 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-200">
                    {announcement.cta_label || "ANNOUNCEMENT"}
                  </span>
                  <span className="font-bold text-sm tracking-tight">{announcement.title}</span>
                </div>
                <p className="text-xs text-blue-100 max-w-2xl leading-relaxed">
                  {announcement.message}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link
                to={announcement.cta_url || "/services"}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-bold text-blue-900 shadow-sm transition hover:bg-blue-50"
              >
                Explore Now <ArrowRight size={14} />
              </Link>
              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                className="rounded-lg p-1.5 text-blue-300 hover:text-white transition"
                aria-label="Dismiss announcement"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 1. Full-Width Hero Section */}
      <section className="relative isolate w-full max-w-[100vw] overflow-hidden flex min-h-[780px] min-[360px]:min-h-[820px] min-[390px]:min-h-[860px] sm:min-h-[860px] md:min-h-[min(680px,90svh)] flex-col justify-start pt-5 min-[360px]:pt-7 sm:pt-12 md:justify-center md:pt-0 bg-[#e8f1fd]">
        {/* Mobile Hero Banner: 941x1672 portrait asset, visible on < 768px (md:hidden) */}
        <img
          src={mobileHeroBanner}
          alt=""
          aria-hidden="true"
          loading="eager"
          fetchPriority="high"
          className="md:hidden pointer-events-none absolute inset-0 size-full object-cover object-[center_bottom]"
        />
        {/* Desktop Hero Banner: 1780x883 landscape asset, visible on >= 768px (hidden md:block) */}
        <img
          src={heroBanner}
          alt=""
          aria-hidden="true"
          loading="eager"
          fetchPriority="high"
          className="hidden md:block pointer-events-none absolute inset-0 size-full object-cover object-center"
        />
        {/* Desktop central radial overlay */}
        <div
          aria-hidden="true"
          className="hidden md:block pointer-events-none absolute inset-0 bg-radial-[ellipse_at_center] from-white/70 via-white/20 to-transparent"
        />
        {/* Mobile top subtle contrast vignette for crisp text read without washing out bottom products */}
        <div
          aria-hidden="true"
          className="md:hidden pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/60 via-white/25 to-transparent"
        />
        {/* Bottom seamless transition gradient */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16 md:h-24 bg-gradient-to-t from-background via-background/40 to-transparent"
        />
        <div className="relative z-10 mx-auto flex w-full max-w-lg sm:max-w-6xl flex-1 flex-col items-center justify-start pt-2 sm:pt-6 md:justify-center md:pt-0 px-4 sm:px-6 py-6 sm:py-12 md:py-20 text-center">
          <div className="flex w-full max-w-full sm:max-w-3xl flex-col items-center text-center pt-7 min-[360px]:pt-8 min-[375px]:pt-9 min-[390px]:pt-10 min-[430px]:pt-11 sm:pt-0">
            <AnimatedContent
              distance={35}
              direction="vertical"
              duration={0.8}
              ease="power3.out"
              initialOpacity={0}
              delay={0}
              trigger="mount"
              className="mb-3.5 sm:mb-6 mx-auto inline-flex"
            >
              <p className="inline-flex max-w-[calc(100vw-24px)] items-center gap-2 rounded-full border border-blue-200/80 bg-white/95 px-3.5 sm:px-4 py-1.5 text-[13px] min-[390px]:text-[14px] sm:text-xs font-semibold text-slate-800 md:text-muted-foreground shadow-xs backdrop-blur">
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary"
                />
                <ShinyText
                  text="Your Trusted Tech Hub · Since 2011"
                  color="var(--muted-foreground)"
                  shineColor="var(--primary)"
                  speed={2.5}
                  delay={0.6}
                />
              </p>
            </AnimatedContent>

            <AnimatedContent
              distance={40}
              direction="vertical"
              duration={0.8}
              ease="power3.out"
              initialOpacity={0}
              blur={3}
              delay={0.12}
              trigger="mount"
              className="w-full"
            >
              <h1 className="w-full text-balance font-display text-2xl min-[360px]:text-[34px] min-[375px]:text-[38px] min-[390px]:text-[42px] sm:text-5xl md:text-6xl lg:text-7xl font-[800] tracking-tight text-[#0a1e4a] md:text-foreground text-center leading-[1.14] sm:leading-[1.12]">
                Everything Tech.{" "}
                <span className="block">
                  <GradientText>
                    Sales, Service
                    <br className="sm:hidden" /> & Support.
                  </GradientText>
                </span>
              </h1>
            </AnimatedContent>

            <AnimatedContent
              distance={35}
              direction="vertical"
              duration={0.8}
              ease="power3.out"
              initialOpacity={0}
              delay={0.24}
              trigger="mount"
              className="w-full"
            >
              <p className="mt-3.5 sm:mt-5 md:mt-6 w-full max-w-[95%] sm:max-w-xl mx-auto text-pretty text-[14px] min-[360px]:text-[15px] min-[375px]:text-[17px] min-[390px]:text-[18px] sm:text-base md:text-lg font-medium text-slate-800 md:text-muted-foreground leading-[1.5] text-center">
                <span className="md:hidden">
                  Shop laptops, computers, mobiles, printers & IT services backed by IT HUB support.
                </span>
                <span className="hidden md:inline">
                  Shop laptops, computers, mobiles, printers, accessories and components — backed by
                  professional IT services and after-sales support from IT HUB.
                </span>
              </p>
            </AnimatedContent>

            <AnimatedContent
              distance={30}
              direction="vertical"
              duration={0.8}
              ease="power3.out"
              initialOpacity={0}
              delay={0.36}
              trigger="mount"
              className="w-full"
            >
              <div className="mt-5 sm:mt-8 md:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 w-full max-w-xs sm:max-w-none mx-auto">
                <ActionLink
                  to="/products"
                  className="w-full sm:w-auto min-w-[220px] sm:min-w-0 max-w-[260px] sm:max-w-none group h-12 px-6 sm:px-7 text-[15px] min-[390px]:text-[16px] sm:text-sm font-semibold shadow-sm justify-center whitespace-nowrap"
                >
                  Shop Products
                  <ArrowRight
                    size={17}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </ActionLink>
                <ActionLink
                  secondary
                  to="/services"
                  className="w-full sm:w-auto min-w-[220px] sm:min-w-0 max-w-[260px] sm:max-w-none h-12 px-6 sm:px-7 text-[15px] min-[390px]:text-[16px] sm:text-sm font-semibold bg-white/95 backdrop-blur hover:bg-white text-slate-900 border border-blue-200/80 shadow-xs justify-center whitespace-nowrap"
                >
                  <Wrench size={17} /> Explore Services
                </ActionLink>
              </div>
            </AnimatedContent>
          </div>
        </div>
      </section>

      {/* 2. Original Animated Text Loop / Scrolling Marquee & Trust Features */}
      <div className={`${containerClass} pt-4 md:pt-6`}>
        <ScrollVelocity
          className="-mx-5 md:mx-0 md:ml-[calc(50%-50vw)] md:w-screen mt-6 py-4 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)] font-display text-2xl font-extrabold tracking-[-.03em] text-[#0c2f8a]/80 md:text-4xl"
          items={[
            "Laptops",
            "Mobiles",
            "Custom PC Builds",
            "Printers",
            "Laptop Repair",
            "Monitors",
            "On-Site Service",
            "Technology Blog",
            "Accessories",
            "Warranty Support",
          ]}
        />
        <div className="grid grid-cols-2 gap-5 border-b border-border py-7 md:grid-cols-4 lg:gap-8">
          <a
            href="https://maps.app.goo.gl/EGCik7Q3VUkBWmWq8"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 transition hover:opacity-90"
            title="View IT HUB customer rating on Google Maps"
          >
            <div className="rounded-md bg-amber-50 p-2.5 transition group-hover:bg-amber-100">
              <Star size={20} className="fill-amber-400 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-bold">
                <CountUp to={4.8} decimals={1} />{" "}
                <span className="text-[11px] font-normal text-muted-foreground">/ 5</span>{" "}
                <Stars size={11} className="text-amber-500" />
              </p>
              <p className="mt-1 text-[10px] font-medium text-muted-foreground group-hover:text-primary transition flex items-center gap-1">
                <span>Customer rating on Google Maps</span>
                <ArrowUpRight
                  size={10}
                  className="opacity-70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"
                />
              </p>
            </div>
          </a>
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
              <Icon size={25} strokeWidth={1.5} className="shrink-0 text-primary" />
              <div>
                <p className="text-xs font-semibold">{title}</p>
                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Large Promotional Campaign Carousel */}
      <section aria-label="Promotional Showcase" className="w-full">
        <PromotionalHeroCarousel campaigns={promotionalCampaigns} />
      </section>

      {/* 4. Shop by Category */}
      <section id="categories" className={`${containerClass} py-10 md:py-14`}>
        <SectionHeading
          eyebrow="WHAT CAN I BUY FROM IT HUB?"
          title="Shop by Category"
          subtitle="Laptops, mobiles, printers, components and accessories — all in one store."
          to="/products"
          link="All products"
        />

        {/* Mobile: Horizontally Scrollable Category Cards with clear carousel cue */}
        <div className="relative md:hidden">
          <div className="mb-2.5 flex items-center justify-between text-xs text-muted-foreground px-0.5">
            <span className="font-semibold text-slate-700">Explore by Department</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
              Swipe to explore <ArrowRight size={13} />
            </span>
          </div>

          <div
            className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none gap-3 pb-3 -mx-4 px-4 touch-pan-y overscroll-x-contain"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {homeCategories.map(({ name, label, Icon }) => {
              const count = categoryCounts[name] || 0;
              return (
                <Link
                  key={name}
                  to={`/products?category=${encodeURIComponent(name)}`}
                  className="w-[140px] shrink-0 snap-start flex flex-col justify-between p-3.5 rounded-2xl border border-slate-200/90 bg-white shadow-xs transition active:scale-95 hover:border-primary/50"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-primary">
                    <Icon size={20} />
                  </div>
                  <div className="mt-3">
                    <span className="block truncate text-xs font-bold text-slate-900">
                      {label || name}
                    </span>
                    <span className="text-[10px] font-medium text-slate-500">
                      {count} {count === 1 ? "item" : "items"}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Desktop / Tablet: 2-Column Responsive List */}
        <ul className="hidden md:grid border-t border-border md:grid-cols-2 md:gap-x-12 lg:gap-x-16 xl:gap-x-20">
          {homeCategories.map(({ name, label, Icon }, index) => {
            const count = categoryCounts[name] || 0;
            return (
              <li key={name} className="border-b border-border">
                <Link
                  to={`/products?category=${encodeURIComponent(name)}`}
                  className="group flex items-center gap-4 sm:gap-5 py-4 sm:py-4.5 transition"
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
            );
          })}
        </ul>
      </section>
      <section className={`${containerClass} pb-12 md:pb-16`}>
        <SectionHeading
          eyebrow="POPULAR AT IT HUB"
          title="Featured Products"
          subtitle="Our featured picks for work, play and everything in between."
          link="Shop all products"
          to="/products"
        />

        {/* Mobile: Horizontal Product Carousel */}
        <div
          className="flex md:hidden overflow-x-auto snap-x snap-mandatory scrollbar-none gap-3.5 pb-3 -mx-4 px-4 touch-pan-y overscroll-x-contain"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {filterFeaturedFreshProducts(store.products, 8).map((product) => (
            <div key={product.id} className="w-[190px] sm:w-[200px] shrink-0 snap-start">
              <ProductCard product={product} />
            </div>
          ))}
        </div>

        {/* Desktop / Tablet Grid */}
        <FadeContent className="hidden md:grid grid-cols-2 gap-3 md:gap-5 lg:grid-cols-4">
          {filterFeaturedFreshProducts(store.products, 8).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </FadeContent>
      </section>

      {/* ── BUILD YOUR PERFECT PC & FIND MY PC ── */}
      <section className={`${containerClass} pb-12 md:pb-14`}>
        <div className="flex flex-col gap-6 rounded-3xl border border-primary/20 bg-gradient-to-br from-blue-50/60 via-card to-card p-6 sm:p-8 md:flex-row md:items-center shadow-xs">
          <img
            src={images.pc}
            alt="Custom desktop PC assembled at IT HUB"
            className="h-36 w-full rounded-2xl object-cover sm:h-32 sm:w-44 border border-border/80 shadow-xs"
            loading="lazy"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-primary uppercase">
                Interactive Configurator
              </span>
              <span className="text-[10px] font-medium text-muted-foreground">
                Live Compatibility Check
              </span>
            </div>
            <h2 className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Build Your Perfect PC
            </h2>
            <p className="mt-1.5 max-w-xl text-xs sm:text-sm leading-relaxed text-muted-foreground">
              Find compatible components or discover a PC configuration that matches your needs. Our
              team in Kothamangalam helps verify compatibility, finalize parts, and assemble your
              dream rig.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                to="/pc-builder?mode=smart"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 active:scale-95"
              >
                <Sparkles size={14} /> Find My PC
              </Link>
              <Link
                to="/pc-builder"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-5 py-2.5 text-xs font-semibold text-foreground shadow-xs transition hover:border-primary hover:text-primary active:scale-95"
              >
                <Cpu size={14} className="text-primary" /> Custom PC Builder
              </Link>
            </div>
          </div>
        </div>
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
                Save up to 50% on thoroughly inspected, stress-tested pre-owned laptops, MacBooks,
                GPUs, and smartphones — or trade in your old devices for an instant evaluation and
                fair cash payout.
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
            <p className="text-[10px] font-bold tracking-[.15em] text-primary">ON-SITE SERVICE</p>
            <h2 className="mt-3 text-2xl font-bold tracking-[-.02em] md:text-3xl">
              IT Support at Your Location
            </h2>
            <p className="mt-3 max-w-md text-sm leading-7 text-muted-foreground">
              Professional technical assistance without needing to bring your device to the store.
              Available within about 15 km of IT HUB.
            </p>
            <ol className="mt-6 grid gap-2 text-xs sm:grid-cols-2">
              {[
                "Request Service",
                "Enter PIN",
                "Check availability",
                "Schedule / contact IT HUB",
              ].map((step, index) => (
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
              Find official warranty and customer-care information for your device.
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
              Check On-Site Service Eligibility <ArrowRight size={13} />
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
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
      {/* ── LATEST FROM IT HUB BLOG ── */}
      {blogArticles.length > 0 && (
        <section className={`${containerClass} pb-14`}>
          <SectionHeading
            eyebrow="TECHNOLOGY INSIGHTS"
            title="Latest from IT HUB Blog"
            subtitle="Hardware reviews, maintenance guides, and technology analysis from our engineers."
            link="Read all articles"
            to="/blog"
          />

          {/* Mobile: Horizontally Scrollable Article Cards */}
          <div className="flex md:hidden overflow-x-auto snap-x scrollbar-none gap-4 pb-3 -mx-4 px-4">
            {blogArticles.slice(0, 4).map((article) => (
              <Link
                key={article.id}
                to={`/blog/${article.slug}`}
                className="w-[260px] shrink-0 snap-start group flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs transition hover:border-primary/40 active:scale-95"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
                  <img
                    src={article.image}
                    alt={article.imageAlt || article.title}
                    className="size-full object-cover transition duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                  <span className="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-0.5 text-[10px] font-bold text-primary shadow-xs backdrop-blur">
                    {article.category}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <span className="text-[10px] font-medium text-slate-500">
                    {article.publishedAt} · {article.readTimeMinutes} min read
                  </span>
                  <h3 className="mt-1 line-clamp-2 text-xs font-bold text-slate-900 group-hover:text-primary">
                    {article.title}
                  </h3>
                  <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500 flex-1">
                    {article.excerpt}
                  </p>
                  <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-primary">
                    Read article{" "}
                    <ArrowRight size={12} className="transition group-hover:translate-x-0.5" />
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop / Tablet Grid */}
          <div className="hidden md:grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {blogArticles.slice(0, 3).map((article) => (
              <Link
                key={article.id}
                to={`/blog/${article.slug}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/40 hover:shadow-sm"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
                  <img
                    src={article.image}
                    alt={article.imageAlt || article.title}
                    className="size-full object-cover transition duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                  <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-0.5 text-[10px] font-bold text-primary shadow-xs backdrop-blur">
                    {article.category}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <span className="text-[11px] text-muted-foreground">
                    {article.publishedAt} · {article.readTimeMinutes} min read
                  </span>
                  <h3 className="mt-1.5 line-clamp-2 text-sm font-bold text-foreground group-hover:text-primary">
                    {article.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground flex-1">
                    {article.excerpt}
                  </p>
                  <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-primary">
                    Read article{" "}
                    <ArrowRight size={13} className="transition group-hover:translate-x-0.5" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className={`${containerClass} pb-14`}>
        <SectionHeading
          eyebrow="IT HUB EXPERIENCE"
          title="Your Local Technology Hub Since 2011"
          subtitle="IT sales, technology services, mobiles, software development and customer support — right here in Kothamangalam."
        />
        {store.showcase.length > 0 && (
          <FadeContent className="columns-2 gap-3 md:columns-4 md:gap-4">
            {(showAll ? store.showcase : store.showcase.slice(0, SHOWCASE_LIMIT)).map(
              (item, index) => (
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
              ),
            )}
          </FadeContent>
        )}
        {store.showcase.length > SHOWCASE_LIMIT && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => setShowAll(!showAll)}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-6 py-3 text-sm font-semibold transition hover:border-primary hover:text-primary"
            >
              {showAll ? "Show less" : `Show more (${store.showcase.length - SHOWCASE_LIMIT} more)`}
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
          description={viewer !== null ? store.showcase[viewer]?.caption : undefined}
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
                    setViewer((viewer - 1 + store.showcase.length) % store.showcase.length)
                  }
                  className="rounded-full border border-border px-4 py-2 text-xs font-semibold hover:border-primary hover:text-primary"
                >
                  ← Previous
                </button>
                <span className="text-xs text-muted-foreground">
                  {viewer + 1} / {store.showcase.length}
                </span>
                <button
                  onClick={() => setViewer((viewer + 1) % store.showcase.length)}
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
            <h2 className="mt-4 text-3xl font-bold">Local store. Complete solutions.</h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">
              Since 2011, IT HUB brings technology products, IT services, mobiles, software and
              after-sales support together under one roof. A technology store you can actually visit
              and trust.
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
                <span className="block text-sm font-bold">IT HUB, Kothamangalam</span>
                <span className="flex items-center gap-1 text-[11px] font-semibold text-primary">
                  Get directions <ArrowUpRight size={12} />
                </span>
              </span>
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
