// src/pages/Blog.tsx
// IT HUB — Technology Blog & Hardware Engineering Guides
// Dedicated customer-facing technology editorial section

import { useState, useEffect, useMemo } from "react"
import { Link, useParams, useNavigate } from "react-router"
import {
  Search,
  Calendar,
  Clock,
  User,
  ArrowRight,
  ArrowLeft,
  Tag,
  Share2,
  Check,
  BookOpen,
  Sparkles,
  ExternalLink,
  LoaderCircle,
  HelpCircle,
  ShieldCheck,
  Wrench,
  ShoppingBag,
} from "lucide-react"
import { Page, PageHeading, Button, Badge, Empty, fieldClass, containerClass } from "../components/ui"
import { useStore } from "../app/store"
import { fetchBlogArticles, fetchBlogArticleBySlug } from "../lib/blog"
import { type BlogArticle } from "../data/blog"

const CATEGORIES = [
  "All",
  "Hardware Reviews",
  "Repair & Maintenance",
  "Guides & Tutorials",
  "Industry News",
] as const

/**
 * Blog Landing Page component
 */
export default function Blog() {
  const [articles, setArticles] = useState<BlogArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>("All")
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    let isMounted = true
    fetchBlogArticles()
      .then((data) => {
        if (isMounted) {
          setArticles(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || "Failed to load technology articles.")
          setLoading(false)
        }
      })
    return () => {
      isMounted = false
    }
  }, [])

  const filteredArticles = useMemo(() => {
    return articles.filter((article) => {
      const matchesCategory =
        selectedCategory === "All" || article.category === selectedCategory
      const q = searchQuery.trim().toLowerCase()
      const matchesQuery =
        !q ||
        article.title.toLowerCase().includes(q) ||
        article.excerpt.toLowerCase().includes(q) ||
        article.tags.some((t) => t.toLowerCase().includes(q))
      return matchesCategory && matchesQuery
    })
  }, [articles, selectedCategory, searchQuery])

  const featuredArticle = filteredArticles[0]
  const remainingArticles = filteredArticles.slice(1)

  return (
    <Page>
      <PageHeading
        title="Technology Blog & Guides"
        description="Hardware reviews, repair diagnostics, buying guides, and technical insights from IT HUB Kothamangalam."
      />

      {/* Search & Category Filter Controls */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-3.5 text-muted-foreground" />
          <input
            type="search"
            aria-label="Search articles"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search guides, hardware reviews, tips…"
            className={`${fieldClass} pl-10 h-10 text-xs`}
          />
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <LoaderCircle className="mb-4 h-9 w-9 animate-spin text-primary" />
          <h3 className="text-base font-semibold text-foreground">Loading IT HUB articles…</h3>
          <p className="mt-1 text-xs text-muted-foreground">Retrieving latest guides and reviews</p>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="my-8 rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
          <h3 className="text-base font-bold text-destructive">Failed to load articles</h3>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <Button
            className="mt-4"
            onClick={() => {
              setLoading(true)
              setError(null)
              fetchBlogArticles({ force: true }).then((data) => {
                setArticles(data)
                setLoading(false)
              })
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredArticles.length === 0 && (
        <div className="my-12 text-center">
          <Empty
            title="No matching articles"
            description={
              searchQuery
                ? `No articles found matching "${searchQuery}". Try a different search term or category.`
                : "No articles are currently available in this category."
            }
          />
          {searchQuery && (
            <Button
              variant="secondary"
              className="mt-4"
              onClick={() => {
                setSearchQuery("")
                setSelectedCategory("All")
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}

      {/* Featured / Hero Article */}
      {!loading && !error && featuredArticle && (
        <div className="mb-12">
          <Link
            to={`/blog/${featuredArticle.slug}`}
            className="group grid overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:border-primary/50 hover:shadow-md md:grid-cols-2"
          >
            <div className="relative h-64 overflow-hidden bg-muted md:h-full min-h-[260px]">
              <img
                src={featuredArticle.image}
                alt={featuredArticle.imageAlt}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                loading="eager"
                decoding="async"
              />
              <span className="absolute left-4 top-4">
                <Badge tone="blue">{featuredArticle.category}</Badge>
              </span>
            </div>
            <div className="flex flex-col justify-between p-6 md:p-8">
              <div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar size={13} /> {featuredArticle.publishedAt}
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Clock size={13} /> {featuredArticle.readTimeMinutes} min read
                  </span>
                </div>
                <h2 className="mt-3 text-xl font-bold leading-snug text-foreground group-hover:text-primary transition md:text-2xl">
                  {featuredArticle.title}
                </h2>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground line-clamp-3">
                  {featuredArticle.excerpt}
                </p>
              </div>

              <div className="mt-6 flex items-center justify-between pt-4 border-t border-border/50 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{featuredArticle.author}</span>
                  <span className="text-[10px] text-muted-foreground">({featuredArticle.authorRole})</span>
                </div>
                <span className="flex items-center gap-1 font-semibold text-primary group-hover:translate-x-0.5 transition">
                  Read article <ArrowRight size={14} />
                </span>
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* Articles Grid */}
      {!loading && !error && remainingArticles.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {remainingArticles.map((article) => (
            <article
              key={article.id}
              className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xs transition hover:border-primary/40 hover:shadow-md"
            >
              <Link to={`/blog/${article.slug}`} className="relative h-48 overflow-hidden bg-muted">
                <img
                  src={article.image}
                  alt={article.imageAlt}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  loading="lazy"
                  decoding="async"
                />
                <span className="absolute left-3 top-3">
                  <Badge tone="blue">{article.category}</Badge>
                </span>
              </Link>
              <div className="flex flex-1 flex-col justify-between p-5">
                <div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} /> {article.publishedAt}
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {article.readTimeMinutes} min read
                    </span>
                  </div>
                  <Link to={`/blog/${article.slug}`}>
                    <h3 className="mt-2 text-base font-bold leading-snug text-foreground group-hover:text-primary transition line-clamp-2">
                      {article.title}
                    </h3>
                  </Link>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground line-clamp-3">
                    {article.excerpt}
                  </p>
                </div>

                <div className="mt-5 flex items-center justify-between pt-3 border-t border-border/40 text-xs">
                  <span className="text-[11px] font-medium text-foreground">{article.author}</span>
                  <Link
                    to={`/blog/${article.slug}`}
                    className="font-semibold text-primary flex items-center gap-1 text-[11px] group-hover:translate-x-0.5 transition"
                  >
                    Read <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </Page>
  )
}

/**
 * Article Detail Page component (/blog/:slug)
 */
export function ArticleDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const store = useStore()
  const [article, setArticle] = useState<BlogArticle | null>(null)
  const [related, setRelated] = useState<BlogArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let isMounted = true
    if (!slug) return

    setLoading(true)
    fetchBlogArticleBySlug(slug)
      .then((data) => {
        if (isMounted) {
          setArticle(data)
          setLoading(false)
        }
      })
      .catch(() => {
        if (isMounted) {
          setArticle(null)
          setLoading(false)
        }
      })

    fetchBlogArticles().then((all) => {
      if (isMounted) {
        const others = all.filter((a) => a.slug !== slug).slice(0, 3)
        setRelated(others)
      }
    })

    return () => {
      isMounted = false
    }
  }, [slug])

  // SEO metadata & canonical structured data injection
  useEffect(() => {
    if (article) {
      document.title = `${article.title} | IT HUB Technology Blog`
      const scriptId = "article-structured-data"
      let scriptTag = document.getElementById(scriptId) as HTMLScriptElement | null
      if (!scriptTag) {
        scriptTag = document.createElement("script")
        scriptTag.id = scriptId
        scriptTag.type = "application/ld+json"
        document.head.appendChild(scriptTag)
      }
      scriptTag.text = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: article.title,
        description: article.excerpt,
        image: article.image.startsWith("http")
          ? article.image
          : `${window.location.origin}${article.image}`,
        author: {
          "@type": "Person",
          name: article.author,
          jobTitle: article.authorRole,
        },
        publisher: {
          "@type": "Organization",
          name: "IT HUB",
          logo: {
            "@type": "ImageObject",
            url: `${window.location.origin}/images/ITHUBLOGO-1.jpeg`,
          },
        },
        datePublished: article.publishedAt,
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": window.location.href,
        },
      })
    }
    return () => {
      const tag = document.getElementById("article-structured-data")
      if (tag) tag.remove()
    }
  }, [article])

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      store.notify("Article link copied to clipboard!")
      setTimeout(() => setCopied(false), 2500)
    }
  }

  if (loading) {
    return (
      <Page>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <LoaderCircle className="mb-4 h-10 w-10 animate-spin text-primary" />
          <h3 className="text-base font-semibold text-foreground">Loading article…</h3>
          <p className="mt-1 text-xs text-muted-foreground">Retrieving article content</p>
        </div>
      </Page>
    )
  }

  if (!article) {
    return (
      <Page>
        <Empty
          title="Article not found"
          description="The requested guide or article does not exist or may have been moved."
          to="/blog"
        />
      </Page>
    )
  }

  return (
    <Page>
      {/* Breadcrumb & Navigation */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <span>/</span>
          <Link to="/blog" className="hover:text-foreground">Blog</Link>
          <span>/</span>
          <span className="text-foreground truncate max-w-xs">{article.category}</span>
        </div>
        <Link
          to="/blog"
          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
        >
          <ArrowLeft size={13} /> Back to all articles
        </Link>
      </div>

      <article className="mx-auto max-w-3xl">
        {/* Article Meta Header */}
        <header className="space-y-4 pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="blue">{article.category}</Badge>
            {article.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                <Tag size={10} /> {tag}
              </span>
            ))}
          </div>

          <h1 className="text-2xl font-bold leading-tight text-foreground sm:text-3xl lg:text-4xl">
            {article.title}
          </h1>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-b border-border/60 pb-5 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                <User size={16} />
              </div>
              <div>
                <p className="font-semibold text-foreground">{article.author}</p>
                <p className="text-[10px] text-muted-foreground">{article.authorRole}</p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1">
                <Calendar size={13} /> {article.publishedAt}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={13} /> {article.readTimeMinutes} min read
              </span>
              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-muted transition cursor-pointer"
                title="Copy article link"
              >
                {copied ? <Check size={12} className="text-emerald-600" /> : <Share2 size={12} />}
                {copied ? "Copied" : "Share"}
              </button>
            </div>
          </div>
        </header>

        {/* Featured Hero Image */}
        <div className="relative mb-8 overflow-hidden rounded-2xl border border-border bg-muted shadow-sm">
          <img
            src={article.image}
            alt={article.imageAlt}
            className="w-full max-h-[440px] object-cover"
            loading="eager"
            decoding="async"
          />
        </div>

        {/* Article Body */}
        <div
          className="prose prose-sm sm:prose-base dark:prose-invert max-w-none text-foreground/90 leading-relaxed space-y-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-3 [&_li]:mb-1.5 [&_strong]:font-semibold"
          dangerouslySetInnerHTML={{ __html: article.contentHtml }}
        />

        {/* Real Product & Service Callout Box */}
        {(article.relatedProductHandles || article.relatedServicePath) && (
          <aside
            aria-label="Related IT HUB Resources"
            className="my-10 rounded-2xl border border-primary/20 bg-primary/5 p-6 shadow-xs"
          >
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
              <Sparkles size={14} /> Recommended IT HUB Resources
            </div>
            <div className="mt-3 space-y-3">
              {article.relatedProductHandles && article.relatedProductHandles.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3.5 text-xs">
                  <div className="flex items-center gap-2.5">
                    <ShoppingBag size={16} className="text-primary shrink-0" />
                    <div>
                      <p className="font-semibold text-foreground">Featured In-Store Hardware</p>
                      <p className="text-[11px] text-muted-foreground">
                        Official manufacturer stock available for order in Kerala.
                      </p>
                    </div>
                  </div>
                  <Link
                    to={`/products/${article.relatedProductHandles[0]}`}
                    className="inline-flex items-center gap-1 font-semibold text-primary hover:underline shrink-0"
                  >
                    View Product Details <ArrowRight size={13} />
                  </Link>
                </div>
              )}

              {article.relatedServicePath && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3.5 text-xs">
                  <div className="flex items-center gap-2.5">
                    <Wrench size={16} className="text-emerald-700 shrink-0" />
                    <div>
                      <p className="font-semibold text-foreground">IT HUB Certified Service</p>
                      <p className="text-[11px] text-muted-foreground">
                        {article.relatedServiceLabel || "Hardware diagnostics and professional repairs."}
                      </p>
                    </div>
                  </div>
                  <Link
                    to={article.relatedServicePath}
                    className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline shrink-0"
                  >
                    Book Service Appointment <ArrowRight size={13} />
                  </Link>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Related Articles Section */}
        {related.length > 0 && (
          <div className="mt-14 pt-8 border-t border-border">
            <h2 className="text-lg font-bold text-foreground mb-6">More from IT HUB Blog</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {related.map((rel) => (
                <Link
                  key={rel.id}
                  to={`/blog/${rel.slug}`}
                  className="group flex flex-col justify-between rounded-xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-xs"
                >
                  <div>
                    <span className="text-[10px] font-semibold uppercase text-primary">
                      {rel.category}
                    </span>
                    <h3 className="mt-1 text-xs font-bold leading-snug text-foreground group-hover:text-primary transition line-clamp-2">
                      {rel.title}
                    </h3>
                  </div>
                  <span className="mt-3 text-[10px] text-muted-foreground">
                    {rel.publishedAt} · {rel.readTimeMinutes}m read
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>
    </Page>
  )
}
