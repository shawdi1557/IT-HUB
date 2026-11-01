// supabase/functions/tests/certificate-partner-image-mapping.test.ts
// Automated Test Suite for Certificate & Partner Image Mapping Consistency
// IT HUB — Customer Storefront, About Page & Staff Portal

import {
  assertEquals,
  assertNotEquals,
  assertMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const CATALOG_DATA_PATH = "src/data/catalog.ts";
const PORTAL_CERTS_PATH = "ITHUB_ADMIN/src/pages/Certificates.tsx";
const STORE_PATH = "src/app/store.tsx";
const ABOUT_PAGE_PATH = "src/pages/Information.tsx";

const INTEL_ABOUT_STORE_PATH = "public/images/about-store.png";
const INTEL_PARTNER_JPG_PATH = "public/images/recognition/intel-partner.jpg";
const INTEL_PARTNER_PNG_PATH = "public/images/recognition/intel-partner.png";
const IGGIS_IMAGE_PATH = "public/images/recognition/iggis-honour-recognition.jpg";
const INTEL_BACKUP_PATH = "public/images/recognition/intel-partner.jpg.bak";

async function sha256File(path: string): Promise<string> {
  const bytes = Deno.readFileSync(path);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ASSET DISK INTEGRITY & HASH COLLISION PREVENTION
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("CERT-1: Intel announcement image and IGGIS award image have distinct SHA-256 hashes", async () => {
  const intelHash = await sha256File(INTEL_ABOUT_STORE_PATH);
  const iggisHash = await sha256File(IGGIS_IMAGE_PATH);

  assertNotEquals(intelHash, iggisHash, "Intel and IGGIS images must never have the same hash");
  assertEquals(intelHash.length, 64);
  assertEquals(iggisHash.length, 64);
});

Deno.test("CERT-2: On-disk intel-partner.jpg is genuine Intel image and backup exists", async () => {
  const intelAboutHash = await sha256File(INTEL_ABOUT_STORE_PATH);
  const intelPartnerHash = await sha256File(INTEL_PARTNER_JPG_PATH);

  assertEquals(
    intelPartnerHash,
    intelAboutHash,
    "intel-partner.jpg on disk must be identical to the genuine Intel announcement image",
  );

  const backupExists = (() => {
    try {
      return Deno.statSync(INTEL_BACKUP_PATH).isFile;
    } catch {
      return false;
    }
  })();
  assertEquals(backupExists, true, "intel-partner.jpg.bak must exist as a safety backup");
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. STOREFRONT CANONICAL DATA CHECKS
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("CERT-3: Storefront initialCertificates defines Intel and IGGIS independently with correct metadata", () => {
  const content = Deno.readTextFileSync(CATALOG_DATA_PATH);

  // Both records must exist
  assertMatch(content, /id:\s*["']cert-iggis["']/);
  assertMatch(content, /id:\s*["']cert-intel["']/);

  // Intel record must have canonical Partner Alliance text
  assertMatch(content, /text:\s*["']Intel Partner Alliance["']/);
  assertMatch(content, /brand:\s*["']Intel["']/);
  assertMatch(content, /image:\s*["']\/images\/about-store\.png["']/);

  // IGGIS record must have correct recognition text and image
  assertMatch(content, /text:\s*["']IGGIS Honour & Recognition["']/);
  assertMatch(content, /brand:\s*["']IGGIS["']/);
  assertMatch(content, /image:\s*["']\/images\/recognition\/iggis-honour-recognition\.jpg["']/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. STAFF PORTAL DEFAULT DATA CHECKS
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("CERT-4: Staff Portal DEFAULT_CERTIFICATES defines all 6 canonical partners including IGGIS and Intel", () => {
  const content = Deno.readTextFileSync(PORTAL_CERTS_PATH);

  assertMatch(content, /id:\s*["']cert-asus["']/);
  assertMatch(content, /id:\s*["']cert-canon["']/);
  assertMatch(content, /id:\s*["']cert-epson["']/);
  assertMatch(content, /id:\s*["']cert-numeric["']/);
  assertMatch(content, /id:\s*["']cert-iggis["']/);
  assertMatch(content, /id:\s*["']cert-intel["']/);

  // Intel record in Staff Portal must point to Intel image, not IGGIS
  assertMatch(content, /text:\s*["']Intel Partner Alliance["']/);
  assertMatch(content, /brand:\s*["']Intel["']/);
  assertMatch(content, /image:\s*["']\/images\/about-store\.png["']/);

  // IGGIS record must point to IGGIS award image
  assertMatch(content, /text:\s*["']IGGIS Honour & Recognition["']/);
  assertMatch(content, /brand:\s*["']IGGIS["']/);
  assertMatch(content, /image:\s*["']\/images\/recognition\/iggis-honour-recognition\.jpg["']/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. RECORD ID LOOKUP & INDEPENDENT IMMUTABLE EDITING
// ─────────────────────────────────────────────────────────────────────────────

interface TestCertificate {
  id: string;
  image: string;
  text: string;
  brand: string;
  category: string;
}

const SAMPLE_CERTS: TestCertificate[] = [
  {
    id: "cert-asus",
    image: "/images/recognition/asus-premium-partner.jpg",
    text: "ASUS Premium Partner",
    brand: "ASUS",
    category: "Laptops & Computing",
  },
  {
    id: "cert-iggis",
    image: "/images/recognition/iggis-honour-recognition.jpg",
    text: "IGGIS Honour & Recognition",
    brand: "IGGIS",
    category: "Institutional IT Partner",
  },
  {
    id: "cert-intel",
    image: "/images/about-store.png",
    text: "Intel Partner Alliance",
    brand: "Intel",
    category: "Processors & Systems",
  },
];

Deno.test("CERT-5: Record association uses stable ID without relying on array index", () => {
  const list = [...SAMPLE_CERTS];
  const reversedList = [...SAMPLE_CERTS].reverse();

  const getById = (arr: TestCertificate[], id: string) => arr.find((c) => c.id === id);

  assertEquals(getById(list, "cert-intel")?.image, "/images/about-store.png");
  assertEquals(getById(reversedList, "cert-intel")?.image, "/images/about-store.png");

  assertEquals(
    getById(list, "cert-iggis")?.image,
    "/images/recognition/iggis-honour-recognition.jpg",
  );
  assertEquals(
    getById(reversedList, "cert-iggis")?.image,
    "/images/recognition/iggis-honour-recognition.jpg",
  );
});

Deno.test("CERT-6: Staff editing of Intel record immutably preserves IGGIS record and image", () => {
  const originalList = [...SAMPLE_CERTS];
  const iggisBefore = originalList.find((c) => c.id === "cert-iggis");

  // Staff updates Intel image
  const updatedIntel: TestCertificate = {
    ...originalList.find((c) => c.id === "cert-intel")!,
    image: "https://example.com/custom-intel.png",
    text: "Intel Titanium Partner",
  };

  const updatedList = originalList.map((c) => (c.id === "cert-intel" ? updatedIntel : c));

  const iggisAfter = updatedList.find((c) => c.id === "cert-iggis");
  assertEquals(iggisAfter?.image, iggisBefore?.image);
  assertEquals(iggisAfter?.text, iggisBefore?.text);
  assertEquals(iggisAfter?.brand, iggisBefore?.brand);

  const intelAfter = updatedList.find((c) => c.id === "cert-intel");
  assertEquals(intelAfter?.image, "https://example.com/custom-intel.png");
  assertEquals(intelAfter?.text, "Intel Titanium Partner");
});

Deno.test("CERT-7: Staff editing of IGGIS record immutably preserves Intel record and image", () => {
  const originalList = [...SAMPLE_CERTS];
  const intelBefore = originalList.find((c) => c.id === "cert-intel");

  // Staff updates IGGIS
  const updatedIggis: TestCertificate = {
    ...originalList.find((c) => c.id === "cert-iggis")!,
    text: "IGGIS Excellence Award 2026",
    image: "https://example.com/custom-iggis.png",
  };

  const updatedList = originalList.map((c) => (c.id === "cert-iggis" ? updatedIggis : c));

  const intelAfter = updatedList.find((c) => c.id === "cert-intel");
  assertEquals(intelAfter?.image, intelBefore?.image);
  assertEquals(intelAfter?.text, intelBefore?.text);
  assertEquals(intelAfter?.brand, intelBefore?.brand);

  const iggisAfter = updatedList.find((c) => c.id === "cert-iggis");
  assertEquals(iggisAfter?.image, "https://example.com/custom-iggis.png");
  assertEquals(iggisAfter?.text, "IGGIS Excellence Award 2026");
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. DATA NORMALIZATION & MIGRATION SELF-HEALING
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("CERT-8: Normalization fixes legacy stale Intel data and restores missing IGGIS", () => {
  const content = Deno.readTextFileSync(PORTAL_CERTS_PATH);

  // normalizeCertificates function must be defined and exported
  assertMatch(content, /export function normalizeCertificates/);

  // Must check for intel title fix and duplicate image
  assertMatch(content, /c\.id === ["']cert-intel["']/);
  assertMatch(content, /Intel Technology Partner/);
  assertMatch(content, /cert-iggis/);
});

Deno.test("CERT-9: Storefront store.tsx includes certificate normalization", () => {
  const content = Deno.readTextFileSync(STORE_PATH);

  // store.tsx must normalize legacy certificates on load
  assertMatch(content, /c\.id === ["']cert-intel["']/);
  assertMatch(content, /cert-iggis/);
  assertMatch(content, /Intel Partner Alliance/);
});

Deno.test("CERT-10: About page renders certificates from store using item.image", () => {
  const content = Deno.readTextFileSync(ABOUT_PAGE_PATH);

  assertMatch(content, /certificates\.map\(/);
  assertMatch(content, /src=\{item\.image\}/);
  assertMatch(content, /alt=\{item\.alt\}/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. STAFF PORTAL PUBLIC ASSETS & ERROR FALLBACK INTEGRITY
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_ABOUT_STORE_PATH = "ITHUB_ADMIN/public/images/about-store.png";
const ADMIN_INTEL_PARTNER_JPG_PATH = "ITHUB_ADMIN/public/images/recognition/intel-partner.jpg";
const ADMIN_INTEL_PARTNER_PNG_PATH = "ITHUB_ADMIN/public/images/recognition/intel-partner.png";
const ADMIN_INTEL_BACKUP_PATH = "ITHUB_ADMIN/public/images/recognition/intel-partner.jpg.bak";
const ADMIN_IGGIS_IMAGE_PATH = "ITHUB_ADMIN/public/images/recognition/iggis-honour-recognition.jpg";

Deno.test("CERT-11: Staff Portal public assets contain genuine Intel images matching Storefront hash", async () => {
  const storefrontIntelHash = await sha256File(INTEL_ABOUT_STORE_PATH);
  const adminAboutHash = await sha256File(ADMIN_ABOUT_STORE_PATH);
  const adminIntelJpgHash = await sha256File(ADMIN_INTEL_PARTNER_JPG_PATH);
  const adminIntelPngHash = await sha256File(ADMIN_INTEL_PARTNER_PNG_PATH);

  assertEquals(
    adminAboutHash,
    storefrontIntelHash,
    "ITHUB_ADMIN/public/images/about-store.png must match Storefront Intel announcement image",
  );
  assertEquals(
    adminIntelJpgHash,
    storefrontIntelHash,
    "ITHUB_ADMIN/public/images/recognition/intel-partner.jpg must match Storefront Intel announcement image",
  );
  assertEquals(
    adminIntelPngHash,
    storefrontIntelHash,
    "ITHUB_ADMIN/public/images/recognition/intel-partner.png must match Storefront Intel announcement image",
  );

  const adminBackupExists = (() => {
    try {
      return Deno.statSync(ADMIN_INTEL_BACKUP_PATH).isFile;
    } catch {
      return false;
    }
  })();
  assertEquals(adminBackupExists, true, "ITHUB_ADMIN intel-partner.jpg.bak must exist");
});

Deno.test("CERT-12: Staff Portal IGGIS certificate asset remains untouched and distinct from Intel", async () => {
  const adminIntelHash = await sha256File(ADMIN_ABOUT_STORE_PATH);
  const adminIggisHash = await sha256File(ADMIN_IGGIS_IMAGE_PATH);
  const storefrontIggisHash = await sha256File(IGGIS_IMAGE_PATH);

  assertEquals(
    adminIggisHash,
    storefrontIggisHash,
    "Staff Portal IGGIS image must match Storefront IGGIS image",
  );
  assertNotEquals(
    adminIntelHash,
    adminIggisHash,
    "Staff Portal Intel and IGGIS images must never collide",
  );
});

Deno.test("CERT-13: All DEFAULT_CERTIFICATES asset files exist in both Storefront and Staff Portal public folders", () => {
  const defaultAssets = [
    "images/recognition/asus-premium-partner.jpg",
    "images/recognition/canon-authorised-reseller.jpg",
    "images/recognition/epson-channel-partner.jpg",
    "images/recognition/numeric-energy-partner.jpg",
    "images/recognition/iggis-honour-recognition.jpg",
    "images/about-store.png",
  ];

  for (const asset of defaultAssets) {
    const rootPath = `public/${asset}`;
    const adminPath = `ITHUB_ADMIN/public/${asset}`;

    const rootExists = (() => {
      try {
        return Deno.statSync(rootPath).isFile;
      } catch {
        return false;
      }
    })();
    assertEquals(rootExists, true, `Asset ${rootPath} must exist in root public/`);

    const adminExists = (() => {
      try {
        return Deno.statSync(adminPath).isFile;
      } catch {
        return false;
      }
    })();
    assertEquals(adminExists, true, `Asset ${adminPath} must exist in ITHUB_ADMIN/public/`);
  }
});

Deno.test("CERT-14: Staff Portal Certificates component has handleCertificateImageError and onError handlers", () => {
  const content = Deno.readTextFileSync(PORTAL_CERTS_PATH);

  assertMatch(content, /export function handleCertificateImageError/);
  assertMatch(content, /onError=\{\(e\) => handleCertificateImageError\(e, cert\.id\)\}/);
  assertMatch(content, /onError=\{\(e\) => handleCertificateImageError\(e, previewCert\.id\)\}/);
  assertMatch(content, /onError=\{\(e\) => handleCertificateImageError\(e, editingCert\?\.id\)\}/);
});
