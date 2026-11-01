// src/lib/certificates.ts
// Customer Storefront — Authoritative Partner Certificates Data Layer
// Fetches published certificates from PostgreSQL public.partner_certificates with Realtime sync

import { supabase } from "./supabase";
import { type CertificateItem, initialCertificates } from "../data/catalog";

export async function fetchPublishedCertificates(): Promise<CertificateItem[]> {
  if (!supabase) return initialCertificates;

  try {
    const { data, error } = await supabase
      .from("partner_certificates")
      .select("*")
      .eq("is_published", true)
      .order("display_order", { ascending: true });

    if (error || !data || data.length === 0) {
      return initialCertificates;
    }

    return data.map((d: any) => ({
      id: d.id,
      text: d.text,
      brand: d.brand,
      category: d.category,
      status: d.status || "Active Member",
      validity: d.validity || "2026 Certified",
      description: d.description || "",
      image: d.image,
      alt: d.alt || `${d.text} Certificate for IT HUB`,
      shopUrl: d.shop_url || undefined,
    }));
  } catch (err) {
    console.error("Failed to fetch published certificates from database:", err);
    return initialCertificates;
  }
}
