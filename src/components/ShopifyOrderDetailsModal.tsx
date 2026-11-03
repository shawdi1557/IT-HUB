// src/components/ShopifyOrderDetailsModal.tsx
// Interactive Customer Order Details Modal with authoritative Shopify fulfillment & tracking breakdown
// IT HUB — Kerala, India

import {
  X,
  Package,
  Truck,
  MapPin,
  Calendar,
  CreditCard,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { Badge, Button } from "./ui";
import { money } from "../data/catalog";
import {
  type ShopifyCustomerOrder,
  resolveOrderPresentationStatus,
  getOrderStatusBadgeTone,
} from "../lib/shopify-orders";

interface ShopifyOrderDetailsModalProps {
  order: ShopifyCustomerOrder | null;
  onClose: () => void;
}

export default function ShopifyOrderDetailsModal({
  order,
  onClose,
}: ShopifyOrderDetailsModalProps) {
  if (!order) return null;

  const presentationStatus = resolveOrderPresentationStatus(
    order.financial_status,
    order.fulfillment_status,
  );
  const badgeTone = getOrderStatusBadgeTone(presentationStatus);

  const formattedDate = new Date(order.created_at).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-details-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-white shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border bg-muted/40 p-6 md:p-7">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 id="order-details-title" className="text-xl font-bold text-foreground">
                Order {order.order_number}
              </h2>
              <Badge tone={badgeTone}>{presentationStatus}</Badge>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar size={13} className="shrink-0" /> Placed on {formattedDate}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="max-h-[70vh] overflow-y-auto p-6 md:p-7 space-y-6">
          {/* Tracking / Fulfillment Banner if available */}
          {order.tracking_number ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-emerald-950">
              <div className="flex items-start gap-3">
                <Truck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                      Shipment Details
                    </p>
                    {order.tracking_company && (
                      <span className="text-xs font-semibold text-emerald-700">
                        {order.tracking_company}
                      </span>
                    )}
                  </div>
                  <p className="text-xs">
                    Tracking Number:{" "}
                    <span className="font-mono font-bold">{order.tracking_number}</span>
                  </p>
                  {order.tracking_url && (
                    <div className="pt-1.5">
                      <a
                        href={order.tracking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 underline hover:text-emerald-900"
                      >
                        Track Shipment with Carrier <ExternalLink size={12} />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : presentationStatus === "Fulfilled" ? (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 text-xs text-emerald-900">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>All items have been fulfilled and dispatched by IT HUB.</span>
            </div>
          ) : presentationStatus === "Processing" ? (
            <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50/60 p-4 text-xs text-blue-900">
              <Clock size={16} className="text-blue-600 shrink-0" />
              <span>
                Your payment was received. Our warehouse is preparing and packing your items.
              </span>
            </div>
          ) : null}

          {/* Purchased Line Items */}
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Items Ordered ({order.line_items.length})
            </h3>
            <div className="divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden">
              {order.line_items.map((item, idx) => (
                <div key={item.id || idx} className="flex items-center gap-4 p-4">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/50 flex items-center justify-center">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="h-full w-full object-cover object-center"
                        loading="lazy"
                      />
                    ) : (
                      <Package size={22} className="text-muted-foreground/60" />
                    )}
                    <span className="absolute bottom-1 right-1 rounded-full bg-foreground/80 px-1.5 py-0.5 text-[9px] font-bold text-white leading-none">
                      ×{item.quantity}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-semibold text-foreground line-clamp-1">
                      {item.title}
                    </h4>
                    {item.variantTitle && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Variant: {item.variantTitle}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Qty: {item.quantity} · {money(item.price)} each
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-foreground">
                      {money(item.price * item.quantity)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Price Breakdown */}
          <div className="rounded-2xl border border-border bg-muted/30 p-5 space-y-2.5 text-xs">
            <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Payment Summary
            </h3>
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span className="font-medium text-foreground">{money(order.subtotal_price)}</span>
            </div>
            {order.total_discount > 0 && (
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Shopify Discounts Applied</span>
                <span>-{money(order.total_discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Delivery & Shipping</span>
              <span className="font-medium text-foreground">
                {order.total_shipping > 0 ? money(order.total_shipping) : "Free"}
              </span>
            </div>
            {order.total_tax > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Estimated Taxes</span>
                <span className="font-medium text-foreground">{money(order.total_tax)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-3 text-sm font-bold text-foreground">
              <span>Total Paid</span>
              <span className="text-base text-primary">{money(order.total_price)}</span>
            </div>
          </div>

          {/* Shipping Address */}
          {order.shipping_address && (
            <div className="rounded-2xl border border-border p-5 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-muted-foreground mb-1">
                <MapPin size={13} className="text-primary" /> Delivery Destination
              </div>
              {order.shipping_address.name && (
                <p className="font-semibold text-foreground">{order.shipping_address.name}</p>
              )}
              {order.shipping_address.address1 && (
                <p className="text-muted-foreground">{order.shipping_address.address1}</p>
              )}
              {order.shipping_address.address2 && (
                <p className="text-muted-foreground">{order.shipping_address.address2}</p>
              )}
              <p className="text-muted-foreground">
                {[
                  order.shipping_address.city,
                  order.shipping_address.province,
                  order.shipping_address.zip,
                  order.shipping_address.country,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>
          )}

          {/* Order source */}
          <div className="flex items-center gap-3 rounded-2xl bg-secondary/50 p-4 text-[11px] text-muted-foreground">
            <ShieldCheck size={18} className="text-primary shrink-0" />
            <span>Order details synchronized with Shopify.</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 p-5 md:px-7">
          <a
            href={`/support?view=warranty&order=${encodeURIComponent(order.order_number)}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <HelpCircle size={14} /> Need Help or Warranty Support?
          </a>
          <Button variant="secondary" onClick={onClose} className="px-5 text-xs">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
