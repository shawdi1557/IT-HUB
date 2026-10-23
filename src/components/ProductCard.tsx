import { useEffect, useState } from "react"
import { Link } from "react-router"
import {
  Heart,
  Plus,
  Eye,
  Star,
  Cpu,
  ShieldCheck,
  RefreshCw,
} from "lucide-react"
import { useStore } from "../app/store"
import { bestOffer, money, offerHeadline, type Product } from "../data/catalog"
import { Badge, Button, Modal, ActionLink } from "./ui"

export function ProductImage({
  product,
  src,
  className = "",
}: {
  product: Product
  src?: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const imageSrc =
    src || product.image || "/images/photo-1616440347437-b1c73416efc2.jpg"
  useEffect(() => setFailed(false), [imageSrc])
  return failed ? (
    <div className={`flex items-center justify-center bg-muted ${className}`}>
      <div className="text-center p-3">
        <Cpu size={40} className="mx-auto text-primary/70" />
        <p className="mt-2 text-xs font-medium text-muted-foreground truncate max-w-[160px]">
          {product.brand} · {product.category}
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
    />
  )
}
export default function ProductCard({ product }: { product: Product }) {
  const store = useStore()
  const [quick, setQuick] = useState(false)
  const deal = bestOffer(store.offers, product)
  const add = () =>
    store.addCart({
      id: product.id,
      productId: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
    })
  return (
    <>
      <article className="group relative overflow-hidden rounded-2xl border border-border bg-card transition duration-300 hover:border-primary/40 hover:shadow-sm">
        <div className="relative flex h-44 items-center justify-center bg-muted p-5 md:h-52">
          {(deal ||
            product.tag ||
            product.secondHand ||
            (product.stock > 0 &&
              product.stock <= (product.lowStockThreshold || 5))) && (
            <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1">
              {product.secondHand && (
                <Badge tone="amber">
                  <RefreshCw size={10} className="mr-1 inline text-amber-700" />
                  PRE-OWNED{product.condition ? ` · ${product.condition}` : ""}
                </Badge>
              )}
              {deal && <Badge tone="green">{offerHeadline(deal.offer)}</Badge>}
              {product.tag && !product.secondHand && (
                <Badge>{product.tag}</Badge>
              )}
              {product.stock > 0 &&
                product.stock <= (product.lowStockThreshold || 5) && (
                  <Badge tone="amber">Only {product.stock} left!</Badge>
                )}
            </div>
          )}
          <button
            aria-label={`Wishlist ${product.name}`}
            onClick={() => store.toggleWish(product.id)}
            className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-2 text-muted-foreground hover:text-primary"
          >
            <Heart
              size={16}
              className={
                store.wishlist.includes(product.id)
                  ? "fill-primary text-primary"
                  : ""
              }
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
            className="absolute bottom-3 right-3 rounded-full bg-white p-2 opacity-100 shadow-sm transition hover:text-primary md:opacity-0 md:group-hover:opacity-100"
          >
            <Eye size={16} />
          </button>
        </div>
        <div className="p-4 md:p-5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {product.brand} · {product.category}
          </p>
          <Link
            to={`/products/${product.id}`}
            className="line-clamp-2 min-h-10 text-sm font-semibold hover:text-primary"
          >
            {product.name}
          </Link>
          <div className="mt-2 flex items-center gap-1 text-[11px]">
            <Star size={12} className="fill-amber-400 text-amber-400" />
            {product.rating}
            <span className="ml-1 text-muted-foreground">Demo rating</span>
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Our price
              </p>
              <strong className="text-lg leading-tight">
                {money(deal ? deal.price : product.price)}
              </strong>
              {product.original > (deal ? deal.price : product.price) && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  MRP{" "}
                  <span className="line-through">
                    {money(product.original)}
                  </span>
                </p>
              )}
              {deal && (
                <p className="mt-0.5 line-clamp-1 text-[10px] font-semibold text-primary">
                  {deal.offer.name}
                </p>
              )}
            </div>
            <button
              disabled={product.availableForSale !== undefined ? !product.availableForSale : !product.stock}
              onClick={add}
              aria-label={`Add ${product.name} to cart`}
              className="rounded-md border border-border p-2.5 text-primary transition hover:bg-primary hover:text-white disabled:opacity-40"
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px]">
            {product.availableForSale !== undefined ? (
              product.availableForSale ? (
                <span className="text-emerald-700">● In stock</span>
              ) : (
                <span className="text-muted-foreground">● Out of stock</span>
              )
            ) : product.stock > 5 ? (
              <span className="text-emerald-700">● In stock</span>
            ) : product.stock > 0 ? (
              <span className="font-semibold text-amber-700">
                ● Only {product.stock} left!
              </span>
            ) : (
              <span className="text-muted-foreground">● Out of stock</span>
            )}
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <ShieldCheck size={11} className="text-primary" />
              {product.warranty || "Brand warranty"}
            </span>
          </div>
        </div>
      </article>
      <Modal open={quick} onOpenChange={setQuick} title={product.name}>
        <ProductImage
          product={product}
          className="mx-auto h-56 w-full rounded-md bg-muted p-5"
        />
        <div className="my-5 flex justify-between">
          <strong className="text-2xl">
            {money(deal ? deal.price : product.price)}
          </strong>
          <Badge
            tone={
              product.availableForSale !== undefined
                ? (product.availableForSale ? "green" : "gray")
                : (product.stock > 5 ? "green" : product.stock > 0 ? "amber" : "gray")
            }
          >
            {product.availableForSale !== undefined
              ? (product.availableForSale ? "In stock" : "Out of stock")
              : (product.stock > 5
                  ? "In stock"
                  : product.stock > 0
                    ? `Only ${product.stock} left!`
                    : "Out of stock")}
          </Badge>
        </div>
        <div className="mb-6 grid grid-cols-2 gap-3">
          {Object.entries(product.specs).map(([key, value]) => (
            <div key={key}>
              <p className="text-xs text-muted-foreground">{key}</p>
              <p className="text-sm font-medium">{value}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button disabled={product.availableForSale !== undefined ? !product.availableForSale : !product.stock} onClick={add}>
            Add to cart
          </Button>
          <ActionLink secondary to={`/products/${product.id}`}>
            View full details
          </ActionLink>
        </div>
      </Modal>
    </>
  )
}
