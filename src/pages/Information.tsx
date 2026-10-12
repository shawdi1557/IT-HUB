import { useState } from "react"
import { Link } from "react-router"
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
} from "lucide-react"
import WhatsAppIcon from "../components/WhatsAppIcon"
import ShinyText from "../components/ShinyText"
import { useStore } from "../app/store"
import { FadeContent, SplitText } from "../components/reactbits"
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
} from "../components/ui"

const MAP_URL = "https://maps.app.goo.gl/EGCik7Q3VUkBWmWq8"
import {
  formatDate,
  images,
  offerHeadline,
  offerStatus,
  type Offer,
} from "../data/catalog"

const offerLink = (offer: Offer) =>
  offer.categories[0]
    ? `/products?category=${encodeURIComponent(offer.categories[0])}`
    : offer.brands[0]
      ? `/products?brand=${encodeURIComponent(offer.brands[0])}`
      : offer.products[0]
        ? `/products/${offer.products[0]}`
        : "/products"

export function Offers() {
  const store = useStore()
  const active = store.offers.filter((offer) => offerStatus(offer) === "Active")
  const upcoming = store.offers.filter(
    (offer) => offerStatus(offer) === "Scheduled",
  )
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
              <img
                src={offer.banner}
                alt=""
                className="h-40 w-full object-cover"
              />
            ) : (
              <div className="h-2 bg-primary" />
            )}
            <div className="flex flex-1 flex-col p-7">
              <h2 className="text-xl font-bold leading-tight">{offer.name}</h2>
              <p className="mt-4 text-3xl font-bold text-primary">
                {offerHeadline(offer)}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                {offer.description}
              </p>
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
          <h2 className="mb-4 text-sm font-semibold text-muted-foreground">
            Coming soon
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {upcoming.map((offer) => (
              <div
                key={offer.id}
                className="rounded-lg border border-dashed border-border bg-muted p-5 text-sm text-muted-foreground"
              >
                <p className="font-semibold text-foreground">{offer.name}</p>
                <p className="mt-1">{offerHeadline(offer)}</p>
                <p className="mt-1 text-xs">
                  Starts {formatDate(offer.startsAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Page>
  )
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
          <p className="text-[11px] text-muted-foreground">
            Kothamangalam, Kerala
          </p>
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
  )
}
export function About() {
  return (
    <Page>
      <section className="relative isolate overflow-hidden rounded-[2rem] bg-[#0c2f8a] p-8 text-white md:p-14">
        <div className="relative grid items-center gap-10 md:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="inline-flex rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[10px] font-semibold tracking-[.17em] text-blue-200">
              <ShinyText
                text="ABOUT IT HUB"
                color="#93b4f5"
                shineColor="#ffffff"
                speed={2.5}
                delay={0.8}
              />
            </p>
            <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-[-.03em] md:text-6xl">
              <SplitText text="Technology. Experience." />{" "}
              <span className="text-blue-200">Trust.</span>
            </h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-blue-100">
              Established in 2011, IT HUB has grown from an IT products and
              services store into a complete technology solutions provider. With
              nearly 15 years of experience in the IT industry, we have built
              our journey around reliable products, professional services, and
              long-term customer relationships.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={MAP_URL}
                target="_blank"
                rel="noreferrer"
                className={buttonClass}
              >
                <MapPin size={16} /> Get directions
              </a>
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-6 py-3 text-sm font-semibold transition hover:bg-white/15"
              >
                Contact us <ArrowUpRight size={16} />
              </Link>
            </div>
          </div>
          <div className="flex items-center justify-center">
            <img
              src={new URL("../imports/ITHUBLOGO-1.jpeg", import.meta.url).href}
              alt="Official IT HUB logo — The Complete IT Store, since 2011"
              className="w-full max-w-72 rounded-3xl bg-white object-contain p-4 shadow-md "
            />
          </div>
        </div>
      </section>
      <div className="grid gap-10 py-14 md:grid-cols-[1.15fr_1fr]">
        <FadeContent className="space-y-4 text-sm leading-7 text-muted-foreground">
          <h2 className="mb-6 text-3xl font-bold tracking-[-.02em] text-foreground">
            From a local store to complete solutions.
          </h2>
          <p>
            In 2016, we expanded into the mobile technology segment, adding
            mobile devices and accessories to our growing range of technology
            products.
          </p>
          <p>
            In 2026, IT HUB entered the software development and digital
            solutions field, expanding our capabilities beyond hardware and
            retail. Our software division focuses on website development, web
            applications, and custom software solutions, helping businesses and
            organizations build their digital presence and streamline their
            operations.
          </p>
          <p>
            Today, IT HUB brings together IT products, mobile technology,
            professional services, custom PC solutions, and software development
            under one roof.
          </p>
          <p>
            Whether you're looking for the latest technology, need a device
            serviced, want to build a custom PC, or need a digital solution for
            your business — IT HUB is here to help.
          </p>
          <p className="pt-2 font-semibold text-foreground">
            IT HUB — The Complete IT Store.
            <br />
            <span className="font-normal text-muted-foreground">
              Serving customers since 2011.
            </span>
          </p>
        </FadeContent>
        <FadeContent
          delay={120}
          className="rounded-3xl border border-border bg-card p-7 md:p-9"
        >
          <p className="text-[10px] font-semibold tracking-[.17em] text-primary">
            OUR JOURNEY
          </p>
          <ol className="relative mt-7 space-y-8 border-l-2 border-primary/20 pl-7">
            {[
              [
                "2011",
                "IT HUB Founded",
                "Started with IT products, sales, and technical services.",
              ],
              [
                "2016",
                "Mobile Technology",
                "Expanded into mobile phone sales and accessories.",
              ],
              [
                "2026",
                "Software & Digital Solutions",
                "Entered the software development field, offering websites, web applications, and custom software solutions.",
              ],
            ].map(([year, title, text]) => (
              <li key={year} className="relative">
                <span className="absolute -left-[37px] top-1 h-4 w-4 rounded-full border-4 border-card bg-primary ring-2 ring-primary/30" />
                <p className="font-display text-2xl font-bold text-primary">
                  {year}
                </p>
                <h3 className="mt-1 text-base font-semibold">{title}</h3>
                <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
                  {text}
                </p>
              </li>
            ))}
          </ol>
        </FadeContent>
      </div>
      <FadeContent className="mb-14 grid items-center gap-10 overflow-hidden rounded-[2rem] bg-[#0c2f8a] p-6 text-white md:grid-cols-[1fr_1.1fr] md:p-12">
        <div className="order-2 md:order-1">
          <p className="text-[10px] font-semibold tracking-[.17em] text-blue-300">
            RECOGNITION
          </p>
          <h2 className="mt-4 text-3xl font-bold leading-tight tracking-[-.02em] md:text-4xl">
            Official Intel<sup className="text-lg">®</sup> Partner Alliance
            Member.
          </h2>
          <p className="mt-5 text-sm leading-7 text-blue-100">
            This recognition reflects our commitment to delivering genuine
            Intel-powered products, trusted technology solutions, and
            exceptional customer service. Thank you to our valued customers for
            your continued trust and support.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            {[
              "Trusted Technology",
              "Genuine Products",
              "Exceptional Service",
            ].map((t) => (
              <span
                key={t}
                className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
        <img
          src="/images/about-store.png"
          alt="IT HUB founder holding the Intel Partner Alliance membership certificate"
          loading="lazy"
          className="order-1 w-full rounded-2xl shadow-md  md:order-2"
        />
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
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              {text}
            </p>
            <ArrowRight className="mt-5 text-primary" size={17} />
          </Link>
        ))}
      </div>
      <div className="my-12 rounded-lg bg-secondary p-8 text-center">
        <p className="flex items-center justify-center text-xl text-amber-500">
          <Stars size={22} />{" "}
          <span className="ml-2 font-bold text-foreground">4.8/5</span>
        </p>
        <h3 className="mt-4 text-xl font-bold">Trusted by local customers.</h3>
        <p className="mt-3 text-sm text-muted-foreground">
          Technology products, service support and local assistance.
        </p>
        <p className="mt-3 text-[10px] text-muted-foreground">
          Customer rating · supplied static prototype value · no live review
          integration
        </p>
      </div>
      <div className="grid items-center gap-8 md:grid-cols-2">
        <div>
          <h2 className="text-3xl font-bold">Your neighbourhood tech hub.</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            Visit IT HUB in Kothamangalam, Kerala. Contact the store for
            verified directions, contact details and service availability.
          </p>
          <ActionLink secondary to="/contact" className="mt-5">
            Contact IT HUB <ArrowRight size={15} />
          </ActionLink>
        </div>
        <LocationCard />
      </div>
    </Page>
  )
}
export function Contact() {
  const store = useStore()
  const [info, setInfo] = useState("")
  const [form, setForm] = useState({
    name: "",
    email: "",
    type: "Product enquiry",
    message: "",
  })
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
            text: "Contact details available through IT HUB",
          },
          {
            name: "WhatsApp",
            Icon: WhatsAppIcon,
            text: "Ask the store for its verified WhatsApp number",
          },
          {
            name: "Visit our store",
            Icon: MapPin,
            text: "Kothamangalam, Kerala, India",
          },
          {
            name: "Service enquiry",
            Icon: Wrench,
            text: "Tell us what your device needs",
          },
        ].map(({ name, Icon, text }) => (
          <button
            key={name}
            onClick={() =>
              name === "Service enquiry"
                ? setInfo("Service enquiries")
                : setInfo(name)
            }
            className="rounded-lg border border-border p-6 text-left transition hover:border-primary/40"
          >
            <Icon size={24} className="text-primary" />
            <h2 className="mt-5 text-lg font-bold">{name}</h2>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              {text}
            </p>
            <ArrowUpRight size={16} className="mt-5 text-primary" />
          </button>
        ))}
      </div>
      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="mb-5 text-2xl font-bold">Find your way to our hub.</h2>
          <LocationCard />
          <p className="mt-4 text-xs leading-6 text-muted-foreground">
            MA College / Kothamangalam area. Confirm the exact address and store
            hours with IT HUB.
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
            event.preventDefault()
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
            }))
            setForm({
              name: "",
              email: "",
              type: "Product enquiry",
              message: "",
            })
            store.notify("Demo enquiry saved. No message was sent.")
          }}
          className="space-y-5 rounded-lg border border-border p-7"
        >
          <h2 className="text-2xl font-bold">Start a conversation.</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name">
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                className={fieldClass}
              />
            </Field>
            <Field label="Email">
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
                className={fieldClass}
              />
            </Field>
          </div>
          <Field label="Enquiry type">
            <select
              value={form.type}
              onChange={(event) =>
                setForm({ ...form, type: event.target.value })
              }
              className={fieldClass}
            >
              {["Product enquiry", "Service enquiry", "Custom PC", "Other"].map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
          </Field>
          <Field label="What can we help with?">
            <textarea
              required
              minLength={10}
              rows={4}
              value={form.message}
              onChange={(event) =>
                setForm({ ...form, message: event.target.value })
              }
              className={fieldClass}
            />
          </Field>
          <Button type="submit">
            Save demo enquiry <ArrowRight size={15} />
          </Button>
          <p className="text-[10px] leading-5 text-muted-foreground">
            Frontend demonstration only. No email or message is sent. Use the
            business listing to contact IT HUB directly.
          </p>
        </form>
      </div>
      <Modal
        open={Boolean(info)}
        onOpenChange={(open) => {
          if (!open) setInfo("")
        }}
        title={info}
      >
        <p className="text-sm leading-7 text-muted-foreground">
          Verified contact details and store hours have not been supplied.
          Please visit the supplied business listing to reach IT HUB in
          Kothamangalam, Kerala.
        </p>
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
  )
}
