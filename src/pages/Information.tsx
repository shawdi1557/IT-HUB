import { useState } from "react";
import { Link } from "react-router";
import {
  ArrowUpRight,
  ArrowRight,
  MapPin,
  Phone,
  Wrench,
  ShoppingBag,
  ShieldCheck,
  Cpu,
  Check,
  BadgeCheck,
  Award,
  ZoomIn,
} from "lucide-react";
import WhatsAppIcon from "../components/WhatsAppIcon";
import ShinyText from "../components/ShinyText";
import { useStore } from "../app/store";
import { FadeContent, SplitText } from "../components/reactbits";
import {
  ActionLink,
  buttonClass,
  Badge,
  Button,
  Field,
  Logo,
  Modal,
  Page,
  PageHeading,
  fieldClass,
  Stars,
} from "../components/ui";

const MAP_URL = "https://maps.app.goo.gl/EGCik7Q3VUkBWmWq8";
import asusCert from "../assets/recognition/asus-premium-partner.jpg";
import canonCert from "../assets/recognition/canon-authorised-reseller.jpg";
import epsonCert from "../assets/recognition/epson-channel-partner.jpg";
import numericCert from "../assets/recognition/numeric-energy-partner.jpg";
import iggisCert from "../assets/recognition/iggis-honour-recognition.jpg";
import intelCert from "../assets/recognition/about-store.png";
import storeBuildingImg from "../assets/about-store-building.jpg";
import {
  formatDate,
  images,
  offerHeadline,
  offerStatus,
  type Offer,
  type CertificateItem,
  initialCertificates,
} from "../data/catalog";

const offerLink = (offer: Offer) =>
  offer.categories[0]
    ? `/products?category=${encodeURIComponent(offer.categories[0])}`
    : offer.brands[0]
      ? `/products?brand=${encodeURIComponent(offer.brands[0])}`
      : offer.products[0]
        ? `/products/${offer.products[0]}`
        : "/products";

export function Offers() {
  const store = useStore();
  const active = store.offers.filter((offer) => offerStatus(offer) === "Active");
  const upcoming = store.offers.filter((offer) => offerStatus(offer) === "Scheduled");
  return (
    <Page>
      <PageHeading
        eyebrow="CURRENT OFFERS"
        title="Good technology. Better value."
        description="Offers apply automatically to eligible products — no code needed."
      />
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {active.map((offer) => (
          <article
            key={offer.id}
            className="flex flex-col overflow-hidden rounded-xl border border-border bg-white shadow-sm"
          >
            {offer.banner ? (
              <img src={offer.banner} alt="" className="h-40 w-full object-cover" />
            ) : (
              <div className="h-2 bg-primary" />
            )}
            <div className="flex flex-1 flex-col p-7">
              <h2 className="text-xl font-bold leading-tight">{offer.name}</h2>
              <p className="mt-4 text-3xl font-bold text-primary">{offerHeadline(offer)}</p>
              <p className="mt-3 text-sm text-muted-foreground">{offer.description}</p>
              {offer.endsAt && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Valid until {formatDate(offer.endsAt)}
                </p>
              )}
              <ActionLink to={offerLink(offer)} className="mt-6 w-full">
                View Offer → Shop Products
              </ActionLink>
            </div>
          </article>
        ))}
      </div>
      {!active.length && (
        <p className="rounded-lg bg-muted p-10 text-center text-muted-foreground">
          No offers are running right now. Please check back soon.
        </p>
      )}
      {upcoming.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-4 text-sm font-semibold text-muted-foreground">Coming soon</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {upcoming.map((offer) => (
              <div
                key={offer.id}
                className="rounded-lg border border-dashed border-border bg-muted p-5 text-sm text-muted-foreground"
              >
                <p className="font-semibold text-foreground">{offer.name}</p>
                <p className="mt-1">{offerHeadline(offer)}</p>
                <p className="mt-1 text-xs">Starts {formatDate(offer.startsAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Page>
  );
}
export function LocationCard() {
  return (
    <div className="relative isolate h-80 overflow-hidden rounded-3xl border border-border bg-muted shadow-sm md:h-96">
      <iframe
        title="IT HUB location on Google Maps"
        src="https://www.google.com/maps?q=IT+HUB+Kothamangalam+Kerala&z=16&output=embed"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
        className="h-full w-full border-0"
      />
      <div className="absolute bottom-3 left-3 flex items-center gap-3 rounded-2xl border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
        <MapPin size={20} className="shrink-0 text-primary" />
        <div>
          <p className="text-sm font-bold">IT HUB</p>
          <p className="text-[11px] text-muted-foreground">Kothamangalam, Kerala</p>
        </div>
        <a
          href={MAP_URL}
          target="_blank"
          rel="noreferrer"
          className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground"
        >
          Directions <ArrowUpRight size={12} />
        </a>
      </div>
    </div>
  );
}
export function About() {
  const store = useStore();
  const [viewCert, setViewCert] = useState<CertificateItem | null>(null);
  const certificates =
    store.certificates && store.certificates.length > 0 ? store.certificates : initialCertificates;
  return (
    <Page>
      <section className="relative pb-8 pt-4 md:py-12">
        <div className="relative grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-[10px] font-semibold tracking-[.17em] text-primary">
              <ShinyText
                text="ABOUT IT HUB"
                color="#1a4fd6"
                shineColor="#60a5fa"
                speed={2.5}
                delay={0.8}
              />
            </p>
            <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-[-.03em] text-foreground md:text-6xl">
              <SplitText text="Technology. Experience." />{" "}
              <span className="text-primary">Trust.</span>
            </h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-muted-foreground">
              Established in 2011, IT HUB has grown from an IT products and services store into a
              complete technology solutions provider. With nearly 15 years of experience in the IT
              industry, we have built our journey around reliable products, professional services,
              and long-term customer relationships.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={MAP_URL} target="_blank" rel="noreferrer" className={buttonClass}>
                <MapPin size={16} /> Get directions
              </a>
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground transition hover:bg-muted"
              >
                Contact us <ArrowUpRight size={16} />
              </Link>
            </div>
          </div>
          <div className="flex items-center justify-center">
            <div className="group relative w-full max-w-sm sm:max-w-md overflow-hidden rounded-3xl border border-border/80 bg-white p-2 shadow-lg transition-all duration-300 hover:shadow-xl">
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-muted">
                <img
                  src={storeBuildingImg}
                  alt="IT HUB Flagship Store — The Complete IT Store, Kothamangalam"
                  className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.03]"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 text-white">
                  <p className="text-[11px] font-semibold tracking-wider text-blue-200 uppercase">
                    Flagship Store · Since 2011
                  </p>
                  <p className="text-sm font-bold text-white drop-shadow-sm">
                    IT HUB — The Complete IT Store
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <div className="grid gap-10 py-14 md:grid-cols-[1.15fr_1fr]">
        <FadeContent className="space-y-4 text-sm leading-7 text-muted-foreground">
          <h2 className="mb-6 text-3xl font-bold tracking-[-.02em] text-foreground">
            From a local store to complete solutions.
          </h2>
          <p>
            In 2016, we expanded into the mobile technology segment, adding mobile devices and
            accessories to our growing range of technology products.
          </p>
          <p>
            In 2026, IT HUB entered the software development and digital solutions field, expanding
            our capabilities beyond hardware and retail. Our software division focuses on website
            development, web applications, and custom software solutions, helping businesses and
            organizations build their digital presence and streamline their operations.
          </p>
          <p>
            Today, IT HUB brings together IT products, mobile technology, professional services,
            custom PC solutions, and software development under one roof.
          </p>
          <p>
            Whether you're looking for the latest technology, need a device serviced, want to build
            a custom PC, or need a digital solution for your business — IT HUB is here to help.
          </p>
          <p className="pt-2 font-semibold text-foreground">
            IT HUB — The Complete IT Store.
            <br />
            <span className="font-normal text-muted-foreground">Serving customers since 2011.</span>
          </p>
        </FadeContent>
        <FadeContent delay={120} className="rounded-3xl border border-border bg-card p-7 md:p-9">
          <p className="text-[10px] font-semibold tracking-[.17em] text-primary">OUR JOURNEY</p>
          <ol className="relative mt-7 space-y-8 border-l-2 border-primary/20 pl-7">
            {[
              [
                "2011",
                "IT HUB Founded",
                "Started with IT products, sales, and technical services.",
              ],
              ["2016", "Mobile Technology", "Expanded into mobile phone sales and accessories."],
              [
                "2026",
                "Software & Digital Solutions",
                "Entered the software development field, offering websites, web applications, and custom software solutions.",
              ],
            ].map(([year, title, text]) => (
              <li key={year} className="relative">
                <span className="absolute -left-[37px] top-1 h-4 w-4 rounded-full border-4 border-card bg-primary ring-2 ring-primary/30" />
                <p className="font-display text-2xl font-bold text-primary">{year}</p>
                <h3 className="mt-1 text-base font-semibold">{title}</h3>
                <p className="mt-1.5 text-xs leading-6 text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </FadeContent>
      </div>
      <FadeContent className="relative my-14 w-full">
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[.18em] text-primary">
            <ShinyText
              text="OFFICIAL ACCREDITATIONS & PARTNERSHIPS"
              color="#1a4fd6"
              shineColor="#60a5fa"
              speed={2.5}
              delay={0.8}
            />
          </p>
          <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-[-.02em] text-foreground md:text-4xl">
            Recognised by the World's Leading Technology Brands
          </h2>
          <p className="mt-3.5 text-sm leading-7 text-muted-foreground">
            Every laptop, printer, component, and device sold at IT HUB comes directly through
            authorized manufacturer channels with 100% genuine brand warranty, trusted service, and
            direct factory backing.
          </p>
        </div>

        {/* Minimalist Trust Features Strip */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3.5 rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">100% Genuine Inventory</p>
              <p className="text-[11px] text-muted-foreground">
                Direct authorized distributor sourcing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <BadgeCheck size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">Official Brand Warranty</p>
              <p className="text-[11px] text-muted-foreground">
                Honoured at authorized service centres
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-2xl border border-border/80 bg-card p-4 shadow-xs">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Award size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">Trusted Since 2011</p>
              <p className="text-[11px] text-muted-foreground">
                15+ years technology retail & service
              </p>
            </div>
          </div>
        </div>

        {/* 6-Card Minimalist Professional E-Commerce Grid */}
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {certificates.map((item) => (
            <div
              key={item.text}
              onClick={() => setViewCert(item)}
              className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg cursor-pointer"
            >
              <div>
                {/* Certificate Preview Frame */}
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border/60 bg-muted/40 p-2.5 transition-colors group-hover:bg-muted/60 flex items-center justify-center">
                  <img
                    src={item.image}
                    alt={item.alt}
                    className="h-full w-full object-contain rounded-lg transition-transform duration-500 group-hover:scale-[1.03]"
                    loading="lazy"
                  />
                  <div className="pointer-events-none absolute inset-0 rounded-xl bg-primary/0 transition-colors group-hover:bg-primary/5" />
                  <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-foreground/85 px-2.5 py-1 text-[11px] font-medium text-background backdrop-blur-sm opacity-0 transition-opacity group-hover:opacity-100">
                    <ZoomIn size={12} /> Inspect
                  </span>
                </div>

                {/* Card Meta */}
                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center rounded-md bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-primary">
                    {item.brand}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                    <BadgeCheck size={13} /> {item.validity}
                  </span>
                </div>

                <h3 className="mt-2.5 font-display text-base font-bold text-foreground transition-colors group-hover:text-primary">
                  {item.text}
                </h3>

                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                  {item.description}
                </p>
              </div>

              {/* Card Footer */}
              <div className="mt-5 flex items-center justify-between border-t border-border/60 pt-3 text-xs">
                <span className="truncate text-[11px] font-medium text-muted-foreground">
                  {item.category}
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-primary transition-transform group-hover:translate-x-0.5">
                  View Certificate <ArrowUpRight size={13} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </FadeContent>
      <div className="grid gap-5 md:grid-cols-3">
        {[
          {
            title: "Buy technology.",
            Icon: ShoppingBag,
            text: "Find laptops, components, devices and accessories for your everyday needs.",
            to: "/products",
          },
          {
            title: "Build technology.",
            Icon: Cpu,
            text: "Configure a PC around you, with component selection and compatibility checks.",
            to: "/pc-builder",
          },
          {
            title: "Service technology.",
            Icon: Wrench,
            text: "Get professional diagnosis, service and support for your devices.",
            to: "/services",
          },
        ].map(({ title, Icon, text, to }) => (
          <Link key={title} to={to} className="rounded-lg bg-muted p-7">
            <Icon className="text-primary" size={25} />
            <h3 className="mt-5 text-xl font-bold">{title}</h3>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">{text}</p>
            <ArrowRight className="mt-5 text-primary" size={17} />
          </Link>
        ))}
      </div>
      <div className="my-12 rounded-lg bg-secondary p-8 text-center">
        <p className="flex items-center justify-center text-xl text-amber-500">
          <Stars size={22} /> <span className="ml-2 font-bold text-foreground">4.8/5</span>
        </p>
        <h3 className="mt-4 text-xl font-bold">Trusted by local customers.</h3>
        <p className="mt-3 text-sm text-muted-foreground">
          Technology products, service support and local assistance.
        </p>
        <p className="mt-3 text-[10px] text-muted-foreground">
          Customer rating · supplied static prototype value · no live review integration
        </p>
      </div>
      <div className="grid items-center gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-3xl font-bold">Your neighbourhood tech hub.</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            Visit IT HUB in Kothamangalam, Kerala. Contact the store for verified directions,
            contact details and service availability.
          </p>
          <ActionLink secondary to="/contact" className="mt-5">
            Contact IT HUB <ArrowRight size={15} />
          </ActionLink>
        </div>
        <LocationCard />
      </div>
      <Modal
        open={!!viewCert}
        onOpenChange={(open) => !open && setViewCert(null)}
        title={viewCert?.text || "Recognition Certificate"}
        description={viewCert?.description}
        size="max-w-3xl"
      >
        {viewCert && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted/20 p-3 shadow-inner">
              <img
                src={viewCert.image}
                alt={viewCert.alt || viewCert.text}
                className="max-h-[65vh] w-auto max-w-full rounded-xl object-contain shadow-xs"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-3.5">
              <div className="flex items-center gap-2.5">
                <ShieldCheck size={20} className="shrink-0 text-emerald-600" />
                <div>
                  <p className="text-xs font-bold text-foreground">
                    Verified Authentic Manufacturer Partnership
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Official authorization for IT HUB · Kothamangalam, Kerala
                  </p>
                </div>
              </div>
              {viewCert.shopUrl && (
                <Link
                  to={viewCert.shopUrl}
                  onClick={() => setViewCert(null)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#0c2f8a]"
                >
                  Browse {viewCert.brand} Products <ArrowRight size={13} />
                </Link>
              )}
            </div>
          </div>
        )}
      </Modal>
    </Page>
  );
}
export function Contact() {
  const store = useStore();
  const [info, setInfo] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    type: "Product enquiry",
    message: "",
  });
  return (
    <Page>
      <PageHeading
        title="Let’s talk technology."
        description="Visit the store, ask about a product, or get help with your device. IT HUB is right here in Kothamangalam."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            name: "Call us",
            Icon: Phone,
            text: store.settings.phone || "+91 98472 23886",
          },
          {
            name: "WhatsApp",
            Icon: WhatsAppIcon,
            text: "+91 98472 23886",
          },
          {
            name: "Visit our store",
            Icon: MapPin,
            text: "Molathu Building, College Jn., Kothamangalam",
          },
          {
            name: "Store Hours",
            Icon: Wrench,
            text: "10:00 AM – 8:30 PM (Sun: Holiday)",
          },
        ].map(({ name, Icon, text }) => (
          <button
            key={name}
            onClick={() =>
              name === "Service enquiry" ? setInfo("Service enquiries") : setInfo(name)
            }
            className="rounded-lg border border-border p-6 text-left transition hover:border-primary/40"
          >
            <Icon size={24} className="text-primary" />
            <h2 className="mt-5 text-lg font-bold">{name}</h2>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">{text}</p>
            <ArrowUpRight size={16} className="mt-5 text-primary" />
          </button>
        ))}
      </div>
      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="mb-5 text-2xl font-bold">Find your way to our hub.</h2>
          <LocationCard />
          <p className="mt-4 text-xs leading-6 text-muted-foreground">
            Molathu Building, College Jn., Kothamangalam, Kerala - 686691.
            <br />
            Working hours: Monday to Saturday, 10:00 AM – 8:30 PM (Sunday: Holiday).
          </p>
          <a
            href="https://www.justdial.com/Ernakulam/IT-HUB-Ma-College-Kothamangalam-Ernakulam/0484PX484-X484-120621183943-F6M7_BZDET"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-primary"
          >
            View the supplied business listing <ArrowUpRight size={14} />
          </a>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            store.set((previous) => ({
              tickets: [
                {
                  id: `ENQ-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
                  subject: `${form.type} · ${form.name}`,
                  message: `${form.email}: ${form.message}`,
                  status: "Open",
                },
                ...previous.tickets,
              ],
            }));
            setForm({
              name: "",
              email: "",
              type: "Product enquiry",
              message: "",
            });
            store.notify("Demo enquiry saved. No message was sent.");
          }}
          className="space-y-5 rounded-lg border border-border p-7"
        >
          <h2 className="text-2xl font-bold">Start a conversation.</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name">
              <input
                required
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className={fieldClass}
              />
            </Field>
            <Field label="Email">
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                className={fieldClass}
              />
            </Field>
          </div>
          <Field label="Enquiry type">
            <select
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value })}
              className={fieldClass}
            >
              {["Product enquiry", "Service enquiry", "Custom PC", "Other"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="What can we help with?">
            <textarea
              required
              minLength={10}
              rows={4}
              value={form.message}
              onChange={(event) => setForm({ ...form, message: event.target.value })}
              className={fieldClass}
            />
          </Field>
          <Button type="submit">
            Save demo enquiry <ArrowRight size={15} />
          </Button>
          <p className="text-[10px] leading-5 text-muted-foreground">
            Frontend demonstration only. No email or message is sent. Use the business listing to
            contact IT HUB directly.
          </p>
        </form>
      </div>
      <Modal
        open={Boolean(info)}
        onOpenChange={(open) => {
          if (!open) setInfo("");
        }}
        title={info}
      >
        <div className="space-y-2 text-sm leading-6 text-muted-foreground">
          <p>
            <strong>Phone (Verified):</strong>{" "}
            <a href="tel:+919847223886" className="text-primary font-semibold">
              +91 98472 23886
            </a>
          </p>
          <p>
            <strong>Email:</strong>{" "}
            <a href="mailto:ithubkmgm@gmail.com" className="text-primary font-semibold">
              ithubkmgm@gmail.com
            </a>
          </p>
          <p>
            <strong>Store Working Hours:</strong> Monday – Saturday: 10:00 AM to 8:30 PM
          </p>
          <p>
            <strong>Sunday:</strong> <span className="font-semibold text-rose-600">Holiday</span>
          </p>
          <p>
            <strong>Address:</strong> Molathu Building, College Jn., Kothamangalam, Kerala - 686691
          </p>
        </div>
        <a
          href="https://www.justdial.com/Ernakulam/IT-HUB-Ma-College-Kothamangalam-Ernakulam/0484PX484-X484-120621183943-F6M7_BZDET"
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary"
        >
          Open business listing <ArrowUpRight size={16} />
        </a>
        <div className="mt-6">
          <ActionLink to="/services/book">Book a demo service</ActionLink>
        </div>
      </Modal>
    </Page>
  );
}
