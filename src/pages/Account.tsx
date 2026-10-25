import { useState, useEffect } from "react";
import { Link, NavLink, useParams } from "react-router";
import {
  LayoutGrid,
  ShoppingBag,
  Wrench,
  Cpu,
  Heart,
  ShieldCheck,
  MapPin,
  Bell,
  LifeBuoy,
  Settings,
  ArrowUpRight,
  UserRound,
  Tag,
  BadgeCheck,
  Smartphone,
  BadgeIndianRupee,
  RefreshCw,
} from "lucide-react";
import AuthModal from "../components/AuthModal";
import WarrantyCheck from "../components/WarrantyCheck";
import { useStore } from "../app/store";
import { track } from "../lib/analytics";
import {
  images,
  money,
  orderStatuses,
  serviceStatuses,
  formatDate,
  type Build,
} from "../data/catalog";
import { fetchUserSellRequests } from "../lib/sellRequests";
import { updateCustomerProfile } from "../lib/auth";
import WhatsAppIcon from "../components/WhatsAppIcon";
import ProductCard from "../components/ProductCard";
import {
  ActionLink,
  Badge,
  Button,
  Empty,
  Field,
  Logo,
  Modal,
  Page,
  PageHeading,
  fieldClass,
} from "../components/ui";

const sections = [
  { id: "overview", name: "Overview", Icon: LayoutGrid },
  { id: "profile", name: "My Profile", Icon: UserRound },
  { id: "orders", name: "Orders", Icon: ShoppingBag },
  { id: "sell-requests", name: "Sell & Trade-In", Icon: BadgeIndianRupee },
  { id: "services", name: "Services", Icon: Wrench },
  { id: "builds", name: "PC Builds", Icon: Cpu },
  { id: "wishlist", name: "Wishlist", Icon: Heart },
  { id: "offers", name: "My Offers", Icon: Tag },
  { id: "warranty", name: "Warranty", Icon: ShieldCheck },
  { id: "addresses", name: "Addresses", Icon: MapPin },
  { id: "notifications", name: "Notifications", Icon: Bell },
  { id: "support", name: "After-sales Support", Icon: LifeBuoy },
  { id: "settings", name: "Settings", Icon: Settings },
];

const sellStatusTones: Record<string, "amber" | "blue" | "green" | "red" | "gray"> = {
  Pending: "amber",
  "Under Review": "blue",
  Contacted: "blue",
  Approved: "green",
  Rejected: "red",
  Completed: "gray",
};

export default function Account() {
  const { section = "overview" } = useParams();
  const store = useStore();
  const [login, setLogin] = useState(false);
  const [profile, setProfile] = useState(store.profile);
  const [warranty, setWarranty] = useState<string | null>(null);
  const [ticket, setTicket] = useState({ subject: "", message: "" });
  const [auth, setAuth] = useState(false);

  useEffect(() => {
    if (store.loggedIn) {
      fetchUserSellRequests()
        .then((supabaseRequests) => {
          if (supabaseRequests && supabaseRequests.length > 0) {
            store.set((prev) => {
              const existingIds = new Set(prev.sellRequests.map((r) => r.id));
              const newOnes = supabaseRequests.filter((r) => !existingIds.has(r.id));
              if (newOnes.length > 0) {
                return { sellRequests: [...newOnes, ...prev.sellRequests] };
              }
              return prev;
            });
          }
        })
        .catch(() => {
          // Gracefully fallback to local store
        });
    }
  }, [store.loggedIn]);
  const products = store.wishlist
    .map((id) => store.products.find((item) => item.id === id))
    .filter((item) => !!item);
  const warranties = store.orders.flatMap((order) =>
    order.items
      .filter((item) => item.productId)
      .map((item) => {
        const term =
          store.products.find((product) => product.id === item.productId)?.specs.Warranty ||
          "Contact IT HUB";
        const years = term.match(/^(\d+) years?$/i);
        const expiryDate = new Date(order.date);
        if (years) expiryDate.setFullYear(expiryDate.getFullYear() + Number(years[1]));
        return {
          id: `${order.id}-${item.id}`,
          name: item.name,
          date: new Date(order.date).toLocaleDateString(),
          term,
          expiry: years ? expiryDate.toLocaleDateString() : "Confirm with IT HUB",
          order: order.id,
        };
      }),
  );
  if (!store.loggedIn)
    return (
      <Page>
        <div className="mx-auto max-w-lg rounded-3xl border border-border bg-card p-8 text-center md:p-12">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary">
            <Smartphone size={26} />
          </div>
          <h1 className="mt-6 text-3xl font-bold tracking-[-.02em]">Login to your IT HUB</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Sign in with your +91 mobile number to manage your profile, orders, offers, warranty and
            after-sales support.
          </p>
          <Button onClick={() => setAuth(true)} className="mt-7 w-full">
            Login / Sign up with OTP
          </Button>
        </div>
        <AuthModal open={auth} onOpenChange={setAuth} />
      </Page>
    );
  return (
    <Page>
      <PageHeading
        title="Your IT HUB."
        description="Your technology, orders, services and saved ideas. All in one place."
      >
        <Button
          variant="secondary"
          onClick={() => {
            setProfile(store.profile);
            setLogin(true);
          }}
        >
          <UserRound size={16} />
          {store.profile.name ? "Edit profile" : "Complete your profile"}
        </Button>
      </PageHeading>
      <div className="grid gap-8 lg:grid-cols-[210px_1fr]">
        <aside className="min-w-0 self-start rounded-lg border border-border bg-white p-4">
          <div className="mb-4 hidden border-b border-border pb-5 lg:block">
            <Logo />
            <p className="mt-3 text-sm font-bold">{store.profile.name || "Welcome to IT HUB"}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <BadgeCheck size={12} className="text-primary" /> {store.profile.phone}
              </span>
            </p>
          </div>
          <nav className="flex gap-1 overflow-x-auto lg:flex-col">
            {sections.map(({ id, name, Icon }) => (
              <NavLink
                key={id}
                to={id === "overview" ? "/account" : `/account/${id}`}
                end
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-3 rounded-md px-3 py-3 text-xs ${
                    isActive
                      ? "bg-secondary font-semibold text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  }`
                }
              >
                <Icon size={16} />
                {name}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          {section === "overview" && (
            <>
              <h2 className="mb-6 text-2xl font-bold">
                {store.profile.name
                  ? `Hello, ${store.profile.name.split(" ")[0]}.`
                  : "Hello, technology enthusiast."}
              </h2>
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                {[
                  {
                    name: "Active orders",
                    count: store.orders.filter((order) => order.status < 6).length,
                    to: "orders",
                    Icon: ShoppingBag,
                  },
                  {
                    name: "Active services",
                    count: store.requests.filter((request) => request.status < 9).length,
                    to: "services",
                    Icon: Wrench,
                  },
                  {
                    name: "Saved builds",
                    count: store.builds.length,
                    to: "builds",
                    Icon: Cpu,
                  },
                  {
                    name: "Sell requests",
                    count: store.sellRequests.length,
                    to: "sell-requests",
                    Icon: BadgeIndianRupee,
                  },
                  {
                    name: "Warranty items",
                    count: warranties.length,
                    to: "warranty",
                    Icon: ShieldCheck,
                  },
                ].map(({ name, count, to, Icon }) => (
                  <Link
                    to={`/account/${to}`}
                    key={name}
                    className="rounded-lg border border-border p-5 transition hover:border-primary/40"
                  >
                    <Icon size={21} className="mb-5 text-primary" />
                    <strong className="text-3xl">{count}</strong>
                    <p className="mt-2 text-xs text-muted-foreground">{name}</p>
                  </Link>
                ))}
              </div>
              <div className="mt-7 rounded-lg bg-[#0c2f8a] p-7 text-white">
                <p className="mb-3 text-[10px] tracking-widest text-blue-300">YOUR NEXT PROJECT</p>
                <h3 className="text-2xl font-bold">Make it your own.</h3>
                <p className="mt-3 text-xs leading-6 text-blue-100">
                  Configure a custom PC, check compatibility and save your ideal setup.
                </p>
                <ActionLink to="/pc-builder" className="mt-5">
                  Start a build <ArrowUpRight size={15} />
                </ActionLink>
              </div>
              <h3 className="mb-4 mt-8 text-lg font-bold">Recent activity</h3>
              {store.notifications.length ? (
                <div className="space-y-3">
                  {store.notifications.slice(0, 5).map((notification, index) => (
                    <p key={index} className="rounded-md border border-border p-4 text-xs">
                      {notification}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Your purchases, service requests and builds will appear here.
                </p>
              )}
            </>
          )}
          {section === "profile" && (
            <div className="rounded-3xl border border-border bg-card p-6 md:p-8">
              <div className="flex flex-wrap items-center gap-5">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-white">
                  {(store.profile.name || "U").charAt(0).toUpperCase()}
                </span>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold">{store.profile.name || "Add your name"}</h2>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <BadgeCheck size={15} className="text-primary" /> {store.profile.phone} ·
                    verified
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setProfile(store.profile);
                    setLogin(true);
                  }}
                >
                  Edit profile
                </Button>
              </div>
              <dl className="mt-8 grid gap-4 sm:grid-cols-2">
                {[
                  ["Full name", store.profile.name],
                  ["Mobile", store.profile.phone],
                  ["Email", store.profile.email],
                  ["Address", store.profile.address],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-muted p-4">
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-1.5 text-sm font-medium">{value || "Not added yet"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {section === "offers" && (
            <div className="grid gap-4 md:grid-cols-2">
              {store.offers
                .filter((offer) => offer.active)
                .map((offer) => (
                  <article
                    key={offer.id}
                    className="relative overflow-hidden rounded-3xl border border-border bg-card p-6"
                  >
                    <Badge>MEMBER OFFER</Badge>
                    <h3 className="mt-4 text-xl font-bold">{offer.name}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{offer.description}</p>
                    <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-primary/40 bg-secondary px-4 py-3">
                      <code className="text-sm font-bold tracking-widest text-primary">
                        ITHUB
                        {offer.id.replace(/\W/g, "").slice(-4).toUpperCase()}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard?.writeText(
                            `ITHUB${offer.id.replace(/\W/g, "").slice(-4).toUpperCase()}`,
                          );
                          store.notify("Offer code copied");
                        }}
                        className="text-xs font-semibold text-primary"
                      >
                        Copy code
                      </button>
                    </div>
                  </article>
                ))}
              <Link
                to="/offers"
                className="flex items-center justify-center rounded-3xl border border-dashed border-border p-6 text-sm font-semibold text-primary"
              >
                See all store offers <ArrowUpRight size={16} />
              </Link>
            </div>
          )}
          {section === "orders" && (
            <>
              <h2 className="mb-6 text-2xl font-bold">Your orders</h2>
              {store.orders.length ? (
                <div className="space-y-4">
                  {store.orders.map((order) => (
                    <div key={order.id} className="rounded-lg border border-border p-6">
                      <div className="flex flex-wrap justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold">{order.id}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {new Date(order.date).toLocaleDateString()} · {order.items.length} items
                          </p>
                        </div>
                        <Badge tone={order.status === 6 ? "green" : "blue"}>
                          {order.status < 0 ? "Cancelled" : orderStatuses[order.status]}
                        </Badge>
                      </div>
                      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                        <strong>{money(order.total)}</strong>
                        <Link
                          to={`/track-order/${order.id}`}
                          className="text-xs font-semibold text-primary"
                        >
                          Track order →
                        </Link>
                      </div>
                      <div className="mt-4 space-y-2 border-t border-border pt-4">
                        {order.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex flex-wrap items-center justify-between gap-2 text-xs"
                          >
                            <span className="text-muted-foreground">
                              {item.name} × {item.quantity}
                            </span>
                            <Link
                              to={`/support?view=warranty&order=${order.id}&product=${item.id}`}
                              className="rounded-full bg-secondary px-3 py-1.5 font-semibold text-primary hover:bg-primary hover:text-white"
                            >
                              Help & Support
                            </Link>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  title="No orders yet"
                  description="Your technology journey starts here."
                  to="/products"
                  label="Shop products"
                />
              )}
            </>
          )}
          {section === "sell-requests" && (
            <>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">Sell & Trade-In Requests</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Track your gadget buyback evaluations, valuation offers, and trade-in status.
                  </p>
                </div>
                <ActionLink to="/sell" className="shrink-0">
                  <BadgeIndianRupee size={15} /> Sell Another Device
                </ActionLink>
              </div>

              {store.sellRequests.length ? (
                <div className="space-y-4">
                  {store.sellRequests.map((req) => {
                    const waMessage = encodeURIComponent(
                      `Hello IT HUB, I am inquiring about my device valuation for Sell Request ${req.id} (${req.productName}).`,
                    );
                    const waUrl = `https://wa.me/${store.settings.whatsapp || "919876543210"}?text=${waMessage}`;

                    return (
                      <div
                        key={req.id}
                        className="rounded-2xl border border-border bg-card p-5 sm:p-6 transition hover:border-primary/30"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                                {req.id}
                              </span>
                              <Badge tone={sellStatusTones[req.status] || "gray"}>
                                {req.status}
                              </Badge>
                              <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                                {req.condition}
                              </span>
                              <span className="rounded bg-secondary px-2 py-0.5 text-[11px] font-medium text-primary">
                                {req.category}
                              </span>
                            </div>
                            <h3 className="text-lg font-bold text-foreground pt-1">
                              {req.productName}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                              Submitted on {formatDate(req.submittedAt)}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                            >
                              <WhatsAppIcon size={14} />
                              Chat Support
                            </a>
                          </div>
                        </div>

                        {/* Valuation & Pricing Comparison */}
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 rounded-xl bg-muted/40 p-3.5 text-xs">
                          <div>
                            <span className="text-muted-foreground">Your Asking Price:</span>
                            <p className="mt-0.5 font-bold text-foreground">
                              {req.expectedPrice
                                ? money(req.expectedPrice)
                                : "Open for IT HUB quote"}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">IT HUB Valuation Offer:</span>
                            {req.offeredPrice ? (
                              <p className="mt-0.5 font-bold text-emerald-700 flex items-center gap-1">
                                <BadgeCheck size={14} className="text-emerald-600" />
                                {money(req.offeredPrice)}
                                <span className="text-[10px] font-normal text-emerald-600">
                                  (Ready for payout)
                                </span>
                              </p>
                            ) : (
                              <p className="mt-0.5 font-medium text-amber-700 flex items-center gap-1">
                                <RefreshCw size={12} className="animate-spin text-amber-600" />
                                Evaluation in progress by IT HUB technician
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Warranty & Extra Details */}
                        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                          <div className="text-muted-foreground">
                            Warranty:{" "}
                            <span className="font-medium text-foreground">
                              {req.hasWarranty
                                ? `Active (${req.warrantyRemaining || "Valid warranty"}) · ${req.warrantyProvider || "Brand"}`
                                : "No warranty / Expired"}
                            </span>
                          </div>
                          {req.imagePaths && req.imagePaths.length > 0 && (
                            <div className="text-muted-foreground flex items-center gap-1.5">
                              Attached photos:{" "}
                              <span className="font-medium text-foreground">
                                {req.imagePaths.length} photo(s)
                              </span>
                              {req.invoicePath && (
                                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                  BILL ATTACHED
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Admin Notes / Instructions Callout */}
                        {req.adminNotes && (
                          <div className="mt-3.5 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
                            <span className="font-semibold text-primary">IT HUB Note:</span>{" "}
                            <span className="text-foreground">{req.adminNotes}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Empty
                  title="No sell or trade-in requests"
                  description="Upgrade your tech with IT HUB! Turn your used laptops, PCs, iPhones, and GPUs into instant cash or store credit."
                  to="/sell"
                  label="Sell your device"
                />
              )}
            </>
          )}
          {section === "services" && (
            <>
              <h2 className="mb-6 text-2xl font-bold">Your service requests</h2>
              {store.requests.length ? (
                <div className="space-y-4">
                  {store.requests.map((request) => (
                    <div key={request.id} className="rounded-lg border border-border p-6">
                      <div className="flex flex-wrap justify-between gap-3">
                        <div>
                          <h3 className="font-bold">{request.model}</h3>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {request.id} · {request.problem}
                          </p>
                        </div>
                        <Badge>{serviceStatuses[request.status]}</Badge>
                      </div>
                      <div className="mt-5 flex justify-between text-xs">
                        <p className="text-muted-foreground">{request.method}</p>
                        <Link
                          to={`/track-service/${request.id}`}
                          className="font-semibold text-primary"
                        >
                          Track service / view quote →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  title="No service requests"
                  description="Need help with your device? We’re here."
                  to="/services/book"
                  label="Book a service"
                />
              )}
            </>
          )}
          {section === "builds" && <PcBuilds />}
          {section === "wishlist" && (
            <>
              <h2 className="mb-6 text-2xl font-bold">Worth keeping an eye on.</h2>
              {products.length ? (
                <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                  {products.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              ) : (
                <Empty
                  title="Your wishlist is waiting"
                  description="Tap the heart on any product to keep it here."
                  to="/products"
                />
              )}
            </>
          )}
          {section === "warranty" && (
            <>
              <h2 className="mb-6 text-2xl font-bold">Peace of mind, organised.</h2>
              <WarrantyCheck source="Account warranty" className="mb-6" />
              <p className="mb-6 text-xs leading-6 text-muted-foreground">
                Warranty coverage is based on demo product data. Manufacturer terms apply; confirm
                coverage with IT HUB.
              </p>
              {warranties.length ? (
                <div className="space-y-4">
                  {warranties.map((item) => (
                    <div key={item.id} className="rounded-lg border border-border p-6">
                      <div className="flex flex-wrap justify-between gap-3">
                        <h3 className="font-bold">{item.name}</h3>
                        <Badge tone="green">ACTIVE · DEMO</Badge>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Purchase: {item.date} · Warranty: {item.term} · Expiry: {item.expiry}
                      </p>
                      <div className="mt-5 flex gap-3">
                        <Button variant="secondary" onClick={() => setWarranty(item.id)}>
                          View warranty
                        </Button>
                        <ActionLink to="/services/book">Request service</ActionLink>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  title="No warranty items yet"
                  description="Products from your demo orders will appear here."
                  to="/products"
                />
              )}
              <div className="mt-6 rounded-md bg-muted p-5 text-xs leading-6">
                <Badge tone="gray">SPECIFICATION SAMPLE</Badge>
                <p className="mt-3 font-semibold">ASUS RTX 5070 · 3-year warranty</p>
                <p className="text-muted-foreground">
                  Purchase: 12 Aug 2026 · Expiry: 12 Aug 2029 · Active (illustrative record, not
                  your purchase)
                </p>
              </div>
            </>
          )}
          {section === "addresses" && (
            <>
              <h2 className="mb-6 text-2xl font-bold">Your addresses</h2>
              {store.profile.address ? (
                <div className="rounded-lg border border-border p-6">
                  <Badge>DEFAULT ADDRESS</Badge>
                  <p className="mt-4 font-bold">{store.profile.name}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{store.profile.address}</p>
                  <p className="mt-2 text-xs">{store.profile.phone}</p>
                  <div className="mt-5 flex gap-4">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setProfile(store.profile);
                        setLogin(true);
                      }}
                    >
                      Edit address
                    </Button>
                    <button
                      className="text-xs text-red-600"
                      onClick={() => {
                        store.set({
                          profile: { ...store.profile, address: "" },
                        });
                        store.notify("Address removed");
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <Empty
                    title="No address saved"
                    description="Add an address to make your next checkout easier."
                  />
                  <Button
                    className="mt-5"
                    onClick={() => {
                      setProfile(store.profile);
                      setLogin(true);
                    }}
                  >
                    Add address
                  </Button>
                </>
              )}
            </>
          )}
          {section === "notifications" && (
            <>
              <div className="mb-6 flex justify-between">
                <h2 className="text-2xl font-bold">Your updates</h2>
                <button
                  className="text-xs text-primary"
                  onClick={() => {
                    store.set({ notifications: [] });
                    store.notify("Notifications cleared");
                  }}
                >
                  Clear all
                </button>
              </div>
              {store.notifications.length ? (
                <div className="space-y-3">
                  {store.notifications.map((notification, index) => (
                    <div
                      key={index}
                      className="flex gap-3 rounded-md border border-border p-5 text-sm"
                    >
                      <Bell size={18} className="shrink-0 text-primary" />
                      {notification}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  title="You’re all caught up"
                  description="Order and service updates will appear here."
                />
              )}
            </>
          )}
          {section === "support" && (
            <>
              <h2 className="mb-3 text-2xl font-bold">A little help goes a long way.</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                Send a demo support request or contact IT HUB directly.
              </p>
              <Link
                to="/support"
                className="mb-6 flex items-center justify-between rounded-xl border border-primary/20 bg-secondary p-5 text-sm font-semibold text-primary"
              >
                Open the Help &amp; Support centre — brand warranty contacts, service and on-site
                service
                <span>→</span>
              </Link>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  store.set((previous) => ({
                    tickets: [
                      {
                        ...ticket,
                        id: `SUP-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
                        status: "Open",
                      },
                      ...previous.tickets,
                    ],
                  }));
                  setTicket({ subject: "", message: "" });
                  store.notify("Demo support request submitted");
                }}
                className="space-y-5 rounded-lg border border-border p-6"
              >
                <Field label="Subject">
                  <input
                    required
                    minLength={3}
                    value={ticket.subject}
                    onChange={(event) => setTicket({ ...ticket, subject: event.target.value })}
                    className={fieldClass}
                  />
                </Field>
                <Field label="How can we help?">
                  <textarea
                    required
                    minLength={10}
                    value={ticket.message}
                    onChange={(event) => setTicket({ ...ticket, message: event.target.value })}
                    className={fieldClass}
                    rows={4}
                  />
                </Field>
                <Button type="submit">Submit demo request</Button>
                <p className="text-[10px] text-muted-foreground">
                  Saved in this browser only. No message is sent to IT HUB.
                </p>
              </form>
              <div className="mt-6 space-y-3">
                {store.tickets.map((item) => (
                  <div key={item.id} className="flex justify-between gap-3 rounded-md bg-muted p-4">
                    <div>
                      <p className="text-sm font-semibold">{item.subject}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.id}</p>
                    </div>
                    <Badge>{item.status}</Badge>
                  </div>
                ))}
              </div>
              <ActionLink secondary to="/contact" className="mt-5">
                Contact IT HUB
              </ActionLink>
            </>
          )}
          {section === "settings" && (
            <>
              <h2 className="mb-6 text-2xl font-bold">Account settings</h2>
              <form
                className="space-y-5 rounded-lg border border-border p-6"
                onSubmit={(event) => {
                  event.preventDefault();
                  store.set({ profile });
                  store.notify("Profile updated locally");
                }}
              >
                <Field label="Name">
                  <input
                    required
                    value={profile.name}
                    onChange={(event) => setProfile({ ...profile, name: event.target.value })}
                    className={fieldClass}
                  />
                </Field>
                <Field label="Email">
                  <input
                    required
                    type="email"
                    value={profile.email}
                    onChange={(event) => setProfile({ ...profile, email: event.target.value })}
                    className={fieldClass}
                  />
                </Field>
                <Field label="Phone">
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
                    className={fieldClass}
                  />
                </Field>
                <Button type="submit">Save settings</Button>
                <p className="text-xs text-muted-foreground">
                  Demo profile only. There are no passwords or real authentication.
                </p>
              </form>
            </>
          )}
          {!sections.some((item) => item.id === section) && (
            <Empty
              title="Account section not found"
              description="Use the account menu to find what you need."
              to="/account"
              label="Back to overview"
            />
          )}
        </div>
      </div>
      <Modal
        open={login}
        onOpenChange={setLogin}
        title="Make yourself at home."
        description="Keep your details up to date for faster checkout and service bookings."
      >
        <div className="mb-5 flex justify-center">
          <Logo />
        </div>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            store.set({ profile });
            setLogin(false);
            try {
              const res = await updateCustomerProfile({
                fullName: profile.name,
                email: profile.email,
                address: profile.address,
                phone: profile.phone,
              });
              if (res.ok) {
                store.notify("Profile saved to database");
              } else {
                store.notify("Profile saved locally");
              }
            } catch {
              store.notify("Profile saved locally");
            }
          }}
          className="space-y-5"
        >
          <Field label="Full name">
            <input
              required
              minLength={2}
              value={profile.name}
              onChange={(event) => setProfile({ ...profile, name: event.target.value })}
              className={fieldClass}
            />
          </Field>
          <Field label="Email">
            <input
              required
              type="email"
              value={profile.email}
              onChange={(event) => setProfile({ ...profile, email: event.target.value })}
              className={fieldClass}
            />
          </Field>
          <Field label="Mobile (verified)">
            <input
              type="tel"
              readOnly
              value={profile.phone}
              onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
              className={fieldClass}
            />
          </Field>
          <Field label="Address (optional)">
            <textarea
              value={profile.address}
              onChange={(event) => setProfile({ ...profile, address: event.target.value })}
              className={fieldClass}
            />
          </Field>
          <Button type="submit" className="w-full">
            Save profile
          </Button>
        </form>
      </Modal>
      <Modal
        open={Boolean(warranty)}
        onOpenChange={(open) => {
          if (!open) setWarranty(null);
        }}
        title="Your warranty record"
      >
        <div className="space-y-4">
          {warranties
            .filter((item) => item.id === warranty)
            .map((item) => (
              <div key={item.id}>
                <h3 className="text-xl font-bold">{item.name}</h3>
                <p className="mt-4 text-sm">Purchase date: {item.date}</p>
                <p className="mt-2 text-sm">Warranty: {item.term}</p>
                <p className="mt-2 text-sm">Expiry (demo): {item.expiry}</p>
                <p className="mt-2 text-sm">Order: {item.order}</p>
                <p className="mt-4 rounded-md bg-muted p-4 text-xs leading-6 text-muted-foreground">
                  This is a prototype warranty record. Contact IT HUB for expiry dates, terms, proof
                  of purchase and actual claim eligibility.
                </p>
                <ActionLink to="/services/book" className="mt-5">
                  Request service
                </ActionLink>
              </div>
            ))}
        </div>
      </Modal>
    </Page>
  );
}

const buildPartOrder = ["CPU", "GPU", "Motherboard", "RAM", "Storage", "PSU", "Cooler", "Cabinet"];
const buildPartName = (build: Build, type: string) =>
  build.owned?.includes(type)
    ? "Already owned"
    : build.parts[type]?.name || (type === "GPU" ? "Integrated graphics" : "—");
function PcBuilds() {
  const store = useStore();
  const [renaming, setRenaming] = useState("");
  const [draft, setDraft] = useState("");
  const [compare, setCompare] = useState<string[]>([]);
  const [viewing, setViewing] = useState<Build | null>(null);
  const assembly = store.assemblyCharge || 0;
  const compared = compare
    .map((id) => store.builds.find((build) => build.id === id))
    .filter((build): build is Build => Boolean(build));
  const toggleCompare = (id: string) =>
    setCompare((previous) =>
      previous.includes(id)
        ? previous.filter((value) => value !== id)
        : [...previous, id].slice(-2),
    );
  const rename = (id: string) => {
    const name = draft.trim();
    if (name)
      store.set((previous) => ({
        builds: previous.builds.map((build) => (build.id === id ? { ...build, name } : build)),
      }));
    setRenaming("");
    store.notify("Build renamed");
  };
  const contact = (build: Build) => {
    const message = [
      "Hello IT HUB,",
      "I would like to enquire about the following PC build:",
      `Build:\n${build.name}`,
      ...["CPU", "GPU", "RAM", "Storage", "Motherboard", "PSU", "Cabinet", "Cooler"].map(
        (type) => `${type === "Cooler" ? "CPU Cooler" : type}:\n${buildPartName(build, type)}`,
      ),
      `Estimated Price:\n${money(build.price + assembly)}`,
      "Please confirm availability and provide the final quotation.",
    ].join("\n\n");
    store.log(`PC enquiry sent via WhatsApp: ${build.name}`);
    track("Contact/WhatsApp Action", { context: "Saved PC build" });
    window.open(
      `https://wa.me/${store.settings.whatsapp}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };
  if (!store.builds.length)
    return (
      <>
        <h2 className="mb-6 text-2xl font-bold">PC Builds</h2>
        <Empty
          title="No saved PC builds"
          description="Find the right PC for your needs and budget, then save it here."
          to="/pc-builder"
          label="Find My PC"
        />
      </>
    );
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">PC Builds</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Select two builds to compare them side by side.
          </p>
        </div>
        <ActionLink secondary to="/pc-builder" className="px-4 py-2 text-xs">
          New build <ArrowUpRight size={14} />
        </ActionLink>
      </div>
      {compared.length === 2 && (
        <div className="mb-6 rounded-2xl border border-primary/30 bg-secondary/40 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold">Compare builds</h3>
            <button className="text-xs text-primary" onClick={() => setCompare([])}>
              Clear
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {compared.map((build) => (
              <div key={build.id} className="min-w-0 rounded-xl bg-white p-3">
                <p className="truncate text-sm font-bold">{build.name}</p>
                <p className="mt-1 font-semibold text-primary">{money(build.price + assembly)}</p>
                {build.designedFor && (
                  <p className="mt-1 text-muted-foreground">For {build.designedFor}</p>
                )}
              </div>
            ))}
            {buildPartOrder.map((type) =>
              compared.map((build) => {
                const differs =
                  buildPartName(compared[0], type) !== buildPartName(compared[1], type);
                return (
                  <div
                    key={`${type}-${build.id}`}
                    className={`min-w-0 rounded-lg px-3 py-2 ${
                      differs ? "bg-amber-50" : "bg-white"
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {type === "Cooler" ? "CPU Cooler" : type}
                    </p>
                    <p className="mt-0.5 break-words font-medium">{buildPartName(build, type)}</p>
                    {build.parts[type] && !build.owned?.includes(type) && (
                      <p className="text-muted-foreground">{money(build.parts[type].price)}</p>
                    )}
                  </div>
                );
              }),
            )}
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground">
            Highlighted rows differ between builds.
          </p>
        </div>
      )}
      <div className="space-y-4">
        {store.builds.map((build) => (
          <div key={build.id} className="rounded-2xl border border-border p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {renaming === build.id ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      rename(build.id);
                    }}
                  >
                    <input
                      autoFocus
                      aria-label="Build name"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      className={`${fieldClass} py-2`}
                    />
                    <Button type="submit" className="px-4 py-2 text-xs">
                      Save
                    </Button>
                  </form>
                ) : (
                  <h3 className="font-bold">{build.name}</h3>
                )}
                {build.designedFor && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Designed for {build.designedFor}
                  </p>
                )}
              </div>
              <strong className="text-primary">{money(build.price + assembly)}</strong>
            </div>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              {buildPartOrder
                .filter((type) => build.parts[type])
                .map((type) => build.parts[type].name)
                .join(" · ")}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                className="px-4 py-2 text-xs"
                onClick={() => setViewing(build)}
              >
                View
              </Button>
              <ActionLink
                secondary
                to={`/pc-builder?build=${build.id}`}
                className="px-4 py-2 text-xs"
              >
                Customize
              </ActionLink>
              <button
                onClick={() => contact(build)}
                className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-xs font-semibold text-white hover:brightness-95"
              >
                <WhatsAppIcon size={14} /> Contact IT HUB
              </button>
              <Button
                variant="secondary"
                className="px-4 py-2 text-xs"
                onClick={() =>
                  store.addCart({
                    id: build.id,
                    name: build.name,
                    price: build.price,
                    image: images.pc,
                    build,
                  })
                }
              >
                Add to cart
              </Button>
              <label className="ml-1 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={compare.includes(build.id)}
                  onChange={() => toggleCompare(build.id)}
                  className="accent-[#1a4fd6]"
                />
                Compare
              </label>
              <button
                className="text-xs text-primary"
                onClick={() => {
                  setRenaming(build.id);
                  setDraft(build.name);
                }}
              >
                Rename
              </button>
              <button
                className="text-xs text-red-600"
                onClick={() => {
                  store.set({
                    builds: store.builds.filter((item) => item.id !== build.id),
                  });
                  setCompare(compare.filter((id) => id !== build.id));
                  store.notify("Build removed");
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      <Modal
        open={Boolean(viewing)}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing?.name || "PC build"}
        description={
          viewing?.designedFor
            ? `Designed for ${viewing.designedFor}`
            : "Your saved PC configuration."
        }
      >
        {viewing && (
          <>
            <div className="space-y-2 rounded-xl bg-muted p-4 text-xs">
              {buildPartOrder
                .filter((type) => viewing.parts[type] || viewing.owned?.includes(type))
                .map((type) => (
                  <p key={type} className="flex justify-between gap-3">
                    <span>
                      <span className="text-muted-foreground">
                        {type === "Cooler" ? "CPU Cooler" : type}:
                      </span>{" "}
                      {buildPartName(viewing, type)}
                    </span>
                    {viewing.parts[type] && !viewing.owned?.includes(type) && (
                      <strong className="shrink-0">{money(viewing.parts[type].price)}</strong>
                    )}
                  </p>
                ))}
              <p className="flex justify-between gap-3 border-t border-border pt-2">
                <span className="text-muted-foreground">Assembly / Service</span>
                <strong>{assembly ? money(assembly) : "Free"}</strong>
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm">Estimated Total</span>
              <strong className="text-2xl text-primary">{money(viewing.price + assembly)}</strong>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Component prices and availability may change. Final pricing will be confirmed by IT
              HUB before purchase.
            </p>
          </>
        )}
      </Modal>
    </>
  );
}
