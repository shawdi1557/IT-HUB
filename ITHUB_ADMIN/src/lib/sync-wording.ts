// ITHUB_ADMIN/src/lib/sync-wording.ts
// Stage 4B-6: what each Shopify sync state and failure means, in words a shop assistant understands, and whether a
// "synced" record really reached Shopify. Import-free, so a unit test (S4B6-UI-2) can check it.

export type ListingState =
  | "not_synced"
  | "queued"
  | "syncing"
  | "synced"
  | "failed"
  | "retry_pending"
  | "superseded";
export type DisplayTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface StateWording {
  label: string;
  explanation: string;
  tone: DisplayTone;
}

/**
 * A job counts as written to the real store only when the function recorded a live write. A stand-in write (tests,
 * rehearsals) or a record without that marker is never shown as "in Shopify".
 */
export function reachedRealShopify(
  job: { status: string; shopify_response?: { mode?: string } | null } | null | undefined,
) {
  return Boolean(job && job.status === "synced" && job.shopify_response?.mode === "live");
}

export function stateWording(
  state: ListingState,
  latestJob?: {
    status: string;
    shopify_response?: { mode?: string } | null;
    next_attempt_at?: string | null;
  } | null,
): StateWording {
  switch (state) {
    case "synced":
      return reachedRealShopify(latestJob)
        ? {
            label: "Up to date in Shopify",
            explanation: "Shopify holds this listing's current values.",
            tone: "success",
          }
        : {
            label: "Test record only",
            explanation:
              "This was a test run against a stand-in. Nothing was sent to the real Shopify store.",
            tone: "neutral",
          };
    case "queued":
      return {
        label: "Waiting to send",
        explanation: "It will be sent to Shopify shortly.",
        tone: "info",
      };
    case "syncing":
      return {
        label: "Sending now",
        explanation: "The values are being sent to Shopify.",
        tone: "info",
      };
    case "retry_pending":
      return {
        label: "Will try again",
        explanation: latestJob?.next_attempt_at
          ? `Shopify didn't accept it yet. The next try is at ${new Date(latestJob.next_attempt_at).toLocaleTimeString()}.`
          : "Shopify didn't accept it yet. It will be tried again automatically.",
        tone: "warning",
      };
    case "failed":
      return {
        label: "Couldn't send",
        explanation: "See the reason below. Fix it, then send again.",
        tone: "danger",
      };
    case "superseded":
      return {
        label: "Replaced",
        explanation: "Newer values were queued, so this older request was dropped.",
        tone: "neutral",
      };
    default:
      return {
        label: "Not sent yet",
        explanation: "Shopify doesn't have this listing's current values.",
        tone: "neutral",
      };
  }
}

/** A failure in plain words, with what to do about it. */
export function failureWording(
  error: { code?: string; message?: string } | null | undefined,
): string {
  switch (error?.code) {
    case "admin_not_configured":
      return "Shopify isn't connected in this environment. An administrator must add the Shopify Admin credential before anything can be sent. Nothing was sent.";
    case "shopify_auth_failed":
      return "Shopify refused the app's credentials. An administrator can run Test connection to see why. Nothing was sent.";
    case "writes_disabled":
      return "Sending to Shopify is switched off in this environment. Nothing was sent.";
    case "throttled":
      return "Shopify was busy. It will try again automatically.";
    case "shopify_unavailable":
    case "network_error":
      return "Shopify couldn't be reached. Try again in a few minutes.";
    case "shopify_access_denied":
      return "Shopify refused the credential. It may be wrong, or it may lack permission to change products.";
    case "variant_specific_unsupported":
      return "This product has several variants, and Shopify keeps these values per product. Values can be sent only for a product with a single variant.";
    case "variant_not_on_product":
      return "The linked variant isn't on this product in Shopify. Check the link on the model's page.";
    case "product_not_found":
      return "Shopify has no product with this ID. Check the product ID on the model's page.";
    case "shopify_rejected_values":
      return "Shopify rejected the values, so nothing was changed. The details below say which.";
    case "shopify_unconfirmed":
      return "Shopify didn't confirm every value. Send it again.";
    case "specification_changed":
      return "The values changed after this was queued. Send it again to use the latest values.";
    default:
      return error?.message
        ? `${error.message}.`.replace(/\.\.$/, ".")
        : "Something went wrong. Try again.";
  }
}

/** A model's name with its manufacturer, without repeating it: "AMD" + "AMD Ryzen 5 5600" reads "AMD Ryzen 5 5600". */
export function modelLabel(manufacturer: string | null | undefined, modelName: string): string {
  const maker = (manufacturer ?? "").trim();
  if (!maker) return modelName;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return norm(modelName).startsWith(norm(maker)) ? modelName : `${maker} ${modelName}`;
}

/**
 * Whether trying a failed send again can help now. A send refused because this environment has no Shopify Admin
 * credential, or has sending switched off, fails the same way until an administrator changes that.
 */
export function retryHelps(
  error: { code?: string } | null | undefined,
  environment: { adminConfigured: boolean; writesEnabled: boolean },
): boolean {
  if (error?.code === "admin_not_configured" && !environment.adminConfigured) return false;
  if (error?.code === "writes_disabled" && !environment.writesEnabled) return false;
  return true;
}

/** What the read-only connection check found, for an administrator. */
export function connectionWording(code: string | null | undefined): string {
  switch (code) {
    case null:
    case undefined:
      return "Connected. Shopify accepted the app and answered a read-only query.";
    case "not_configured":
      return "The app's Client ID and Client Secret aren't set for this environment in the server's secrets.";
    case "shop_domain_invalid":
      return "The store setting isn't the shop's <name>.myshopify.com domain (SHOPIFY_STORE_DOMAIN).";
    case "shop_not_permitted":
      return "Shopify refused: the app and the store must belong to the same Shopify organization, and the app must be installed on the store.";
    case "app_not_installed":
      return "The app isn't installed on the store. Install it from the Shopify Dev Dashboard (Installs → Install app).";
    case "invalid_client":
      return "Shopify didn't accept the Client ID or Client Secret. Check both, or rotate the secret in the Dev Dashboard and update the server's secret.";
    case "token_request_failed":
    case "token_response_invalid":
      return "Shopify didn't give an access token. Check the app's installation and credentials.";
    case "shopify_unreachable":
      return "Shopify couldn't be reached. Try again in a few minutes.";
    case "access_denied":
      return "Connected, but the app can't read products. Add read_products to a new app version, release it, and approve it on the store.";
    case "query_failed":
      return "Connected, but Shopify refused the read-only query.";
    default:
      return "The connection check failed.";
  }
}
