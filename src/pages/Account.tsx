import { useState, useEffect } from "react";
import { Link, NavLink, useParams, useLocation, useNavigate } from "react-router";
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
  CheckCircle2,
  Phone,
  Mail,
  MessageSquare,
  Clock,
  Sparkles,
  AlertCircle,
  Copy,
  ExternalLink,
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
import {
  updateCustomerProfile,
  sendEmailVerificationOtp,
  verifyEmailVerificationOtp,
} from "../lib/auth";
import { updateShopifyCartDiscountCodes } from "../lib/shopify";
import {
  formatTicketReference,
  fetchUserServiceRequests,
  mergeServiceRequests,
  subscribeCustomerServiceRequests,
} from "../lib/services";
import {
  fetchCustomerNotifications,
  subscribeCustomerNotifications,
} from "../lib/customerNotifications";
import WhatsAppIcon from "../components/WhatsAppIcon";
import ProductCard from "../components/ProductCard";
import AccountNavDropdown, { accountSections } from "../components/AccountNavDropdown";
import CustomerRescheduleManager from "../components/CustomerRescheduleManager";
import ShopifyOrderDetailsModal from "../components/ShopifyOrderDetailsModal";
import {
  fetchCustomerShopifyOrders,
  resolveOrderPresentationStatus,
  getOrderStatusBadgeTone,
  type ShopifyCustomerOrder,
} from "../lib/shopify-orders";
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

const sections = accountSections;

const sellStatusTones: Record<string, "amber" | "blue" | "green" | "red" | "gray"> = {
  Pending: "amber",
  "Under Review": "blue",
  Contacted: "blue",
  Approved: "green",
  Rejected: "red",
  Completed: "gray",
};

export default function Account() {
  const { section: rawSection = "overview" } = useParams();
  const section = rawSection === "addresses" ? "profile" : rawSection;
  const location = useLocation();
  const navigate = useNavigate();
  const store = useStore();
  const [login, setLogin] = useState(false);
  const [profile, setProfile] = useState(store.profile);
  const [warranty, setWarranty] = useState<string | null>(null);
  const [ticket, setTicket] = useState({ subject: "", message: "" });
  const [auth, setAuth] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [showProfilePrompt, setShowProfilePrompt] = useState(false);
  const [isVerifyingEmailOtp, setIsVerifyingEmailOtp] = useState(false);
  const [emailOtpStep, setEmailOtpStep] = useState<
    "idle" | "sending" | "otp_sent" | "verified" | "error"
  >("idle");
  const [emailOtpCode, setEmailOtpCode] = useState("");
  const [emailOtpCooldown, setEmailOtpCooldown] = useState(0);
  const [emailOtpMessage, setEmailOtpMessage] = useState("");
  const [emailOtpError, setEmailOtpError] = useState("");
  const [applyingCode, setApplyingCode] = useState<string | null>(null);
  const [usedCodes, setUsedCodes] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("ithub_used_discount_codes");
      return stored ? JSON.parse(stored) : ["WELCOME5"];
    } catch {
      return ["WELCOME5"];
    }
  });

  // Authoritative Shopify Customer Orders State
  const [shopifyOrders, setShopifyOrders] = useState<ShopifyCustomerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersRefreshing, setOrdersRefreshing] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [ordersAuthError, setOrdersAuthError] = useState(false);
  const [linkQueryInput, setLinkQueryInput] = useState("");
  const [linkingOrder, setLinkingOrder] = useState(false);
  const [linkStatusMsg, setLinkStatusMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [ordersPageInfo, setOrdersPageInfo] = useState<{
    hasNextPage: boolean;
    endCursor: string | null;
  }>({
    hasNextPage: false,
    endCursor: null,
  });
  const [selectedOrderForModal, setSelectedOrderForModal] = useState<ShopifyCustomerOrder | null>(
    null,
  );
  const [checkoutCompletedBanner, setCheckoutCompletedBanner] = useState(false);

  const loadOrders = async (isManualRefresh = false, linkQuery?: string) => {
    if (!store.loggedIn) {
      setOrdersAuthError(true);
      return;
    }
    setOrdersAuthError(false);
    if (isManualRefresh) {
      setOrdersRefreshing(true);
    } else {
      setOrdersLoading(true);
    }
    setOrdersError(null);

    const res = await fetchCustomerShopifyOrders({
      refresh: isManualRefresh,
      limit: 10,
      linkQuery,
    });
    if (res.authError) {
      setOrdersAuthError(true);
      setOrdersError(res.error || "Please sign in to view your order history.");
    } else if (res.error) {
      setOrdersError(res.error);
    } else {
      setShopifyOrders(res.orders);
      setOrdersPageInfo(res.pageInfo);
      if (linkQuery && res.orders.length > 0) {
        setLinkStatusMsg({
          type: "success",
          text: "Order located and successfully linked to your account!",
        });
      } else if (linkQuery && res.orders.length === 0) {
        setLinkStatusMsg({
          type: "error",
          text: "No matching order found for the provided information. Please verify your payment ID, email, or mobile number.",
        });
      }
    }
    setOrdersLoading(false);
    setOrdersRefreshing(false);
  };

  const handleLinkOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkQueryInput.trim()) return;
    setLinkingOrder(true);
    setLinkStatusMsg(null);
    try {
      await loadOrders(true, linkQueryInput.trim());
    } finally {
      setLinkingOrder(false);
    }
  };

  const loadMoreOrders = async () => {
    if (!ordersPageInfo.hasNextPage || !ordersPageInfo.endCursor || ordersLoading) return;
    const offset = parseInt(ordersPageInfo.endCursor, 10);
    setOrdersLoading(true);
    const res = await fetchCustomerShopifyOrders({ offset, limit: 10 });
    if (res.orders.length > 0) {
      setShopifyOrders((prev) => {
        const existingIds = new Set(prev.map((o) => o.shopify_order_id));
        const newOnes = res.orders.filter((o) => !existingIds.has(o.shopify_order_id));
        return [...prev, ...newOnes];
      });
      setOrdersPageInfo(res.pageInfo);
    }
    setOrdersLoading(false);
  };

  // Auto-refresh when customer returns from Shopify checkout with ?checkout_completed=true
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get("checkout_completed") === "true") {
      setCheckoutCompletedBanner(true);
      loadOrders(true);
      navigate(location.pathname, { replace: true });
    }
  }, [location.search]);

  // Load orders on mount or when section becomes orders
  useEffect(() => {
    if (store.loggedIn) {
      loadOrders(section === "orders");
    }
  }, [store.loggedIn, section]);

  useEffect(() => {
    if (emailOtpCooldown <= 0) return;
    const timer = setInterval(() => {
      setEmailOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [emailOtpCooldown]);

  useEffect(() => {
    if (store.loggedIn) {
      const dismissed = sessionStorage.getItem("ithub_profile_prompt_dismissed");
      const incomplete = !store.profile.name?.trim() || !store.profile.address?.trim();
      if (!dismissed && incomplete) {
        setShowProfilePrompt(true);
      }
    }
  }, [store.loggedIn, store.profile.name, store.profile.address]);

  // Live Authoritative Synchronization: Services, Sell Requests & Notifications
  useEffect(() => {
    if (!store.loggedIn) return;

    // 1. Initial hydration of sell requests
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
      .catch(() => {});

    // 2. Authoritative synchronization of customer service requests
    const syncServices = () => {
      fetchUserServiceRequests()
        .then((supabaseServices) => {
          if (supabaseServices && supabaseServices.length > 0) {
            store.set((prev) => ({
              requests: mergeServiceRequests(prev.requests, supabaseServices),
            }));
          }
        })
        .catch(() => {});
    };
    syncServices();

    // 3. Authoritative synchronization of customer notifications
    const syncNotifications = () => {
      fetchCustomerNotifications()
        .then((notifs) => {
          if (notifs && notifs.length > 0) {
            const messages = notifs.map((n) => (n.title ? `${n.title}: ${n.message}` : n.message));
            store.set((prev) => {
              const currentSet = new Set(prev.notifications);
              const brandNew = messages.filter((m) => !currentSet.has(m));
              return brandNew.length > 0
                ? { notifications: [...brandNew, ...prev.notifications] }
                : prev;
            });
          }
        })
        .catch(() => {});
    };
    syncNotifications();

    const userId = store.profile?.id;
    let unsubServices = () => {};
    let unsubNotifs = () => {};

    if (userId) {
      // 4. Supabase Realtime channel for customer service updates
      unsubServices = subscribeCustomerServiceRequests(userId, (updated) => {
        store.set((prev) => ({
          requests: mergeServiceRequests(prev.requests, [updated]),
        }));
      });

      // 5. Supabase Realtime channel for customer notifications
      unsubNotifs = subscribeCustomerNotifications(userId, () => {
        syncNotifications();
        syncServices();
      });
    }

    // 6. Automatic reconciliation on visibility restoration & window focus
    const onVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        syncServices();
        syncNotifications();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityOrFocus);
    window.addEventListener("focus", onVisibilityOrFocus);

    // 7. Fallback polling interval (30s) while document is active/visible
    const pollInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        syncServices();
      }
    }, 30000);

    return () => {
      unsubServices();
      unsubNotifs();
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
      window.removeEventListener("focus", onVisibilityOrFocus);
      clearInterval(pollInterval);
    };
  }, [store.loggedIn, store.profile?.id]);
  const products = store.wishlist
    .map((id) => store.products.find((item) => item.id === id))
    .filter((item) => !!item);
  const warranties = store.orders.flatMap((order) =>
    order.items
      .filter((item) => item.productId)
      .map((item) => {
        const term =
          store.products.find((product) => product.id === item.productId)?.specs?.Warranty ||
          store.products.find((product) => product.id === item.productId)?.warranty ||
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
      {/* Mobile/Tablet Dropdown Navigation (Hidden on desktop lg:) */}
      <div className="relative z-30 mb-6 lg:hidden">
        <AccountNavDropdown activeSection={section} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[210px_1fr]">
        <aside className="hidden lg:block min-w-0 self-start rounded-2xl border border-border bg-white p-4 shadow-2xs">
          <div className="mb-4 border-b border-border pb-5">
            <Logo />
            <p className="mt-3 text-sm font-bold">{store.profile.name || "Welcome to IT HUB"}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <BadgeCheck size={12} className="text-primary" /> {store.profile.phone}
              </span>
            </p>
          </div>
          <nav className="flex flex-col gap-1 lg:flex-col">
            {sections.map(({ id, name, Icon }) => (
              <NavLink
                key={id}
                to={id === "overview" ? "/account" : `/account/${id}`}
                end
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition ${
                    isActive
                      ? "bg-primary/10 font-bold text-primary shadow-2xs"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
                    count:
                      shopifyOrders.length > 0
                        ? shopifyOrders.filter(
                            (order) =>
                              order.fulfillment_status !== "fulfilled" &&
                              order.fulfillment_status !== "cancelled",
                          ).length
                        : store.orders.filter((order) => order.status < 6).length,
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
            <div className="space-y-6">
              <div className="rounded-3xl border border-border bg-card p-6 md:p-8">
                <div className="flex flex-wrap items-center gap-5">
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-white shadow-sm">
                    {(store.profile.name || "U").charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold">{store.profile.name || "Add your name"}</h2>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <BadgeCheck size={16} className="text-primary" /> {store.profile.phone} ·
                      Mobile verified
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      setProfile(store.profile);
                      setAddressError("");
                      setLogin(true);
                    }}
                  >
                    Edit profile
                  </Button>
                </div>

                <dl className="mt-8 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-muted p-4">
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Full name
                    </dt>
                    <dd className="mt-1.5 text-sm font-medium">
                      {store.profile.name || "Not added yet"}
                    </dd>
                  </div>

                  <div className="rounded-2xl bg-muted p-4">
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                      <span>Mobile</span>
                      <span className="text-[10px] font-bold text-primary flex items-center gap-1">
                        <BadgeCheck size={12} /> VERIFIED
                      </span>
                    </dt>
                    <dd className="mt-1.5 text-sm font-mono font-medium">
                      {store.profile.phone || "Not linked"}
                    </dd>
                  </div>

                  <div className="rounded-2xl bg-muted p-4 sm:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Email Address
                      </dt>
                      {store.profile.email && (
                        <div className="flex items-center gap-2">
                          {emailOtpStep === "verified" ? (
                            <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <CheckCircle2 size={12} /> VERIFIED
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={async () => {
                                setEmailOtpStep("sending");
                                setEmailOtpError("");
                                setEmailOtpMessage("");
                                const res = await sendEmailVerificationOtp(store.profile.email!);
                                if (res.ok) {
                                  setEmailOtpStep("otp_sent");
                                  setEmailOtpCooldown(60);
                                  setEmailOtpMessage(
                                    res.message ||
                                      `Verification code sent to ${store.profile.email}`,
                                  );
                                } else {
                                  setEmailOtpStep("error");
                                  setEmailOtpError(res.error || "Failed to send code.");
                                }
                              }}
                              disabled={emailOtpStep === "sending" || emailOtpCooldown > 0}
                              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                            >
                              <Mail size={12} />
                              {emailOtpCooldown > 0
                                ? `Resend code in ${emailOtpCooldown}s`
                                : "Verify Email with OTP"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <dd className="mt-1.5 text-sm font-medium">
                      {store.profile.email || "Not added yet"}
                    </dd>

                    {/* Email Verification Box */}
                    {emailOtpStep === "otp_sent" && (
                      <div className="mt-4 rounded-xl border border-primary/20 bg-card p-4 space-y-3">
                        <p className="text-xs text-muted-foreground">
                          Enter the 6-digit verification code sent to{" "}
                          <strong>{store.profile.email}</strong>:
                        </p>
                        <div className="flex items-center gap-2 max-w-sm">
                          <input
                            type="text"
                            maxLength={6}
                            placeholder="123456"
                            value={emailOtpCode}
                            onChange={(e) => setEmailOtpCode(e.target.value.replace(/\D/g, ""))}
                            className={`${fieldClass} text-center font-mono tracking-widest text-base font-bold`}
                          />
                          <Button
                            size="sm"
                            disabled={emailOtpCode.length < 6 || isVerifyingEmailOtp}
                            onClick={async () => {
                              setIsVerifyingEmailOtp(true);
                              setEmailOtpError("");
                              try {
                                const res = await verifyEmailVerificationOtp(
                                  store.profile.email!,
                                  emailOtpCode,
                                );
                                if (res.ok) {
                                  setEmailOtpStep("verified");
                                  setEmailOtpMessage("Email verified successfully!");
                                  store.notify("Email verified successfully");
                                } else {
                                  setEmailOtpStep("otp_sent");
                                  setEmailOtpError(res.error || "Invalid code. Please try again.");
                                }
                              } finally {
                                setIsVerifyingEmailOtp(false);
                              }
                            }}
                          >
                            {isVerifyingEmailOtp ? "Verifying..." : "Confirm"}
                          </Button>
                        </div>
                        {emailOtpMessage && (
                          <p className="text-xs text-green-600 font-medium">{emailOtpMessage}</p>
                        )}
                        {emailOtpError && (
                          <p className="text-xs text-destructive font-medium">{emailOtpError}</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl bg-muted p-4 sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <MapPin size={13} className="text-primary" /> Service &amp; Delivery Address
                      </dt>
                      {store.profile.address ? (
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary uppercase tracking-wider">
                          DEFAULT ADDRESS
                        </span>
                      ) : null}
                    </div>
                    <dd className="mt-2 text-sm font-medium whitespace-pre-line">
                      {store.profile.address ? (
                        <div className="space-y-3">
                          <p className="text-slate-800 leading-relaxed font-normal">
                            {store.profile.address}
                          </p>
                          <div className="flex flex-wrap items-center gap-3 pt-1">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setProfile(store.profile);
                                setAddressError("");
                                setLogin(true);
                              }}
                            >
                              Edit address
                            </Button>
                            <button
                              type="button"
                              className="text-xs font-semibold text-destructive hover:underline"
                              onClick={async () => {
                                const updatedProfile = { ...store.profile, address: "" };
                                store.set({ profile: updatedProfile });
                                store.notify("Address removed");
                                try {
                                  await updateCustomerProfile({
                                    fullName: updatedProfile.name,
                                    email: updatedProfile.email,
                                    address: "",
                                    phone: updatedProfile.phone,
                                  });
                                } catch {
                                  // Local profile updated
                                }
                              }}
                            >
                              Remove address
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-muted-foreground text-xs leading-relaxed font-normal">
                            No delivery address saved yet. Add an address to make your doorstep
                            service visits, PC deliveries, and checkout seamless.
                          </p>
                          <Button
                            size="sm"
                            onClick={() => {
                              setProfile(store.profile);
                              setAddressError("");
                              setLogin(true);
                            }}
                          >
                            Add address
                          </Button>
                        </div>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          )}
          {section === "offers" && (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-bold">My Offers & Discounts</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Authoritative Shopify promotional codes and member discounts. Apply directly at
                  checkout or copy to your clipboard.
                </p>
              </div>

              {/* Informational Integration Card */}
              <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-xs text-blue-900">
                <AlertCircle size={18} className="shrink-0 text-primary mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-sm">Shopify Storefront Integration Notice</p>
                  <p className="leading-relaxed">
                    Promotion codes are verified directly through Shopify Storefront cart mutations.
                    Automatic merchant discount coupon introspection requires Shopify Admin API
                    credentials which are unconfigured in this environment.
                  </p>
                </div>
              </div>

              {/* Active Coupons Grid */}
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  {
                    code: "WELCOME10",
                    name: "Welcome Discount",
                    description:
                      "10% off your entire cart up to ₹2,000 on all electronics and services.",
                    minSpend: "₹1,000",
                    validity: "Valid for new & existing registered members",
                  },
                  {
                    code: "OFFER10",
                    name: "Components & Upgrades",
                    description:
                      "10% instant discount on PC components, graphics cards, and monitors.",
                    minSpend: "₹3,000",
                    validity: "Active seasonal promotion",
                  },
                  {
                    code: "TECHHUB2026",
                    name: "Service & Diagnostics Flat Off",
                    description:
                      "Flat ₹500 off on repair services, on-site diagnostics, or custom PC builds.",
                    minSpend: "₹1,500",
                    validity: "Active store offer",
                  },
                ].map((promo) => (
                  <article
                    key={promo.code}
                    className="relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border bg-card p-6 transition hover:border-primary/40 shadow-sm"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <Badge tone="blue">ACTIVE PROMOTION</Badge>
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Min {promo.minSpend}
                        </span>
                      </div>
                      <h3 className="mt-4 text-lg font-bold">{promo.name}</h3>
                      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                        {promo.description}
                      </p>
                      <p className="mt-2 text-[10px] text-muted-foreground">{promo.validity}</p>
                    </div>

                    <div className="mt-6 space-y-3">
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-primary/40 bg-secondary px-4 py-3">
                        <code className="text-base font-bold font-mono tracking-widest text-primary">
                          {promo.code}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(promo.code);
                            store.notify(`Code ${promo.code} copied to clipboard`);
                          }}
                          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                        >
                          <Copy size={13} /> Copy code
                        </button>
                      </div>

                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full text-xs font-semibold"
                        disabled={applyingCode === promo.code}
                        onClick={async () => {
                          setApplyingCode(promo.code);
                          try {
                            navigator.clipboard?.writeText(promo.code);
                            localStorage.setItem("ithub_active_discount_code", promo.code);
                            setUsedCodes((prev) => {
                              if (!prev.includes(promo.code)) {
                                const next = [promo.code, ...prev];
                                localStorage.setItem(
                                  "ithub_used_discount_codes",
                                  JSON.stringify(next),
                                );
                                return next;
                              }
                              return prev;
                            });
                            store.notify(`Code ${promo.code} copied and applied for checkout!`);
                          } catch {
                            store.notify(`Code ${promo.code} ready to use at checkout.`);
                          } finally {
                            setApplyingCode(null);
                          }
                        }}
                      >
                        {applyingCode === promo.code ? (
                          <span className="flex items-center gap-2">
                            <RefreshCw size={13} className="animate-spin" /> Applying...
                          </span>
                        ) : (
                          "Apply at Checkout"
                        )}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>

              {/* Used & Redeemed Codes Section */}
              <div className="rounded-3xl border border-border bg-card p-6">
                <h3 className="text-base font-bold">Previously Used & Redeemed Codes</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Promotional codes that have been applied or tested during your session.
                </p>

                {usedCodes.length > 0 ? (
                  <div className="mt-4 divide-y divide-border rounded-2xl border border-border overflow-hidden">
                    {usedCodes.map((c) => (
                      <div
                        key={c}
                        className="flex items-center justify-between p-3.5 bg-muted/30 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <BadgeCheck size={16} className="text-green-600" />
                          <code className="font-mono font-bold text-foreground">{c}</code>
                        </div>
                        <span className="text-[11px] font-medium text-muted-foreground">
                          Recorded in checkout session
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-muted-foreground italic">No used codes yet.</p>
                )}
              </div>
            </div>
          )}
          {section === "orders" && (
            <>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">My Orders</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Authoritative Shopify order history, fulfillment updates, and delivery tracking.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => loadOrders(true)}
                  disabled={ordersRefreshing || ordersLoading}
                  className="flex items-center gap-2 text-xs"
                >
                  <RefreshCw
                    size={14}
                    className={ordersRefreshing ? "animate-spin text-primary" : ""}
                  />
                  {ordersRefreshing ? "Syncing with Shopify..." : "Refresh Orders"}
                </Button>
              </div>

              {checkoutCompletedBanner && (
                <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-xs text-emerald-950 shadow-xs animate-in fade-in">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-sm text-emerald-900">
                      Order Completed Successfully!
                    </p>
                    <p className="mt-0.5 text-emerald-800">
                      Thank you for purchasing with IT HUB. Your order details are being
                      synchronized directly from Shopify.
                    </p>
                  </div>
                  <button
                    onClick={() => setCheckoutCompletedBanner(false)}
                    className="text-emerald-700 hover:text-emerald-950 text-xs font-semibold"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {linkStatusMsg && (
                <div
                  className={`mb-6 flex items-start gap-3 rounded-2xl border p-4 text-xs shadow-xs animate-in fade-in ${
                    linkStatusMsg.type === "success"
                      ? "border-emerald-200 bg-emerald-50/90 text-emerald-950"
                      : "border-red-200 bg-red-50/90 text-red-950"
                  }`}
                >
                  {linkStatusMsg.type === "success" ? (
                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="font-bold text-sm">
                      {linkStatusMsg.type === "success"
                        ? "Order Linked Successfully"
                        : "Order Lookup Notice"}
                    </p>
                    <p className="mt-0.5">{linkStatusMsg.text}</p>
                  </div>
                  <button
                    onClick={() => setLinkStatusMsg(null)}
                    className="text-xs font-semibold opacity-70 hover:opacity-100"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {!store.loggedIn || ordersAuthError ? (
                <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-xs">
                  <UserRound size={36} className="mx-auto text-primary mb-3" />
                  <h3 className="text-base font-bold">Sign In Required</h3>
                  <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                    Please sign in or link your verified mobile number to view your authoritative
                    Shopify order history and track deliveries.
                  </p>
                  <Button
                    onClick={() => {
                      setProfile(store.profile);
                      setAddressError("");
                      setLogin(true);
                    }}
                    className="mt-5 text-xs"
                  >
                    Sign In / Register
                  </Button>
                </div>
              ) : ordersLoading && !shopifyOrders.length ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      className="rounded-2xl border border-border bg-card p-6 animate-pulse space-y-4"
                    >
                      <div className="flex justify-between items-center">
                        <div className="h-5 w-32 bg-muted rounded-md" />
                        <div className="h-5 w-20 bg-muted rounded-md" />
                      </div>
                      <div className="h-16 bg-muted/60 rounded-xl" />
                      <div className="flex justify-between items-center pt-2">
                        <div className="h-5 w-24 bg-muted rounded-md" />
                        <div className="h-8 w-28 bg-muted rounded-md" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : ordersError && !shopifyOrders.length ? (
                <div className="space-y-6">
                  <div className="rounded-3xl border border-red-200 bg-red-50/90 p-8 text-center text-red-950">
                    <AlertCircle size={32} className="mx-auto text-red-600 mb-3" />
                    <h3 className="text-base font-bold">Unable to Synchronize Shopify Orders</h3>
                    <p className="mt-1 text-xs text-red-700 max-w-md mx-auto">{ordersError}</p>
                    <Button
                      variant="secondary"
                      onClick={() => loadOrders(true)}
                      className="mt-5 text-xs inline-flex items-center gap-2"
                    >
                      <RefreshCw size={14} /> Retry Order Sync
                    </Button>
                  </div>

                  {/* Manual Order Recovery Form */}
                  <div className="rounded-2xl border border-border bg-card p-6">
                    <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Tag size={16} className="text-primary" /> Find &amp; Link Your Purchase
                    </h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      If your order was placed using an alternate email, phone number, or Razorpay
                      payment reference:
                    </p>
                    <form onSubmit={handleLinkOrderSubmit} className="mt-4 flex flex-wrap gap-2">
                      <input
                        type="text"
                        value={linkQueryInput}
                        onChange={(e) => setLinkQueryInput(e.target.value)}
                        placeholder="e.g. alternate email, mobile number, or payment ID (pay_...)"
                        className={`${fieldClass} flex-1 min-w-[240px] text-xs`}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={linkingOrder || !linkQueryInput.trim()}
                        className="text-xs"
                      >
                        {linkingOrder ? "Searching..." : "Find & Link Order"}
                      </Button>
                    </form>
                  </div>
                </div>
              ) : shopifyOrders.length > 0 ? (
                <div className="space-y-4">
                  {shopifyOrders.map((order) => {
                    const status = resolveOrderPresentationStatus(
                      order.financial_status,
                      order.fulfillment_status,
                    );
                    const tone = getOrderStatusBadgeTone(status);
                    const dateFormatted = new Date(order.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    });

                    return (
                      <div
                        key={order.shopify_order_id}
                        className="rounded-2xl border border-border bg-card p-6 transition hover:border-primary/40 shadow-xs"
                      >
                        {/* Order Header */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-base font-bold text-foreground">
                                {order.order_number}
                              </p>
                              <span className="text-xs text-muted-foreground">·</span>
                              <span className="text-xs text-muted-foreground">{dateFormatted}</span>
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {order.line_items.length}{" "}
                              {order.line_items.length === 1 ? "item" : "items"}
                              {order.tracking_number &&
                                ` · Shipped via ${order.tracking_company || "Courier"}`}
                            </p>
                          </div>
                          <Badge tone={tone}>{status}</Badge>
                        </div>

                        {/* Line Items Preview */}
                        <div className="my-4 divide-y divide-border/60">
                          {order.line_items.map((item, idx) => (
                            <div
                              key={item.id || idx}
                              className="flex items-center justify-between gap-4 py-3 first:pt-1 last:pb-1"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/40 flex items-center justify-center">
                                  {item.imageUrl ? (
                                    <img
                                      src={item.imageUrl}
                                      alt={item.title}
                                      className="h-full w-full object-cover"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <ShoppingBag size={18} className="text-muted-foreground/60" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-foreground line-clamp-1">
                                    {item.title}
                                  </p>
                                  {item.sku && (
                                    <p className="text-[10px] font-mono text-muted-foreground">
                                      SKU: {item.sku}
                                    </p>
                                  )}
                                  {item.variantTitle && item.variantTitle !== "Default Title" && (
                                    <p className="text-[11px] text-muted-foreground">
                                      {item.variantTitle}
                                    </p>
                                  )}
                                  <p className="text-[11px] text-muted-foreground">
                                    Qty: {item.quantity} × {money(item.price)}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-xs font-bold text-foreground">
                                  {money(item.price * item.quantity)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Order Footer & Actions */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                          <div>
                            <span className="text-[11px] text-muted-foreground block">
                              Order Total
                            </span>
                            <span className="text-base font-bold text-foreground">
                              {money(order.total_price)}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            {order.tracking_url && (
                              <a
                                href={order.tracking_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline px-3 py-1.5 rounded-lg border border-primary/20 hover:bg-primary/5"
                              >
                                Track Shipment <ExternalLink size={12} />
                              </a>
                            )}
                            <Button
                              variant="secondary"
                              onClick={() => setSelectedOrderForModal(order)}
                              className="text-xs px-4 py-2"
                            >
                              View Details
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {ordersPageInfo.hasNextPage && (
                    <div className="pt-4 text-center">
                      <Button
                        variant="secondary"
                        onClick={loadMoreOrders}
                        disabled={ordersLoading}
                        className="text-xs px-6"
                      >
                        {ordersLoading ? "Loading..." : "Load Older Orders"}
                      </Button>
                    </div>
                  )}

                  {/* Secondary Link Helper in Case Customer Has Another Order */}
                  <div className="mt-8 rounded-2xl border border-dashed border-border bg-muted/30 p-5">
                    <p className="text-xs font-semibold text-foreground">
                      Missing an order placed under a different email or phone number?
                    </p>
                    <form onSubmit={handleLinkOrderSubmit} className="mt-3 flex flex-wrap gap-2">
                      <input
                        type="text"
                        value={linkQueryInput}
                        onChange={(e) => setLinkQueryInput(e.target.value)}
                        placeholder="Alternate email, phone (+91...), or payment ID (pay_...)"
                        className={`${fieldClass} flex-1 min-w-[200px] text-xs`}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant="secondary"
                        disabled={linkingOrder || !linkQueryInput.trim()}
                        className="text-xs"
                      >
                        {linkingOrder ? "Searching..." : "Link Order"}
                      </Button>
                    </form>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-xs">
                    <ShoppingBag size={36} className="mx-auto text-muted-foreground/60 mb-3" />
                    <h3 className="text-base font-bold text-foreground">No Orders Found Yet</h3>
                    <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                      You haven't placed any product orders with your primary account credentials
                      yet.
                    </p>
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                      <ActionLink to="/products" className="text-xs">
                        Browse Products
                      </ActionLink>
                      <Button
                        variant="secondary"
                        onClick={() => loadOrders(true)}
                        className="text-xs"
                      >
                        <RefreshCw size={12} className="mr-1.5" /> Re-check Orders
                      </Button>
                    </div>
                  </div>

                  {/* Dedicated Order Recovery Form for Empty State */}
                  <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
                    <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Tag size={16} className="text-primary" /> Already Completed a Purchase?
                    </h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      If you checked out using an alternate email, phone number, or paid via
                      Razorpay, enter your details below to securely link your order:
                    </p>
                    <form onSubmit={handleLinkOrderSubmit} className="mt-4 flex flex-wrap gap-2">
                      <input
                        type="text"
                        value={linkQueryInput}
                        onChange={(e) => setLinkQueryInput(e.target.value)}
                        placeholder="e.g. alternate email, mobile number, or payment ID (pay_...)"
                        className={`${fieldClass} flex-1 min-w-[240px] text-xs`}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={linkingOrder || !linkQueryInput.trim()}
                        className="text-xs"
                      >
                        {linkingOrder ? "Searching..." : "Find & Link Order"}
                      </Button>
                    </form>
                  </div>
                </div>
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
                          <h3 className="font-bold">{request.model || request.device}</h3>
                          <p className="mt-1 text-xs font-mono text-muted-foreground">
                            {request.ticketReference || formatTicketReference(request.id)} ·{" "}
                            {request.problem}
                          </p>
                          {request.technician &&
                            request.technician !== "IT HUB Bench Specialist" && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Specialist:{" "}
                                <span className="font-semibold text-foreground">
                                  {request.technician}
                                </span>
                              </p>
                            )}
                          {request.date && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Appointment:{" "}
                              <span className="font-semibold text-foreground">
                                {request.date} ({request.time || "Scheduled"})
                              </span>
                            </p>
                          )}
                          {request.quote > 0 && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Quote:{" "}
                              <span className="font-semibold text-foreground">
                                ₹{request.quote.toLocaleString("en-IN")}
                              </span>{" "}
                              ({request.quoteState})
                            </p>
                          )}
                          {request.paymentStatus && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Payment:{" "}
                              <span
                                className={`font-semibold ${request.paymentStatus === "Paid" ? "text-emerald-600" : "text-amber-600"}`}
                              >
                                {request.paymentStatus}
                              </span>
                            </p>
                          )}
                        </div>
                        <Badge>
                          {request.statusName || serviceStatuses[request.status] || "Booked"}
                        </Badge>
                      </div>
                      <div className="mt-5 flex justify-between text-xs">
                        <p className="text-muted-foreground">{request.method}</p>
                        <Link
                          to={`/track-service/${encodeURIComponent(request.ticketReference || formatTicketReference(request.id))}`}
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
          {section === "reschedule" && <CustomerRescheduleManager />}
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
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold">After-Sales & Warranty Support</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Need assistance with an existing purchase, device diagnosis, or warranty repair?
                  Contact our team directly.
                </p>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                {/* Primary WhatsApp Card */}
                <div className="rounded-3xl border border-green-200 bg-gradient-to-br from-green-50/80 to-card p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-600 text-white shadow-md">
                      <WhatsAppIcon className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 text-xl font-bold text-foreground">Chat on WhatsApp</h3>
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                      Instant direct support with our senior technicians and service coordinators.
                      Share photos, repair bills, or ask technical questions.
                    </p>
                  </div>
                  <div className="mt-6">
                    <a
                      href="https://wa.me/919876543210?text=Hello%20IT%20HUB,%20I%20need%20support%20with%20my%20order/service."
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700"
                    >
                      <WhatsAppIcon className="h-4 w-4" /> Message Support on WhatsApp
                    </a>
                  </div>
                </div>

                {/* Direct Phone Call Card */}
                <div className="rounded-3xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                      <Phone size={24} />
                    </div>
                    <h3 className="mt-4 text-xl font-bold text-foreground">Call IT HUB Helpline</h3>
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                      Speak directly with our store support desk during operating hours (Mon – Sat,
                      9:30 AM – 7:30 PM).
                    </p>
                  </div>
                  <div className="mt-6">
                    <a
                      href="tel:+919876543210"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted/60 px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-muted"
                    >
                      <Phone size={16} /> +91 98765 43210
                    </a>
                  </div>
                </div>

                {/* Walk-in Service Centre Card */}
                <div className="rounded-3xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                      <MapPin size={24} />
                    </div>
                    <h3 className="mt-4 text-xl font-bold text-foreground">Visit Service Centre</h3>
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                      <strong>IT HUB Experience Store</strong>
                      <br />
                      AM Road, Near Private Bus Stand,
                      <br />
                      Kothamangalam, Kerala 686691
                    </p>
                    <p className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <Clock size={13} className="text-primary" /> Mon – Sat: 9:30 AM – 7:30 PM
                      (Sunday Closed)
                    </p>
                  </div>
                  <div className="mt-6">
                    <Link
                      to="/contact"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-5 py-3 text-sm font-semibold text-primary transition hover:bg-secondary/80"
                    >
                      View Map & Directions <ArrowUpRight size={15} />
                    </Link>
                  </div>
                </div>

                {/* Book a Service Card */}
                <div className="rounded-3xl border border-primary/20 bg-secondary/40 p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-sm">
                      <Wrench size={24} />
                    </div>
                    <h3 className="mt-4 text-xl font-bold text-foreground">Need a Repair?</h3>
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                      Book a store walk-in, schedule a doorstep technician visit to your home or
                      office, or arrange an insured courier pickup across Kerala.
                    </p>
                  </div>
                  <div className="mt-6">
                    <Link
                      to="/services/book"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90"
                    >
                      Book Service Online <ArrowUpRight size={15} />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
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
          {!sections.some((item) => item.id === section) && section !== "settings" && (
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
        onOpenChange={(open) => {
          setLogin(open);
          if (!open) setAddressError("");
        }}
        title="Make yourself at home."
        description="Keep your details up to date for faster checkout, doorstep visits, and courier tracking."
      >
        <div className="mb-5 flex justify-center">
          <Logo />
        </div>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const cleanAddress = (profile.address || "").trim();
            if (!cleanAddress) {
              setAddressError("Delivery address is required. Please provide your full address.");
              return;
            }
            setAddressError("");
            const updatedProfile = { ...profile, address: cleanAddress };
            store.set({ profile: updatedProfile });
            setLogin(false);
            try {
              const res = await updateCustomerProfile({
                fullName: updatedProfile.name,
                email: updatedProfile.email,
                address: updatedProfile.address,
                phone: updatedProfile.phone,
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
          <Field label="Full name *">
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
              className={`${fieldClass} bg-muted cursor-not-allowed`}
            />
          </Field>
          <Field label="Address *">
            <textarea
              required
              rows={3}
              placeholder="House / Apartment name, Street, Landmark, Town, PIN code"
              value={profile.address}
              onChange={(event) => {
                setProfile({ ...profile, address: event.target.value });
                if (addressError) setAddressError("");
              }}
              className={`${fieldClass} ${addressError ? "border-destructive focus:ring-destructive" : ""}`}
            />
            {addressError && (
              <p className="mt-1 text-xs text-destructive font-medium">{addressError}</p>
            )}
          </Field>
          <Button type="submit" className="w-full">
            Save profile
          </Button>
        </form>
      </Modal>

      {/* Non-blocking Customer Profile Completion Prompt Modal */}
      <Modal
        open={showProfilePrompt}
        onOpenChange={(open) => {
          if (!open) {
            sessionStorage.setItem("ithub_profile_prompt_dismissed", "true");
            setShowProfilePrompt(false);
          }
        }}
        title="Complete Your IT HUB Profile"
        description="Add your name and delivery address to enable faster checkout, doorstep technician dispatch, and courier tracking."
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 text-xs text-blue-900 leading-relaxed">
            <p className="font-semibold text-sm mb-1.5 flex items-center gap-1.5 text-primary">
              <Sparkles size={16} /> Fast-track your services
            </p>
            Having your verified address on file ensures seamless doorstep repairs, accurate
            logistics calculation, and rapid warranty dispatches.
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                sessionStorage.setItem("ithub_profile_prompt_dismissed", "true");
                setShowProfilePrompt(false);
              }}
              className="flex-1"
            >
              I'll Do It Later
            </Button>
            <Button
              onClick={() => {
                setShowProfilePrompt(false);
                setProfile(store.profile);
                setAddressError("");
                setLogin(true);
              }}
              className="flex-1"
            >
              Do It Now
            </Button>
          </div>
        </div>
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

      <ShopifyOrderDetailsModal
        order={selectedOrderForModal}
        onClose={() => setSelectedOrderForModal(null)}
      />
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
