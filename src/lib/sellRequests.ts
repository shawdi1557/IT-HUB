// src/lib/sellRequests.ts
// Supabase Service Integration for Customer Sell & Trade-in Hardware Requests
// IT HUB — Kerala, India

import { supabase, supabaseConfig } from "./supabase"
import type { SellCategory, ProductCondition, SellRequest, SellRequestStatus } from "../data/catalog"

export interface CreateSellRequestInput {
  userId: string
  customerName: string
  customerEmail: string
  customerPhone: string
  category: SellCategory
  brand: string
  model: string
  condition: ProductCondition
  description: string
  hasWarranty: boolean
  warrantyProvider?: string
  warrantyRemaining?: string
  warrantyDetails?: string
  expectedPrice?: number
  images: { name: string; file?: File; dataUrl?: string }[]
  invoice?: { name: string; file?: File; dataUrl?: string } | null
}

export interface SellRequestResult {
  ok: boolean
  id: string
  error?: string
  storageImages?: string[]
  storageInvoice?: string
}

/**
 * Uploads a file to Supabase Storage.
 * Uses path convention: {userId}/{requestId}/{filename}
 */
async function uploadToBucket(
  bucket: string,
  path: string,
  fileOrBase64: File | string,
  fallbackContentType = "image/jpeg",
): Promise<string | null> {
  if (!supabase) return null

  try {
    let body: Blob | File

    if (typeof fileOrBase64 === "string") {
      // Decode data URL or Base64 string to Blob
      if (fileOrBase64.startsWith("data:")) {
        const parts = fileOrBase64.split(",")
        const mimeMatch = parts[0].match(/:(.*?);/)
        const mime = mimeMatch ? mimeMatch[1] : fallbackContentType
        const binary = atob(parts[1])
        const array = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          array[i] = binary.charCodeAt(i)
        }
        body = new Blob([array], { type: mime })
      } else {
        return null
      }
    } else {
      body = fileOrBase64
    }

    const { error } = await supabase.storage.from(bucket).upload(path, body, {
      cacheControl: "3600",
      upsert: true,
    })

    if (error) {
      console.warn(`[Supabase Storage] Failed upload to ${bucket}/${path}:`, error.message)
      return null
    }

    const { data: pubData } = supabase.storage.from(bucket).getPublicUrl(path)
    return pubData?.publicUrl || path
  } catch (err) {
    console.warn(`[Supabase Storage] Exception uploading to ${bucket}/${path}:`, err)
    return null
  }
}

/**
 * Submits a new sell / trade-in request to Supabase.
 * Uploads photos to 'sell-request-photos' bucket and purchase invoices to 'customer-invoices'.
 * Gracefully falls back to local storage if Supabase credentials are not active.
 */
export async function submitSellRequest(
  input: CreateSellRequestInput,
): Promise<SellRequestResult> {
  const localId = `SELL-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
  const productName = `${input.brand} ${input.model}`.trim() || `${input.category} device`

  // If Supabase is not configured, return safe local ID with existing URLs
  if (!supabase || !supabaseConfig.isConfigured) {
    return {
      ok: true,
      id: localId,
      storageImages: input.images.map((img) => img.dataUrl || img.name),
      storageInvoice: input.invoice?.dataUrl || input.invoice?.name || undefined,
    }
  }

  try {
    // 1. Check authenticated user
    const { data: authData } = await supabase.auth.getUser()
    const authUserId = authData?.user?.id

    // If unauthenticated on Supabase, proceed with local-mode result
    if (!authUserId) {
      return {
        ok: true,
        id: localId,
        storageImages: input.images.map((img) => img.dataUrl || img.name),
        storageInvoice: input.invoice?.dataUrl || input.invoice?.name || undefined,
      }
    }

    const dbRequestId = crypto.randomUUID()

    // 2. Insert parent row into public.sell_requests
    const { error: insertError } = await supabase.from("sell_requests").insert({
      id: dbRequestId,
      customer_id: authUserId,
      category: input.category,
      product_name: productName,
      brand: input.brand,
      model: input.model,
      condition: input.condition,
      description: input.description,
      has_warranty: input.hasWarranty,
      warranty_provider: input.hasWarranty ? input.warrantyProvider : null,
      warranty_remaining: input.hasWarranty ? input.warrantyRemaining : null,
      warranty_details: input.hasWarranty ? input.warrantyDetails : null,
      expected_price: input.expectedPrice ?? null,
      status: "Pending",
    })

    if (insertError) {
      console.warn("[Supabase Database] sell_requests insert failed:", insertError.message)
      // Fallback cleanly to local ID
      return {
        ok: true,
        id: localId,
        storageImages: input.images.map((img) => img.dataUrl || img.name),
        storageInvoice: input.invoice?.dataUrl || input.invoice?.name || undefined,
      }
    }

    // 3. Upload device photos to 'sell-request-photos'
    const uploadedImages: string[] = []
    for (let i = 0; i < input.images.length; i++) {
      const img = input.images[i]
      const ext = img.name.split(".").pop() || "jpg"
      const storagePath = `${authUserId}/${dbRequestId}/photo_${i + 1}.${ext}`
      const targetPayload = img.file || img.dataUrl

      if (targetPayload) {
        const publicUrl = await uploadToBucket("sell-request-photos", storagePath, targetPayload)
        const finalPath = publicUrl || storagePath
        uploadedImages.push(finalPath)

        // Insert reference into sell_request_images
        await supabase.from("sell_request_images").insert({
          sell_request_id: dbRequestId,
          storage_path: finalPath,
          display_order: i,
        })
      }
    }

    // 4. Upload invoice document to 'customer-invoices' (if provided)
    let uploadedInvoicePath: string | undefined = undefined
    if (input.invoice) {
      const ext = input.invoice.name.split(".").pop() || "pdf"
      const invoiceStoragePath = `${authUserId}/${dbRequestId}/invoice.${ext}`
      const targetPayload = input.invoice.file || input.invoice.dataUrl

      if (targetPayload) {
        const invoiceUrl = await uploadToBucket(
          "customer-invoices",
          invoiceStoragePath,
          targetPayload,
          ext === "pdf" ? "application/pdf" : "image/jpeg",
        )
        uploadedInvoicePath = invoiceUrl || invoiceStoragePath

        // Insert reference into sell_request_documents
        await supabase.from("sell_request_documents").insert({
          sell_request_id: dbRequestId,
          document_type: "invoice",
          storage_path: uploadedInvoicePath,
        })
      }
    }

    return {
      ok: true,
      id: dbRequestId,
      storageImages: uploadedImages.length ? uploadedImages : input.images.map((img) => img.dataUrl || img.name),
      storageInvoice: uploadedInvoicePath,
    }
  } catch (err) {
    console.error("[Supabase Service] Unexpected error in submitSellRequest:", err)
    return {
      ok: true,
      id: localId,
      storageImages: input.images.map((img) => img.dataUrl || img.name),
      storageInvoice: input.invoice?.dataUrl || input.invoice?.name || undefined,
    }
  }
}

/**
 * Fetches the user's submitted sell requests from Supabase.
 */
export async function fetchUserSellRequests(userId?: string): Promise<SellRequest[]> {
  if (!supabase || !supabaseConfig.isConfigured) return []

  try {
    const { data: authData } = await supabase.auth.getUser()
    const currentUserId = authData?.user?.id || userId
    if (!currentUserId) return []

    const { data, error } = await supabase
      .from("sell_requests")
      .select(`
        id,
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
        sell_request_images (storage_path, display_order),
        sell_request_documents (storage_path)
      `)
      .order("created_at", { ascending: false })

    if (error || !data) {
      return []
    }

    return data.map((row: any): SellRequest => {
      const images = (row.sell_request_images || [])
        .sort((a: any, b: any) => a.display_order - b.display_order)
        .map((img: any) => img.storage_path)

      const doc = (row.sell_request_documents || [])[0]?.storage_path || ""

      return {
        id: row.id,
        userId: currentUserId,
        customerName: "",
        customerEmail: "",
        customerPhone: "",
        category: row.category as SellCategory,
        productName: row.product_name,
        brand: row.brand || "",
        model: row.model || "",
        condition: row.condition as ProductCondition,
        description: row.description || "",
        hasWarranty: Boolean(row.has_warranty),
        warrantyProvider: row.warranty_provider || "",
        warrantyRemaining: row.warranty_remaining || "",
        warrantyDetails: row.warranty_details || "",
        expectedPrice: row.expected_price ? Number(row.expected_price) : undefined,
        offeredPrice: row.offered_price ? Number(row.offered_price) : undefined,
        imagePaths: images.length ? images : ["/images/laptop.jpg"],
        invoicePath: doc,
        status: row.status as SellRequestStatus,
        adminNotes: row.admin_notes || "",
        submittedAt: row.created_at,
        updatedAt: row.updated_at,
      }
    })
  } catch (err) {
    console.warn("[Supabase] Error fetching sell requests:", err)
    return []
  }
}

