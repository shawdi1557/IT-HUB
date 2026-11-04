import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Heart, Plus, Eye, Cpu, ShieldCheck, RefreshCw } from "lucide-react";
import { useStore } from "../app/store";
import { bestOffer, money, offerHeadline, type Product } from "../data/catalog";
import { Badge, Button, Modal, ActionLink } from "./ui";
import { customerVisibleSpecs } from "../lib/builder/spec-schema";

export function ProductImage({
  product,
  src,
  className = "",
}: {
  product: Product;
  src?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const imageSrc = src || product.image || "/images/photo-1616440347437-b1c73416efc2.jpg";
  useEffect(() => setFailed(false), [imageSrc]);
  return failed ? (
    <div className={`flex items-center justify-center bg-muted ${className}`}>
      <div className="text-center p-3">
        <Cpu size={40} className="mx-auto text-primary/70" />
        <p className="mt-2 text-xs font-medium text-muted-foreground truncate max-w-[160px]">
          {product.brand ? `${product.brand} · ` : ""}
          {product.category}
        </p>
      </div>
    </div>
  ) : (
    <img
      src={imageSrc}
      alt={product.name}
      onError={() => setFailed(true)}
      className={`object-contain ${className}`}
      loading="lazy"
      decoding="async"
    />
  );
}
export default function ProductCard({ product }: { product: Product }) {
  const store = useStore();
  const [quick, setQuick] = useState(false);
  const deal = bestOffer(store.offers, product);
  const add = () =>
    store.addCart({
      id: product.id,
      productId: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
    });
  return (
    <>
      <article className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card transition duration-300 hover:border-primary/40 hover:shadow-sm min-w-0 w-full">
        <div className="relative flex h-36 min-[400px]:h-40 sm:h-44 md:h-52 items-center justify-center bg-muted p-3 sm:p-4 md:p-5 overflow-hidden shrink-0">
          {(deal ||
            product.tag ||
            product.secondHand ||
            (product.stock > 0 && product.stock <= (product.lowStockThreshold || 5))) && (
            <div className="absolute left-2.5 sm:left-3 top-2.5 sm:top-3 z-10 flex max-w-[calc(100%-46px)] flex-col items-start gap-1">
              {product.secondHand && (
                <Badge tone="amber">
                  <RefreshCw size={10} className="mr-1 inline text-amber-700 shrink-0" />
                  <span className="truncate">
                    PRE-OWNED{product.conditionStated ? ` · ${product.condition}` : ""}
                  </span>
                </Badge>
              )}
              {deal && (
                <Badge tone="green">
                  <span className="truncate">{offerHeadline(deal.offer)}</span>
                </Badge>
              )}
              {product.tag && !product.secondHand && (
                <Badge>
                  <span className="truncate">{product.tag}</span>
                </Badge>
              )}
              {product.stock > 0 && product.stock <= (product.lowStockThreshold || 5) && (
                <Badge tone="amber">
                  <span className="truncate">Only {product.stock} left!</span>
                </Badge>
              )}
            </div>
          )}
          <button
            aria-label={`Wishlist ${product.name}`}
            onClick={() => store.toggleWish(product.id)}
            className="absolute right-2.5 sm:right-3 top-2.5 sm:top-3 z-10 rounded-full bg-white/90 p-1.5 sm:p-2 text-muted-foreground hover:text-primary transition shadow-xs"
          >
            <Heart
              size={15}
              className={store.wishlist.includes(product.id) ? "fill-primary text-primary" : ""}
            />
          </button>
          <Link to={`/products/${product.id}`} className="h-full w-full">
            <ProductImage
              product={product}
              className="h-full w-full transition duration-500 group-hover:scale-105"
            />
          </Link>
          <button
            onClick={() => setQuick(true)}
            aria-label={`Quick view ${product.name}`}
            className="absolute bottom-2.5 sm:bottom-3 right-2.5 sm:right-3 rounded-full bg-white p-1.5 sm:p-2 opacity-100 shadow-sm transition hover:text-primary md:opacity-0 md:group-hover:opacity-100"
          >
            <Eye size={15} />
          </button>
        </div>
        <div className="flex flex-1 flex-col justify-between p-3 sm:p-4 md:p-5 min-w-0">
          <div>
            <p
              title={product.taxonomyCategory?.fullName || product.category}
              className="mb-1.5 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate"
            >
              {product.brand ? `${product.brand} · ` : ""}
              {product.category}
            </p>
            <Link
              to={`/products/${product.id}`}
              className="line-clamp-2 min-h-8 sm:min-h-10 text-xs sm:text-sm font-semibold hover:text-primary leading-snug"
            >
              {product.name}
            </Link>
          </div>
          <div className="mt-3 sm:mt-4 flex items-center justify-between gap-2 min-w-0">
            <div className="min-w-0 flex-1">
              <p className="text-[9px] sm:text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate">
                Our price
              </p>
              <strong className="block text-sm sm:text-base md:text-lg leading-tight font-extrabold truncate">
                {money(deal ? deal.price : product.price)}
              </strong>
              {product.original > (deal ? deal.price : product.price) && (
                <p className="mt-0.5 text-[10px] sm:text-[11px] text-muted-foreground truncate">
                  MRP <span className="line-through">{money(product.original)}</span>
                </p>
              )}
              {deal && (
                <p className="mt-0.5 line-clamp-1 text-[9px] sm:text-[10px] font-semibold text-primary truncate">
                  {deal.offer.name}
                </p>
              )}
            </div>
            <button
              disabled={
                product.availableForSale !== undefined ? !product.availableForSale : !product.stock
              }
              onClick={add}
              aria-label={`Add ${product.name} to cart`}
              className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl border border-border text-primary transition hover:bg-primary hover:text-white disabled:opacity-40 active:scale-95"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="mt-2.5 sm:mt-3 flex flex-col min-[380px]:flex-row min-[380px]:items-center justify-between gap-1 text-[9px] sm:text-[10px]">
            <div className="shrink-0 truncate">
              {product.availableForSale !== undefined ? (
                product.availableForSale ? (
                  <span className="text-emerald-700">● In stock</span>
                ) : (
                  <span className="text-muted-foreground">● Out of stock</span>
                )
              ) : product.stock > 5 ? (
                <span className="text-emerald-700">● In stock</span>
              ) : product.stock > 0 ? (
                <span className="font-semibold text-amber-700">● Only {product.stock} left!</span>
              ) : (
                <span className="text-muted-foreground">● Out of stock</span>
              )}
            </div>
            {(product.specs?.Warranty || product.warranty) && (
              <span className="inline-flex items-center gap-1 text-muted-foreground truncate min-w-0">
                <ShieldCheck size={11} className="text-primary shrink-0" />
                <span className="truncate">{product.specs?.Warranty || product.warranty}</span>
              </span>
            )}
          </div>
        </div>
      </article>
      <Modal open={quick} onOpenChange={setQuick} title={product.name}>
        <ProductImage product={product} className="mx-auto h-56 w-full rounded-md bg-muted p-5" />
        <div className="my-5 flex justify-between">
          <strong className="text-2xl">{money(deal ? deal.price : product.price)}</strong>
          <Badge
            tone={
              product.availableForSale !== undefined
                ? product.availableForSale
                  ? "green"
                  : "gray"
                : product.stock > 5
                  ? "green"
                  : product.stock > 0
                    ? "amber"
                    : "gray"
            }
          >
            {product.availableForSale !== undefined
              ? product.availableForSale
                ? "In stock"
                : "Out of stock"
              : product.stock > 5
                ? "In stock"
                : product.stock > 0
                  ? `Only ${product.stock} left!`
                  : "Out of stock"}
          </Badge>
        </div>
        <div className="mb-6 grid grid-cols-2 gap-3">
          {Object.entries(customerVisibleSpecs(product.specs)).map(([key, value]) => (
            <div key={key}>
              <p className="text-xs text-muted-foreground">{key}</p>
              <p className="text-sm font-medium">{value}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={
              product.availableForSale !== undefined ? !product.availableForSale : !product.stock
            }
            onClick={add}
          >
            Add to cart
          </Button>
          <ActionLink secondary to={`/products/${product.id}`}>
            View full details
          </ActionLink>
        </div>
      </Modal>
    </>
  );
}
