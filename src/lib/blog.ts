// src/lib/blog.ts
// Headless Blog Client & Content Resolution for IT HUB
// Connects to Shopify Storefront API when available with honest editorial fallback.

import { shopifyConfig, storefrontFetch } from "./shopify"
import { VERIFIED_BLOG_ARTICLES, type BlogArticle } from "../data/blog"

export interface ShopifyArticleNode {
  id: string
  title: string
  handle: string
  excerpt?: string
  excerptHtml?: string
  content?: string
  contentHtml?: string
  publishedAt: string
  authorV2?: {
    name?: string
  }
  image?: {
    url: string
    altText?: string
  } | null
  tags?: string[]
  blog?: {
    id: string
    title: string
    handle: string
  }
}

export const ARTICLES_QUERY = `
  query getArticles($first: Int!) {
    articles(first: $first, sortKey: PUBLISHED_AT, reverse: true) {
      edges {
        node {
          id
          title
          handle
          excerpt
          excerptHtml
          content
          contentHtml
          publishedAt
          authorV2 {
            name
          }
          image {
            url
            altText
          }
          tags
          blog {
            id
            title
            handle
          }
        }
      }
    }
  }
`

const BLOG_CACHE_TTL_MS = 60_000 // 60s bounded cache
let cachedArticles: { data: BlogArticle[]; timestamp: number } | null = null
let inFlightArticlesRequest: Promise<BlogArticle[]> | null = null

export function invalidateBlogCache(): void {
  cachedArticles = null
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>?/gm, "").trim()
}

function estimateReadTime(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 200))
}

export function mapShopifyArticleToModel(node: ShopifyArticleNode): BlogArticle {
  const rawContent = node.contentHtml || node.content || ""
  const rawExcerpt = node.excerptHtml
    ? stripHtml(node.excerptHtml)
    : node.excerpt || stripHtml(rawContent).slice(0, 160) + "..."
  const categoryTitle = (node.blog?.title || node.tags?.[0] || "Guides & Tutorials") as BlogArticle["category"]

  return {
    id: node.id,
    title: node.title,
    slug: node.handle,
    excerpt: rawExcerpt,
    contentHtml: rawContent,
    publishedAt: node.publishedAt ? node.publishedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
    author: node.authorV2?.name || "IT HUB Editorial",
    authorRole: "Technology Editor",
    image: node.image?.url || "/images/photo-1510519138101-570d1dca3d66.jpg",
    imageAlt: node.image?.altText || node.title,
    tags: node.tags || ["Technology", "IT HUB"],
    category: categoryTitle,
    readTimeMinutes: estimateReadTime(stripHtml(rawContent)),
    source: "shopify",
  }
}

/**
 * Retrieves blog articles, prioritizing Shopify Storefront API when configured,
 * and seamlessly falling back to verified IT HUB editorial technology guides.
 */
export async function fetchBlogArticles(options: { force?: boolean } = {}): Promise<BlogArticle[]> {
  if (!options.force && cachedArticles && Date.now() - cachedArticles.timestamp < BLOG_CACHE_TTL_MS) {
    return cachedArticles.data
  }

  if (inFlightArticlesRequest) {
    return inFlightArticlesRequest
  }

  inFlightArticlesRequest = (async (): Promise<BlogArticle[]> => {
    try {
      if (shopifyConfig.isConfigured) {
        const result = await storefrontFetch<{
          articles?: {
            edges: Array<{ node: ShopifyArticleNode }>
          }
        }>(ARTICLES_QUERY, { first: 20 })

        if (result.ok && result.data?.articles?.edges && result.data.articles.edges.length > 0) {
          const mapped = result.data.articles.edges.map((e) => mapShopifyArticleToModel(e.node))
          cachedArticles = { data: mapped, timestamp: Date.now() }
          return mapped
        }
      }

      // Editorial fallback when Shopify has no published blog articles or scope is not configured
      cachedArticles = { data: VERIFIED_BLOG_ARTICLES, timestamp: Date.now() }
      return VERIFIED_BLOG_ARTICLES
    } catch {
      cachedArticles = { data: VERIFIED_BLOG_ARTICLES, timestamp: Date.now() }
      return VERIFIED_BLOG_ARTICLES
    } finally {
      inFlightArticlesRequest = null
    }
  })()

  return inFlightArticlesRequest
}

/**
 * Retrieves a single article by slug/handle.
 */
export async function fetchBlogArticleBySlug(slug: string): Promise<BlogArticle | null> {
  if (!slug) return null
  const normalized = decodeURIComponent(slug).trim().toLowerCase()
  const articles = await fetchBlogArticles()
  return (
    articles.find((a) => a.slug.toLowerCase() === normalized || a.id.toLowerCase() === normalized) ||
    null
  )
}
