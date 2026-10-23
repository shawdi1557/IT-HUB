import createDOMPurify from "dompurify"

function getPurifier() {
  if (typeof window !== "undefined") {
    if (typeof (createDOMPurify as any).sanitize === "function") {
      return createDOMPurify as any
    }
    try {
      return createDOMPurify(window as any)
    } catch {
      return null
    }
  }
  return null
}

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "strike",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "span",
  "div",
  "hr",
  "a",
]

const ALLOWED_ATTR = ["href", "target", "rel", "title", "class"]

/**
 * Sanitizes HTML content from Shopify (e.g. descriptionHtml)
 * Strips scripts, event handlers, iframes, and unsafe protocols while preserving
 * standard formatting tags (paragraphs, lists, headings, tables, links).
 */
export function sanitizeHtml(rawHtml: string): string {
  if (!rawHtml || typeof rawHtml !== "string") return ""

  const purifier = getPurifier()
  if (purifier && typeof purifier.sanitize === "function") {
    return purifier.sanitize(rawHtml, {
      USE_PROFILES: { html: true },
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
    })
  }

  // Safe fallback for SSR / non-DOM environments
  return rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/on\w+\s*=\s*(["'][^"']*["']|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "")
}
