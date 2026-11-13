// supabase/functions/_shared/shopify-admin-auth.ts
// Shopify Admin API access for an app created in the Shopify Dev Dashboard, using the client credentials grant
// (https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant):
//
//   POST https://{shop}.myshopify.com/admin/oauth/access_token
//   Content-Type: application/x-www-form-urlencoded
//   grant_type=client_credentials&client_id=…&client_secret=…
//   → {"access_token": "…", "scope": "read_products", "expires_in": 86399}
//
// The token lasts 24 hours and there is no refresh token: a new one is requested the same way. It carries the scopes
// the store granted to the app's installation (a `scope` parameter is ignored by Shopify, so none is sent). It works
// only when the app is installed on the store and both belong to the same Shopify organization (otherwise
// `shop_not_permitted`).
//
// Server-side only. The client secret and the tokens live in Edge Function secrets and this module's memory; they are
// never logged, returned to a caller or put in an error. Errors carry only a short code.

export type ShopifyAuthErrorCode =
  | "not_configured"
  | "shop_domain_invalid"
  | "shop_not_permitted"
  | "app_not_installed"
  | "invalid_client"
  | "token_request_failed"
  | "token_response_invalid"
  | "shopify_unreachable";

export class ShopifyAuthError extends Error {
  constructor(
    public code: ShopifyAuthErrorCode,
    /** HTTP status of Shopify's answer, when there was one. */
    public status: number | null = null,
    /** Shopify's own short error code (letters and underscores only), when it gave one. */
    public shopifyCode: string | null = null,
  ) {
    super(code);
  }
}

/**
 * The shop's permanent `<name>.myshopify.com` domain from a setting that may be just the name, the domain, or an https
 * URL of it. Anything else (a custom domain, a path, another host) is refused: tokens are only ever requested from
 * the shop's own myshopify.com host.
 */
export function shopifyShopDomain(value: string | null | undefined): string | null {
  const text = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https:\/\//, "")
    .replace(/\/+$/, "");
  if (/^[a-z0-9][a-z0-9-]{0,62}$/.test(text)) return `${text}.myshopify.com`;
  if (/^[a-z0-9][a-z0-9-]{0,62}\.myshopify\.com$/.test(text)) return text;
  return null;
}

export interface AdminTokenProvider {
  /** A valid access token, requested or reused. */
  token(): Promise<string>;
  /** Forget the cached token (Shopify refused it), so the next call requests a new one. */
  invalidate(): void;
  /** The scopes Shopify granted with the current token, or null before the first token. */
  grantedScopes(): string[] | null;
  /** Seconds until the current token expires, or null before the first token. */
  expiresInSeconds(): number | null;
}

interface CachedToken {
  token: string;
  scopes: string[];
  expiresAt: number;
}

/** Tokens per shop and app, shared by the requests a function instance serves. */
const CACHE = new Map<string, CachedToken>();
const IN_FLIGHT = new Map<string, Promise<CachedToken>>();

/** Clears every cached token (tests). */
export function clearAdminTokenCache() {
  CACHE.clear();
  IN_FLIGHT.clear();
}

const shopifyErrorCode = (body: unknown): string | null => {
  const raw =
    body && typeof body === "object"
      ? ((body as Record<string, unknown>).error ?? (body as Record<string, unknown>).errors)
      : null;
  const text = typeof raw === "string" ? raw : "";
  const match = text.match(/[a-z_]{3,40}/);
  return match ? match[0] : null;
};

export function clientCredentialsProvider(options: {
  shop: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Renew this many seconds before Shopify's stated expiry. */
  marginSeconds?: number;
}): AdminTokenProvider {
  const shop = shopifyShopDomain(options.shop);
  if (!shop) throw new ShopifyAuthError("shop_domain_invalid");
  if (!options.clientId || !options.clientSecret) throw new ShopifyAuthError("not_configured");
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const margin = (options.marginSeconds ?? 300) * 1000;
  const key = `${shop}|${options.clientId}`;

  const request = async (): Promise<CachedToken> => {
    let res: Response;
    try {
      res = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: options.clientId,
          client_secret: options.clientSecret,
        }).toString(),
      });
    } catch {
      throw new ShopifyAuthError("shopify_unreachable");
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      const code = shopifyErrorCode(body);
      if (code === "shop_not_permitted")
        throw new ShopifyAuthError("shop_not_permitted", res.status, code);
      if (code === "app_not_installed")
        throw new ShopifyAuthError("app_not_installed", res.status, code);
      if (code === "invalid_client" || res.status === 401) {
        throw new ShopifyAuthError("invalid_client", res.status, code);
      }
      throw new ShopifyAuthError(
        res.status >= 500 ? "shopify_unreachable" : "token_request_failed",
        res.status,
        code,
      );
    }
    const data = (body ?? {}) as Record<string, unknown>;
    const token = typeof data.access_token === "string" ? data.access_token : "";
    const expiresIn =
      typeof data.expires_in === "number" && data.expires_in > 0 ? data.expires_in : 0;
    if (!token || !expiresIn) throw new ShopifyAuthError("token_response_invalid", res.status);
    const scopes =
      typeof data.scope === "string"
        ? data.scope
            .split(",")
            .map((s) => s.trim())
            .filter((s) => /^[a-z_]{1,60}$/.test(s))
        : [];
    return { token, scopes, expiresAt: now() + expiresIn * 1000 };
  };

  const current = () => {
    const cached = CACHE.get(key);
    return cached && cached.expiresAt - margin > now() ? cached : null;
  };

  return {
    async token() {
      const cached = current();
      if (cached) return cached.token;
      let pending = IN_FLIGHT.get(key);
      if (!pending) {
        pending = request().finally(() => IN_FLIGHT.delete(key));
        IN_FLIGHT.set(key, pending);
      }
      const fresh = await pending;
      CACHE.set(key, fresh);
      return fresh.token;
    },
    invalidate() {
      CACHE.delete(key);
    },
    grantedScopes() {
      return CACHE.get(key)?.scopes ?? null;
    },
    expiresInSeconds() {
      const cached = CACHE.get(key);
      return cached ? Math.max(0, Math.round((cached.expiresAt - now()) / 1000)) : null;
    },
  };
}

export interface AdminGraphqlAnswer {
  status: number;
  retryAfter: string | null;
  /** The API version Shopify actually served (it falls forward from an unsupported one). */
  apiVersion: string | null;
  body: any;
}

/**
 * One Admin GraphQL request with a token from the provider. If Shopify refuses the token (401), it's forgotten, a new
 * one is requested and the request is sent once more.
 */
export async function adminGraphql(
  provider: AdminTokenProvider,
  shop: string,
  apiVersion: string,
  query: string,
  variables: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<AdminGraphqlAnswer> {
  const domain = shopifyShopDomain(shop);
  if (!domain) throw new ShopifyAuthError("shop_domain_invalid");
  const send = async () => {
    const token = await provider.token();
    const res = await fetchImpl(`https://${domain}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return {
      status: res.status,
      retryAfter: res.headers.get("Retry-After"),
      apiVersion: res.headers.get("X-Shopify-API-Version"),
      body,
    };
  };
  const first = await send();
  if (first.status !== 401) return first;
  provider.invalidate();
  return await send();
}

export type AdminAuthMode = "client_credentials" | "static_token" | "none";

/**
 * How this environment reaches the Admin API. A Dev Dashboard app's client credentials come first; a static token
 * (SHOPIFY_ADMIN_ACCESS_TOKEN, from a legacy custom app) is still accepted if that's all there is.
 */
export function adminAuthFromEnv(env: (name: string) => string): {
  mode: AdminAuthMode;
  shop: string | null;
  problem: ShopifyAuthErrorCode | null;
} {
  const rawShop = env("SHOPIFY_STORE_DOMAIN") || env("VITE_SHOPIFY_STORE_DOMAIN");
  const shop = shopifyShopDomain(rawShop);
  const clientId = env("SHOPIFY_ADMIN_CLIENT_ID");
  const clientSecret = env("SHOPIFY_ADMIN_CLIENT_SECRET");
  const staticToken = env("SHOPIFY_ADMIN_ACCESS_TOKEN");
  if (clientId || clientSecret) {
    if (!clientId || !clientSecret) return { mode: "none", shop, problem: "not_configured" };
    if (!shop) return { mode: "none", shop: null, problem: "shop_domain_invalid" };
    return { mode: "client_credentials", shop, problem: null };
  }
  if (staticToken) {
    if (!shop) return { mode: "none", shop: null, problem: "shop_domain_invalid" };
    return { mode: "static_token", shop, problem: null };
  }
  return {
    mode: "none",
    shop,
    problem: rawShop && !shop ? "shop_domain_invalid" : "not_configured",
  };
}
