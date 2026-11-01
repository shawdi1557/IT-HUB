# IT HUB — Certificate & Partner Image Mapping Mismatch Fix Report

**Project:** IT HUB E-Commerce Platform & Staff Portal  
**Scope:** Staff Portal (`Certificates.tsx`) + Customer Storefront (`catalog.ts`, `store.tsx`, `Information.tsx`)  
**Environment:** Local Development Only  
**Date:** October 31, 2026  
**Status:** Completed & Fully Verified

---

## 1. Executive Summary

This report documents the investigation, root cause diagnosis, and resolution of the image mismatch between the Staff Portal and Customer Storefront for partner/certificate records (specifically `Intel Partner Alliance` vs. `IGGIS Honour & Recognition`).

- **Previous Defect:** In `ITHUB_ADMIN` under the certificate management module, the record titled `"Intel Technology Partner"` displayed the IGGIS Honour & Recognition trophy award image, while the Storefront and About page displayed the portrait announcement photo showing the IT HUB representative holding the Intel Partner Alliance recognition. Furthermore, the canonical `IGGIS Honour & Recognition` record was omitted from the Staff Portal's default list.
- **Root Cause:**
  1. `public/images/recognition/intel-partner.jpg` on disk was an identical duplicate copy of `public/images/recognition/iggis-honour-recognition.jpg` (SHA-256: `D740D6CD38346FBE6DA01AF989B29BDF987FA71CAEBDE33121C44B718F02F4EA`, size: 409,953 bytes).
  2. `DEFAULT_CERTIFICATES` in `ITHUB_ADMIN/src/pages/Certificates.tsx` only had 5 records (omitting `cert-iggis`), and configured `cert-intel` with `text: "Intel Technology Partner"` pointing to the corrupted `intel-partner.jpg`.
- **Resolution:**
  1. Safely backed up `intel-partner.jpg` to `intel-partner.jpg.bak`.
  2. Replaced `public/images/recognition/intel-partner.jpg` and `public/images/recognition/intel-partner.png` with the genuine Intel Partner Alliance announcement image from `public/images/about-store.png` (SHA-256: `9325122E7C3858B24EB029B6B9A0CEB3C36AC7A0925C0505C540966322FF1419`).
  3. Preserved `public/images/recognition/iggis-honour-recognition.jpg` completely untouched for `cert-iggis`.
  4. Synchronized `DEFAULT_CERTIFICATES` in `ITHUB_ADMIN/src/pages/Certificates.tsx` to include all 6 canonical partners (ASUS, Canon, Epson, Numeric, IGGIS, Intel) with matching canonical titles, categories, and image URLs.
  5. Implemented `normalizeCertificates` in both Staff Portal and Storefront store to automatically heal any stale browser `localStorage` entries.
  6. Added a 10-test automated regression suite passing 100%.

---

## 2. Root Cause Analysis

Tracing the complete certificate content pipeline revealed three compounding factors:

1. **Asset Duplication on Disk:**
   When friendly alias filenames were created in `public/images/recognition/`, `intel-partner.jpg` was accidentally copied from `iggis-honour-recognition.jpg` rather than from `about-store.png`. Both files shared the identical byte length (409,953 bytes) and SHA-256 checksum.

2. **Staff Portal Default Seed Discrepancy:**
   While Storefront's `initialCertificates` in `src/data/catalog.ts` maintained 6 records:
   - `cert-asus` (ASUS)
   - `cert-canon` (Canon)
   - `cert-epson` (Epson)
   - `cert-numeric` (Numeric)
   - `cert-iggis` (IGGIS Honour & Recognition)
   - `cert-intel` (Intel Partner Alliance)

   The Staff Portal (`DEFAULT_CERTIFICATES` in `ITHUB_ADMIN/src/pages/Certificates.tsx`) only contained 5 records, omitting `cert-iggis` and binding `cert-intel` to the alias `/images/recognition/intel-partner.jpg`.

3. **Content Resolution Divergence:**
   The Storefront and About page directly referenced `/images/about-store.png` for Intel, correctly rendering the representative holding the Intel certificate. Meanwhile, the Staff Portal loaded `/images/recognition/intel-partner.jpg`, which served the IGGIS trophy image.

---

## 3. Affected Record IDs & Previous vs. Corrected Associations

| Record ID      | Canonical Title            | Partner Brand | Previous Staff Portal Association                                                                             | Corrected Staff Portal Association                                                                   | Storefront & About Page Association                                                                  |
| :------------- | :------------------------- | :------------ | :------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| `cert-intel`   | Intel Partner Alliance     | Intel         | `text: "Intel Technology Partner"`<br>`image: "/images/recognition/intel-partner.jpg"` _(served IGGIS image)_ | `text: "Intel Partner Alliance"`<br>`image: "/images/about-store.png"` _(serves Intel announcement)_ | `text: "Intel Partner Alliance"`<br>`image: "/images/about-store.png"` _(serves Intel announcement)_ |
| `cert-iggis`   | IGGIS Honour & Recognition | IGGIS         | _Omitted from default certificates_                                                                           | `text: "IGGIS Honour & Recognition"`<br>`image: "/images/recognition/iggis-honour-recognition.jpg"`  | `text: "IGGIS Honour & Recognition"`<br>`image: "/images/recognition/iggis-honour-recognition.jpg"`  |
| `cert-asus`    | ASUS Premium Partner       | ASUS          | `/images/recognition/asus-premium-partner.jpg`                                                                | `/images/recognition/asus-premium-partner.jpg`                                                       | `/images/recognition/asus-premium-partner.jpg`                                                       |
| `cert-canon`   | Canon Authorised Reseller  | Canon         | `/images/recognition/canon-partner.jpg`                                                                       | `/images/recognition/canon-authorised-reseller.jpg`                                                  | `/images/recognition/canon-authorised-reseller.jpg`                                                  |
| `cert-epson`   | Epson Channel Partner      | Epson         | `/images/recognition/epson-partner.jpg`                                                                       | `/images/recognition/epson-channel-partner.jpg`                                                      | `/images/recognition/epson-channel-partner.jpg`                                                      |
| `cert-numeric` | Numeric Energy Partner     | Numeric       | `/images/recognition/numeric-partner.jpg`                                                                     | `/images/recognition/numeric-energy-partner.jpg`                                                     | `/images/recognition/numeric-energy-partner.jpg`                                                     |

---

## 4. Asset Integrity & Hash Verification

### 4.1 Asset SHA-256 Checksums

```
Algorithm       Hash                                                               Path
---------       ----                                                               ----
SHA-256         9325122E7C3858B24EB029B6B9A0CEB3C36AC7A0925C0505C540966322FF1419    public/images/about-store.png (Intel)
SHA-256         9325122E7C3858B24EB029B6B9A0CEB3C36AC7A0925C0505C540966322FF1419    public/images/recognition/intel-partner.jpg (Intel)
SHA-256         9325122E7C3858B24EB029B6B9A0CEB3C36AC7A0925C0505C540966322FF1419    public/images/recognition/intel-partner.png (Intel)
SHA-256         D740D6CD38346FBE6DA01AF989B29BDF987FA71CAEBDE33121C44B718F02F4EA    public/images/recognition/iggis-honour-recognition.jpg (IGGIS)
SHA-256         D740D6CD38346FBE6DA01AF989B29BDF987FA71CAEBDE33121C44B718F02F4EA    public/images/recognition/intel-partner.jpg.bak (Backup)
```

- **Hash Distinctness:** `intel-partner.jpg` (`932512...`) and `iggis-honour-recognition.jpg` (`D740D6...`) are verifiably distinct binary assets.
- **Backup Created:** `intel-partner.jpg.bak` was generated prior to file modification.
- **Safety Guarantee:** `iggis-honour-recognition.jpg` was neither overwritten nor deleted.

---

## 5. Database Changes & Persistence Safety

- **No Remote Database Alterations:** Certificates in the current architecture are synchronized client-side through `localStorage["ithub-store-v2"]` and catalog constants. No production Supabase tables or schemas were modified.
- **Automatic Self-Healing (`normalizeCertificates`):** Added a self-healing utility in [`ITHUB_ADMIN/src/pages/Certificates.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/ITHUB_ADMIN/src/pages/Certificates.tsx#L96-L135) and [`src/app/store.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/app/store.tsx#L396-L430) that detects and repairs stale local storage data, ensuring any client visiting the portal or storefront has their local cache upgraded without user intervention.

---

## 6. Staff Portal & Storefront Verification

### 6.1 Staff Portal Certificate Management (`http://localhost:5174/certificates`)

- Displays all 6 active certificate cards with live thumbnails.
- `Intel Partner Alliance` card displays the portrait announcement photo.
- `IGGIS Honour & Recognition` card displays the original institutional award trophy photo.
- Clicking **Edit** on Intel opens the modal pre-filled with Intel's own data and image preview.
- Modifying Intel does not alter IGGIS; modifying IGGIS does not alter Intel.
- Clicking **Reset Defaults** restores all 6 canonical partner records.

### 6.2 Customer Storefront & About Page (`http://localhost:8443/about`)

- Section heading: `"Accreditations & Industry Recognition"`.
- Minimalist 6-card grid renders all 6 partners with inspect modal previews.
- Both `Intel Partner Alliance` and `IGGIS Honour & Recognition` display their respective independent photographs with zero collision.

---

## 7. Automated Testing Results

Executed dedicated test suite [`supabase/functions/tests/certificate-partner-image-mapping.test.ts`](file:///D:/mario/IT%20HUB/ITHUB_WEB/supabase/functions/tests/certificate-partner-image-mapping.test.ts):

```
running 10 tests from ./supabase/functions/tests/certificate-partner-image-mapping.test.ts
CERT-1: Intel announcement image and IGGIS award image have distinct SHA-256 hashes ... ok (3ms)
CERT-2: On-disk intel-partner.jpg is genuine Intel image and backup exists ... ok (12ms)
CERT-3: Storefront initialCertificates defines Intel and IGGIS independently with correct metadata ... ok (1ms)
CERT-4: Staff Portal DEFAULT_CERTIFICATES defines all 6 canonical partners including IGGIS and Intel ... ok (586µs)
CERT-5: Record association uses stable ID without relying on array index ... ok (162µs)
CERT-6: Staff editing of Intel record immutably preserves IGGIS record and image ... ok (206µs)
CERT-7: Staff editing of IGGIS record immutably preserves Intel record and image ... ok (138µs)
CERT-8: Normalization fixes legacy stale Intel data and restores missing IGGIS ... ok (373µs)
CERT-9: Storefront store.tsx includes certificate normalization ... ok (397µs)
CERT-10: About page renders certificates from store using item.image ... ok (350µs)

ok | 10 passed | 0 failed (25ms)
```

### Full Regression Suite

- `npm test`: **623 / 623 passed** (0 failures).
- `npm run test:portal`: **68 / 68 passed** (0 failures).
- `npm run typecheck`: **0 errors**.
- `npm run portal:typecheck`: **0 errors**.
- `npm run build`: **Success (1.39s)**.
- `npm run portal:build`: **Success (643ms)**.
