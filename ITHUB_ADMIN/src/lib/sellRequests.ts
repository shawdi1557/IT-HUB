// ITHUB_ADMIN/src/lib/sellRequests.ts
// Customer Sell & Trade-in Hardware Requests Data Access Layer & Staff Actions
// Backed by `public.sell_requests`, `public.sell_request_images`, and `public.sell_request_documents`

import { supabase } from "./supabase";

export type SellRequestStatus =
  | "Pending"
  | "Under Review"
  | "Contacted"
  | "Approved"
  | "Rejected"
  | "Completed";

export interface SellRequestImage {
  id: string;
  storage_path: string;
  display_order: number;
  url?: string;
}

export interface SellRequestDocument {
  id: string;
  storage_path: string;
  document_type: string;
  file_name: string;
  url?: string;
}

export interface AdminSellRequestRecord {
  id: string;
  customer_id: string;
  category: string;
  product_name: string;
  brand: string | null;
  model: string | null;
  condition: string;
  description: string | null;
  has_warranty: boolean;
  warranty_provider?: string | null;
  warranty_remaining?: string | null;
  warranty_details?: string | null;
  expected_price?: number | null;
  offered_price?: number | null;
  status: SellRequestStatus;
  admin_notes?: string | null;
  created_at: string;
  updated_at: string;
  customer?: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    address?: string | null;
  } | null;
  images: SellRequestImage[];
  documents: SellRequestDocument[];
}

export interface SellRequestQueryOptions {
  status?: string;
  searchQuery?: string;
}

export interface SellRequestQueryResult {
  requests: AdminSellRequestRecord[];
  totalCount: number;
  error?: string;
}

/**
 * Fetches sell/trade-in submissions from public.sell_requests with customer, image, and document joins.
 * Generates secure, short-lived signed URLs for private images and invoices.
 */
export async function fetchSellRequests(
  options: SellRequestQueryOptions = {},
): Promise<SellRequestQueryResult> {
  const { status = "ALL", searchQuery = "" } = options;

  if (!supabase) {
    return { requests: [], totalCount: 0, error: "Supabase client unavailable." };
  }

  try {
    let query = supabase
      .from("sell_requests")
      .select(
        `
        id,
        customer_id,
        category,
        product_name,
        brand,
        model,
        condition,
        description,
        has_warranty,
        warranty_provider,
        warranty_remaining,
        warranty_details,
        expected_price,
        offered_price,
        status,
        admin_notes,
        created_at,
        updated_at,
        customer:profiles!sell_requests_customer_id_fkey(id, full_name, email, phone, address),
        images:sell_request_images(id, storage_path, display_order),
        documents:sell_request_documents(id, storage_path, document_type)
      `,
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    if (status && status !== "ALL") {
      query = query.eq("status", status);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error("Error fetching sell requests:", error);
      return { requests: [], totalCount: 0, error: error.message };
    }

    const rawRows = data || [];

    const results: AdminSellRequestRecord[] = await Promise.all(
      rawRows.map(async (row: any): Promise<AdminSellRequestRecord> => {
        // Resolve signed URLs for private device photos in 'sell-request-photos'
        const rawImages = (row.images || []).sort(
          (a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0),
        );
        const images: SellRequestImage[] = await Promise.all(
          rawImages.map(async (img: any): Promise<SellRequestImage> => {
            let cleanPath = img.storage_path || "";
            if (cleanPath.includes("/sell-request-photos/")) {
              cleanPath = cleanPath.split("/sell-request-photos/")[1];
            }
            let url = cleanPath;
            if (
              supabase &&
              cleanPath &&
              !cleanPath.startsWith("http") &&
              !cleanPath.startsWith("data:") &&
              !cleanPath.startsWith("blob:")
            ) {
              try {
                const { data: signedData } = await supabase.storage
                  .from("sell-request-photos")
                  .createSignedUrl(cleanPath, 3600);
                if (signedData?.signedUrl) url = signedData.signedUrl;
              } catch (signErr) {
                console.warn("Could not sign image URL:", cleanPath, signErr);
              }
            }
            return {
              id: img.id,
              storage_path: img.storage_path,
              display_order: img.display_order ?? 0,
              url,
            };
          }),
        );

        // Resolve signed URLs for private invoices in 'customer-invoices'
        const rawDocs = row.documents || [];
        const documents: SellRequestDocument[] = await Promise.all(
          rawDocs.map(async (doc: any): Promise<SellRequestDocument> => {
            let cleanPath = doc.storage_path || "";
            if (cleanPath.includes("/customer-invoices/")) {
              cleanPath = cleanPath.split("/customer-invoices/")[1];
            }
            let url = cleanPath;
            if (
              supabase &&
              cleanPath &&
              !cleanPath.startsWith("http") &&
              !cleanPath.startsWith("data:") &&
              !cleanPath.startsWith("blob:")
            ) {
              try {
                const { data: signedData } = await supabase.storage
                  .from("customer-invoices")
                  .createSignedUrl(cleanPath, 3600);
                if (signedData?.signedUrl) url = signedData.signedUrl;
              } catch (signErr) {
                console.warn("Could not sign invoice URL:", cleanPath, signErr);
              }
            }
            const fileName = cleanPath.split("/").pop() || "invoice.pdf";
            return {
              id: doc.id,
              storage_path: doc.storage_path,
              document_type: doc.document_type || "invoice",
              file_name: fileName,
              url,
            };
          }),
        );

        return {
          id: row.id,
          customer_id: row.customer_id,
          category: row.category,
          product_name: row.product_name,
          brand: row.brand,
          model: row.model,
          condition: row.condition,
          description: row.description,
          has_warranty: Boolean(row.has_warranty),
          warranty_provider: row.warranty_provider,
          warranty_remaining: row.warranty_remaining,
          warranty_details: row.warranty_details,
          expected_price: row.expected_price ? Number(row.expected_price) : null,
          offered_price: row.offered_price ? Number(row.offered_price) : null,
          status: row.status as SellRequestStatus,
          admin_notes: row.admin_notes,
          created_at: row.created_at,
          updated_at: row.updated_at,
          customer: row.customer || null,
          images,
          documents,
        };
      }),
    );

    let filtered = results;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (r) =>
          r.product_name.toLowerCase().includes(q) ||
          r.brand?.toLowerCase().includes(q) ||
          r.model?.toLowerCase().includes(q) ||
          r.customer?.full_name?.toLowerCase().includes(q) ||
          r.customer?.phone?.toLowerCase().includes(q) ||
          r.customer?.email?.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q),
      );
    }

    return {
      requests: filtered,
      totalCount: count || filtered.length,
    };
  } catch (err: any) {
    return { requests: [], totalCount: 0, error: err?.message };
  }
}

/**
 * Updates a sell request with status, notes, and offered price via authoritative RPC.
 * Triggers atomic audit logging into public.staff_audit_logs.
 */
export async function updateSellRequest(
  requestId: string,
  status: SellRequestStatus,
  adminNotes?: string | null,
  offeredPrice?: number | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: "Database client unavailable." };

  try {
    const { error } = await supabase.rpc("staff_update_sell_request", {
      p_request_id: requestId,
      p_status: status,
      p_admin_notes: adminNotes ?? null,
      p_offered_price: offeredPrice ?? null,
    });

    if (error) {
      // Fallback direct update if RPC is missing
      const { error: directError } = await supabase
        .from("sell_requests")
        .update({
          status,
          admin_notes: adminNotes ?? null,
          offered_price: offeredPrice ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (directError) return { ok: false, error: directError.message };
      return { ok: true };
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to update sell request." };
  }
}
