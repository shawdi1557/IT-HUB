import { useEffect, useState } from "react"
import { LoginGate } from "../components/AuthModal"
import { Link, useNavigate, useParams } from "react-router"
import {
  ArrowRight,
  CheckCircle2,
  Minus,
  Plus,
  Trash2,
  ShoppingBag,
  LockKeyhole,
  Truck,
  Search,
  Tag,
  ShieldCheck,
} from "lucide-react"
import { useStore } from "../app/store"
import { track } from "../lib/analytics"
import {
  bestOffer,
  money,
  orderStatuses,
  validateCoupon,
  type CartItem,
  type Coupon,
} from "../data/catalog"
import {
  RAZORPAY_KEY_ID,
  createSupabaseOrder,
  launchRazorpayModal,
  verifyCheckoutCallback,
} from "../lib/payments"
import WarrantyCheck from "../components/WarrantyCheck"
import {
  ActionLink,
  Badge,
  Button,
  Empty,
  Field,
  Page,
  PageHeading,
  Timeline,
  fieldClass,
} from "../components/ui"

function offerTotals(store: ReturnType<typeof useStore>) {
  let discount = 0
  const applied = new Set<string>()
  const subtotal = store.cart.reduce((sum, item) => {
    const product =
      item.productId && !item.build
        ? store.products.find((row) => row.id === item.productId)
        : undefined
    const best = product
      ? bestOffer(store.offers, { ...product, price: item.price })
      : null
    if (best) {
      discount += best.saving * item.quantity
      applied.add(best.offer.name)
    }
    return sum + item.price * item.quantity
  }, 0)
  return { subtotal, discount, applied: [...applied] }
}

export function Cart() {
  const store = useStore()
  if (!store.loggedIn) {
    return (
      <Page>
        <LoginGate
          title="Sign in to view your shopping bag"
          text="Sign in with your mobile number to manage your items, apply coupons, and proceed to checkout."
        />
      </Page>
    )
  }
  const { subtotal, discount, applied } = offerTotals(store)
  return (
    <Page>
      <PageHeading
        title="Your shopping bag."
        description={`${store.cart.reduce((sum, item) => sum + item.quantity, 0)} items, one step closer to your next upgrade.`}
      />
      {!store.cart.length ? (
        <Empty
          title="Your cart is empty"
          description="Your next great setup starts here."
          to="/products"
          label="Shop products"
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_350px]">
          <div className="space-y-4">
            {store.cart.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-5 rounded-lg border border-border p-5"
              >
                <div className="flex h-24 w-24 items-center justify-center rounded-md bg-muted">
                  {item.build ? (
                    <ShoppingBag className="text-primary" />
                  ) : (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="h-full w-full object-contain p-2"
                      onError={(event) => {
                        event.currentTarget.hidden = true
                      }}
                    />
                  )}
                </div>
                <div className="min-w-32 flex-1">
                  {item.productId ? (
                    <Link
                      to={`/products/${item.productId}`}
                      className="text-sm font-semibold hover:text-primary"
                    >
                      {item.name}
                    </Link>
                  ) : (
                    <p className="text-sm font-semibold">{item.name}</p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {money(item.price)} each
                  </p>
                  {item.build && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {Object.keys(item.build.parts).length} components
                    </p>
                  )}
                  <button
                    onClick={() => {
                      store.set({
                        cart: store.cart.filter((row) => row.id !== item.id),
                      })
                      store.notify("Removed from cart")
                    }}
                    className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-red-600"
                  >
                    <Trash2 size={12} /> Remove
                  </button>
                </div>
                <div className="flex items-center rounded-md border border-border">
                  <button
                    aria-label={`Decrease ${item.name} quantity`}
                    onClick={() =>
                      store.set({
                        cart: store.cart.map((row) =>
                          row.id === item.id
                            ? {
                                ...row,
                                quantity: Math.max(1, row.quantity - 1),
                              }
                            : row,
                        ),
                      })
                    }
                    className="p-2.5"
                  >
                    <Minus size={13} />
                  </button>
                  <span className="w-5 text-center text-sm">
                    {item.quantity}
                  </span>
                  <button
                    aria-label={`Increase ${item.name} quantity`}
                    disabled={
                      Boolean(item.productId) &&
                      item.quantity >=
                        (store.products.find(
                          (product) => product.id === item.productId,
                        )?.stock || 0)
                    }
                    onClick={() =>
                      store.set({
                        cart: store.cart.map((row) =>
                          row.id === item.id
                            ? { ...row, quantity: row.quantity + 1 }
                            : row,
                        ),
                      })
                    }
                    className="p-2.5 disabled:opacity-30"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <strong className="w-24 text-right text-sm">
                  {money(item.price * item.quantity)}
                </strong>
              </div>
            ))}
            <ActionLink secondary to="/products">
              Continue shopping
            </ActionLink>
          </div>
          <div className="self-start rounded-lg border border-border p-6">
            <h2 className="mb-6 text-lg font-bold">Order summary</h2>
            <div className="space-y-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{money(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Offer savings</span>
                <span className="text-emerald-700">−{money(discount)}</span>
              </div>
              {applied.length > 0 && (
                <p className="text-xs text-primary">
                  Applied automatically: {applied.join(", ")}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Delivery calculated at checkout. Prices include demo taxes.
              </p>
              <div className="flex justify-between border-t border-border pt-4 text-lg font-bold">
                <span>Total</span>
                <span>{money(subtotal - discount)}</span>
              </div>
            </div>
            <ActionLink to="/checkout" className="mt-6 w-full">
              Proceed to checkout <ArrowRight size={16} />
            </ActionLink>
            <p className="mt-4 flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
              <LockKeyhole size={12} /> Demo checkout · no real payment
            </p>
          </div>
        </div>
      )}
    </Page>
  )
}
export function Checkout() {
  const store = useStore()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  useEffect(
    () => track("Checkout Started", { items: String(store.cart.length) }),
    [],
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [details, setDetails] = useState({
    name: store.profile.name,
    email: store.profile.email,
    phone: store.profile.phone,
    address: store.profile.address,
    city: "Kothamangalam",
    pin: "",
    delivery: "Kerala delivery",
    payment: RAZORPAY_KEY_ID
      ? "Razorpay (UPI, Cards, NetBanking)"
      : "UPI (demo)",
  })
  const [couponInput, setCouponInput] = useState("")
  const [appliedCoupon, setAppliedCoupon] = useState<{
    coupon: Coupon
    discount: number
  } | null>(null)
  const [couponError, setCouponError] = useState("")

  const { subtotal, discount, applied } = offerTotals(store)
  const cartNet = Math.max(0, subtotal - discount)
  const couponDiscount = appliedCoupon ? appliedCoupon.discount : 0
  const shipping = details.delivery === "Store pickup" ? 0 : 99
  const total = Math.max(0, cartNet - couponDiscount + shipping)

  const customerId =
    store.profile.phone ||
    details.phone ||
    store.profile.email ||
    details.email ||
    "customer"

  const handleApplyCoupon = () => {
    setCouponError("")
    const res = validateCoupon(
      couponInput,
      cartNet,
      customerId,
      store.coupons,
      store.couponUsages,
    )
    if (!res.valid) {
      setCouponError(res.error)
      return
    }
    setAppliedCoupon({ coupon: res.coupon, discount: res.discount })
    store.notify(
      `Coupon ${res.coupon.code} applied! Saved ${money(res.discount)}.`,
    )
  }

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null)
    setCouponInput("")
    setCouponError("")
  }

  const update = (key: string, value: string) =>
    setDetails({ ...details, [key]: value })

  const finalizeOrder = (
    id: string,
    orderTotal: number,
    paymentRef?: string,
  ) => {
    const order = {
      id,
      name: details.name,
      email: details.email,
      address:
        details.delivery === "Store pickup"
          ? "IT HUB · Kothamangalam, Kerala"
          : `${details.address}, ${details.city}, Kerala ${details.pin}`,
      items: [...store.cart],
      total: orderTotal,
      status: 0,
      date: new Date().toISOString(),
      payment: paymentRef ? `Razorpay (${paymentRef})` : details.payment,
      delivery: details.delivery,
    }
    track("Order Created", { order: order.id, total: String(order.total) })
    store.set((previous) => ({
      orders: [order, ...previous.orders],
      cart: [],
      ...(appliedCoupon && {
        couponUsages: [
          {
            id: `USE-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
            couponId: appliedCoupon.coupon.id,
            couponCode: appliedCoupon.coupon.code,
            customerId,
            userId: customerId,
            orderId: id,
            discount: appliedCoupon.discount,
            usedAt: new Date().toISOString(),
          },
          ...previous.couponUsages,
        ],
        coupons: previous.coupons.map((c) =>
          c.id === appliedCoupon.coupon.id
            ? { ...c, timesUsed: c.timesUsed + 1 }
            : c,
        ),
      }),
      profile: {
        name: details.name,
        email: details.email,
        phone: details.phone,
        address: details.address,
      },
      products: previous.products.map((product) => ({
        ...product,
        stock: Math.max(
          0,
          product.stock -
            (previous.cart.find((item) => item.productId === product.id)
              ?.quantity || 0),
        ),
      })),
      notifications: [`Order ${id} placed`, ...previous.notifications],
    }))
    store.log(`Order ${id} created`)
    if (appliedCoupon) {
      store.log(
        `Coupon Used: ${appliedCoupon.coupon.code} on Order ${id} (-₹${appliedCoupon.discount})`,
      )
    }
    setBusy(false)
    store.notify(
      paymentRef
        ? "Order placed & payment verified successfully!"
        : "Order placed successfully — demo transaction",
    )
    navigate(`/order-success/${id}`)
  }

  const submit = async () => {
    setError("")
    if (step < 2) {
      setStep(step + 1)
      return
    }
    const unavailable = store.cart.find(
      (item) =>
        item.productId &&
        item.quantity >
          (store.products.find((product) => product.id === item.productId)
            ?.stock || 0),
    )
    if (unavailable) {
      setError(
        `${unavailable.name} has insufficient stock. Please update your cart.`,
      )
      return
    }
    if (appliedCoupon) {
      const recheck = validateCoupon(
        appliedCoupon.coupon.code,
        cartNet,
        customerId,
        store.coupons,
        store.couponUsages,
      )
      if (!recheck.valid) {
        setError(`Coupon error: ${recheck.error}`)
        setAppliedCoupon(null)
        return
      }
    }
    setBusy(true)

    const isRazorpay = details.payment.includes("Razorpay")

    // If Razorpay gateway is chosen and public key is available
    if (isRazorpay && RAZORPAY_KEY_ID) {
      let activeOrderId = `ITH-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
      let activeOrderTotal = total

      // Attempt server-side order reservation in Supabase
      const itemsPayload = store.cart
        .filter((item) => item.productId)
        .map((item) => ({
          product_id: item.productId as string,
          quantity: item.quantity,
        }))

      if (itemsPayload.length > 0) {
        const sbOrder = await createSupabaseOrder({
          items: itemsPayload,
          deliveryMethod: details.delivery,
          paymentMethod: "Razorpay",
          couponCode: appliedCoupon?.coupon.code || null,
          notes: `Customer: ${details.name}, Phone: ${details.phone}`,
        })

        if (sbOrder.ok && sbOrder.orderId) {
          activeOrderId = sbOrder.orderId
          if (sbOrder.total) activeOrderTotal = sbOrder.total
        }
      }

      // Launch Razorpay Modal
      const launched = await launchRazorpayModal({
        orderId: activeOrderId,
        amountINR: activeOrderTotal,
        customerName: details.name || "Customer",
        customerEmail: details.email || "customer@ithub.in",
        customerPhone: details.phone || "9876543210",
        onSuccess: async (payload) => {
          store.notify("Payment completed. Verifying with gateway…")
          const verifyResult = await verifyCheckoutCallback({
            ...payload,
            order_id: activeOrderId,
          })

          if (!verifyResult.ok) {
            console.warn("[Payment Verification]", verifyResult.error)
            store.notify(
              verifyResult.error ||
                "Payment verification pending. Reference saved.",
            )
          }

          finalizeOrder(
            activeOrderId,
            activeOrderTotal,
            payload.razorpay_payment_id,
          )
        },
        onDismiss: () => {
          setBusy(false)
          store.notify("Payment window closed.")
        },
        onError: (errMsg) => {
          setBusy(false)
          setError(errMsg)
          store.notify(errMsg)
        },
      })

      if (!launched) {
        setBusy(false)
      }
      return
    }

    // Fallback: Simulated local order placement
    await new Promise((resolve) => setTimeout(resolve, 700))
    const id = `ITH-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
    finalizeOrder(id, total)
  }
  if (!store.cart.length)
    return (
      <Page>
        <Empty
          title="Nothing to check out yet"
          description="Add something to your cart to start your technology journey."
          to="/products"
        />
      </Page>
    )
  if (!store.loggedIn)
    return (
      <Page>
        <LoginGate
          title="Login to place your order"
          text="Your cart is saved. Sign in with your mobile number to continue to checkout and track your order."
        />
      </Page>
    )
  return (
    <Page>
      <PageHeading
        title="A few details. Then it’s yours."
        description="This is a simulated checkout. No payment will be collected."
      />
      <div className="mb-9 flex max-w-xl items-center gap-4">
        {["Your details", "Delivery & payment", "Review"].map(
          (label, index) => (
            <button
              disabled={index > step}
              onClick={() => setStep(index)}
              key={label}
              className={`flex items-center gap-2 text-xs ${
                step === index
                  ? "font-bold text-primary"
                  : "text-muted-foreground"
              }`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full ${
                  index <= step ? "bg-primary text-white" : "bg-muted"
                }`}
              >
                {index + 1}
              </span>
              {label}
            </button>
          ),
        )}
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_350px]">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          className="rounded-lg border border-border p-6 md:p-8"
        >
          {step === 0 && (
            <>
              <h2 className="mb-6 text-xl font-bold">Your contact details</h2>
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
                <Field label="Phone">
                  <input
                    required
                    type="tel"
                    pattern="[+0-9 ()-]{10,15}"
                    title="Enter a valid phone number (10–15 characters)"
                    value={details.phone}
                    onChange={(event) => update("phone", event.target.value)}
                    className={fieldClass}
                  />
                </Field>
              </div>
              <Field label="Street address">
                <textarea
                  required
                  className={`${fieldClass} mt-2`}
                  value={details.address}
                  onChange={(event) => update("address", event.target.value)}
                />
              </Field>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <Field label="City">
                  <input
                    required
                    value={details.city}
                    onChange={(event) => update("city", event.target.value)}
                    className={fieldClass}
                  />
                </Field>
                <Field label="Kerala PIN code">
                  <input
                    required
                    pattern="6[0-9]{5}"
                    title="Enter a six-digit Kerala postal code beginning with 6"
                    inputMode="numeric"
                    maxLength={6}
                    value={details.pin}
                    onChange={(event) =>
                      update("pin", event.target.value.replace(/\D/g, ""))
                    }
                    className={fieldClass}
                  />
                </Field>
              </div>
              <WarrantyCheck
                compact
                source="Checkout"
                pincode={details.pin}
                className="mt-5"
              />
            </>
          )}
          {step === 1 && (
            <>
              <h2 className="mb-6 text-xl font-bold">Delivery & payment</h2>
              <div className="space-y-3">
                {["Kerala delivery", "Store pickup"].map((value) => (
                  <label
                    key={value}
                    className={`flex items-center justify-between gap-4 rounded-md border p-4 text-sm ${
                      details.delivery === value
                        ? "border-primary bg-secondary/40"
                        : "border-border"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="delivery"
                        checked={details.delivery === value}
                        onChange={() => update("delivery", value)}
                        className="accent-primary"
                      />
                      {value}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {value === "Store pickup"
                        ? "Free"
                        : "₹99 · 3–5 business days (demo)"}
                    </span>
                  </label>
                ))}
              </div>
              <h3 className="mb-4 mt-8 text-sm font-semibold">
                Payment method
              </h3>
              {[
                "Razorpay (UPI, Cards, NetBanking)",
                "Cash on delivery (Kerala)",
                "Simulated demo transaction",
              ].map((value) => (
                <label
                  key={value}
                  className={`mb-3 flex items-center justify-between rounded-xl border p-4 text-sm transition ${
                    details.payment === value
                      ? "border-primary bg-secondary/30 ring-1 ring-primary/20"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="payment"
                      checked={details.payment === value}
                      onChange={() => update("payment", value)}
                      className="accent-primary"
                    />
                    <span className="font-medium text-foreground">{value}</span>
                  </span>
                  {value.includes("Razorpay") && (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                      <ShieldCheck size={12} className="text-emerald-700" />
                      256-BIT SECURE
                    </span>
                  )}
                </label>
              ))}
              {details.payment.includes("Razorpay") && !RAZORPAY_KEY_ID && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
                  <strong>Developer Note:</strong>{" "}
                  <code>VITE_RAZORPAY_KEY_ID</code> is not configured in local
                  environment. Orders with this method will proceed in safe
                  simulated prototype mode.
                </p>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <h2 className="mb-6 text-xl font-bold">
                Make sure everything looks right.
              </h2>
              <div className="space-y-5 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Customer</p>
                  <p className="mt-1 font-medium">
                    {details.name} · {details.email}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Delivery</p>
                  <p className="mt-1">{details.delivery}</p>
                  <p className="mt-1 text-muted-foreground">
                    {details.address}, {details.city} · Kerala {details.pin}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payment</p>
                  <p className="mt-1 font-medium">{details.payment}</p>
                </div>
                <label className="flex items-start gap-2.5 rounded-xl bg-secondary/60 border border-primary/20 p-4 text-xs leading-6">
                  <input
                    required
                    type="checkbox"
                    className="mt-1 accent-primary"
                  />{" "}
                  <span>
                    {details.payment.includes("Razorpay") && RAZORPAY_KEY_ID
                      ? "I authorize IT HUB to process my order and initiate Razorpay 3D-Secure payment."
                      : "I confirm my order details and authorize IT HUB to record this order for fulfillment."}
                  </span>
                </label>
              </div>
            </>
          )}
          {error && (
            <p
              role="alert"
              className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600"
            >
              {error}
            </p>
          )}
          <div className="mt-8 flex justify-between gap-3">
            {step > 0 ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep(step - 1)}
              >
                Back
              </Button>
            ) : (
              <Link to="/cart" className="py-3 text-sm text-muted-foreground">
                Back to cart
              </Link>
            )}
            <Button disabled={busy} type="submit">
              {busy
                ? "Processing your order…"
                : step === 2
                  ? details.payment.includes("Razorpay") && RAZORPAY_KEY_ID
                    ? "Proceed to Razorpay"
                    : "Place order"
                  : "Continue"}
              <ArrowRight size={16} />
            </Button>
          </div>
        </form>
        <aside className="self-start rounded-lg bg-muted p-6">
          <h2 className="mb-5 text-lg font-bold">Your order</h2>
          {store.cart.map((item) => (
            <div
              key={item.id}
              className="mb-4 flex justify-between gap-3 text-xs"
            >
              <span>
                {item.name} × {item.quantity}
              </span>
              <span className="shrink-0 font-semibold">
                {money(item.price * item.quantity)}
              </span>
            </div>
          ))}
          <div className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
            <p className="flex justify-between">
              <span>Subtotal</span>
              {money(subtotal)}
            </p>
            <p className="flex justify-between">
              <span>Offer savings</span>
              <span className="text-emerald-700">−{money(discount)}</span>
            </p>
            {applied.length > 0 && (
              <p className="text-xs text-primary">{applied.join(", ")}</p>
            )}
            {appliedCoupon && (
              <p className="flex justify-between font-medium text-emerald-700">
                <span className="flex items-center gap-1.5">
                  <Tag size={13} /> Coupon ({appliedCoupon.coupon.code})
                </span>
                <span>−{money(appliedCoupon.discount)}</span>
              </p>
            )}
            <p className="flex justify-between">
              <span>Delivery</span>
              {money(shipping)}
            </p>
            <p className="flex justify-between border-t border-border pt-4 text-lg font-bold">
              <span>Total</span>
              {money(total)}
            </p>
          </div>

          {/* Have a Coupon? */}
          <div className="mt-6 border-t border-border pt-5">
            <p className="mb-2.5 text-xs font-semibold text-foreground">
              Have a Coupon?
            </p>
            {appliedCoupon ? (
              <div className="flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900">
                <div>
                  <p className="flex items-center gap-1.5 font-bold">
                    <Tag size={13} className="text-emerald-600" />
                    {appliedCoupon.coupon.code}
                  </p>
                  <p className="mt-0.5 text-[11px] text-emerald-700">
                    {appliedCoupon.coupon.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveCoupon}
                  className="rounded px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter coupon code"
                    value={couponInput}
                    onChange={(event) => {
                      setCouponInput(event.target.value.toUpperCase())
                      setCouponError("")
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        handleApplyCoupon()
                      }
                    }}
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs uppercase tracking-wider focus:border-primary focus:outline-none"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleApplyCoupon}
                    className="shrink-0 px-4 py-2 text-xs"
                  >
                    Apply
                  </Button>
                </div>
                {couponError && (
                  <p role="alert" className="mt-1.5 text-xs text-red-600">
                    {couponError}
                  </p>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </Page>
  )
}
export function OrderSuccess() {
  const { id } = useParams()
  const store = useStore()
  const order = store.orders.find((item) => item.id === id)
  if (!order)
    return (
      <Page>
        <Empty
          title="Order not found"
          description="Place a demo order to see its confirmation."
          to="/products"
        />
      </Page>
    )
  return (
    <Page>
      <div className="mx-auto max-w-2xl rounded-xl border border-border p-7 text-center md:p-12">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 size={32} />
        </div>
        <Badge tone="green">ORDER CONFIRMED</Badge>
        <h1 className="mt-5 text-3xl font-bold">
          Your next upgrade is on its way.
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Thanks, {order.name}. Your demo order has been placed.
        </p>
        <div className="my-7 rounded-lg bg-muted p-6 text-sm">
          <p className="text-xs text-muted-foreground">Order ID</p>
          <p className="mt-2 font-semibold">{order.id}</p>
          <p className="mt-4">
            {order.delivery === "Store pickup"
              ? "Store pickup · contact IT HUB"
              : "Estimated delivery: 3–5 business days (demo)"}
          </p>
          <p className="mt-2 font-bold">{money(order.total)}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <ActionLink to={`/track-order/${order.id}`}>
            Track order <ArrowRight size={16} />
          </ActionLink>
          <ActionLink secondary to="/products">
            Continue shopping
          </ActionLink>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Prototype only. No real purchase has been made.
        </p>
      </div>
    </Page>
  )
}
export function OrderTracking() {
  const { id } = useParams()
  const navigate = useNavigate()
  const store = useStore()
  const [query, setQuery] = useState(id || "")
  const order = store.orders.find((item) => item.id === id)
  return (
    <Page>
      <PageHeading
        title="Every step, right here."
        description="Follow your order from our hub to your home."
      />
      <form
        onSubmit={(event) => {
          event.preventDefault()
          navigate(`/track-order/${encodeURIComponent(query.trim())}`)
        }}
        className="mb-8 flex max-w-xl gap-3"
      >
        <input
          required
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Enter your order ID"
          aria-label="Order ID"
          className={fieldClass}
        />
        <Button type="submit">
          Track <Search size={16} />
        </Button>
      </form>
      {order ? (
        <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-lg border border-border p-7">
            <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">{order.id}</h2>
              <Badge>
                {order.status < 0 ? "Cancelled" : orderStatuses[order.status]}
              </Badge>
            </div>
            <Timeline steps={orderStatuses} current={order.status} />
          </div>
          <div className="space-y-6">
            <div className="rounded-lg bg-muted p-7">
              <h2 className="mb-5 text-lg font-bold">Delivery details</h2>
              <dl className="space-y-4 text-sm">
                {[
                  ["Shipping address", order.address],
                  [
                    "Courier",
                    order.status >= 4 ? "Demo courier" : "To be assigned",
                  ],
                  [
                    "Tracking ID",
                    order.status >= 4
                      ? `DEMO-${order.id.slice(-6)}`
                      : "Available after dispatch",
                  ],
                  [
                    "Expected delivery",
                    order.delivery === "Store pickup"
                      ? "Contact IT HUB for pickup"
                      : "3–5 business days after confirmation (demo)",
                  ],
                  ["Payment", order.payment],
                ].map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-xs text-muted-foreground">{key}</dt>
                    <dd className="mt-1">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="rounded-lg border border-border p-7">
              <h3 className="mb-4 font-bold">Items in your order</h3>
              {order.items.map((item) => (
                <p
                  key={item.id}
                  className="mb-3 flex justify-between gap-3 text-sm"
                >
                  <span>
                    {item.name} × {item.quantity}
                    <Link
                      to={`/support?view=warranty&order=${order.id}&product=${item.id}`}
                      className="mt-1 block text-xs font-semibold text-primary"
                    >
                      Help & Support →
                    </Link>
                  </span>
                  <span>{money(item.price * item.quantity)}</span>
                </p>
              ))}
              <p className="mt-4 flex justify-between border-t border-border pt-4 font-bold">
                <span>Total paid (demo)</span>
                {money(order.total)}
              </p>
            </div>
            <ActionLink secondary to="/support">
              Need help with this order?
            </ActionLink>
            <p className="text-xs text-muted-foreground">
              Statuses are simulated. Change them in Admin → Orders to explore
              the full flow.
            </p>
          </div>
        </div>
      ) : (
        <Empty
          title={id ? "We couldn’t find that order" : "Track your technology"}
          description={
            id
              ? "Check your order ID or find it in your account."
              : "Place a demo order and return here to follow its progress."
          }
          to={store.orders.length ? "/account/orders" : "/products"}
          label={store.orders.length ? "View my orders" : "Shop products"}
        />
      )}
    </Page>
  )
}
