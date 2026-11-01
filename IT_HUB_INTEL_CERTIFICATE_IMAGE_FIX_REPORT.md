# IT HUB — Fix Broken Certificate Image in Staff Portal: Diagnostic & Remediation Report

**Date:** October 31, 2026  
**Environment:** Local Development Only  
**Scope:** Staff Portal (`ITHUB_ADMIN`, `http://localhost:5174`) & Customer Storefront (`http://localhost:8443`)  
**Status:** Completed & Verified

---

## 1. Executive Summary

During testing of the Staff Portal at `http://localhost:5174/certificates`, the **Intel Partner Alliance** certificate card rendered a broken image icon alongside its alt text (`"Intel Partner Alliance Membership Certificate for IT HUB"`). The metadata for the record loaded correctly (Partner: Intel, Title: Intel Partner Alliance, Category: Processors & Systems, Validity: Active Member, Description: Official Intel® Partner Alliance Member...), but the image failed to display in the certificate card grid, edit modal preview, and inspection view modal.

A systematic diagnostic trace revealed the root cause: The project employs a dual-server architecture where the Customer Storefront runs on Vite port 8443 (serving static assets from `./public/`) and the Staff Portal runs on Vite port 5174 (serving static assets from `./ITHUB_ADMIN/public/`). Although the genuine Intel Partner Alliance image (`about-store.png`) existed in root `public/images/`, it was never copied into `ITHUB_ADMIN/public/images/`. When port 5174 received `GET /images/about-store.png`, Vite's single-page application fallback returned `index.html` with `HTTP 200 OK` and `Content-Type: text/html`. The browser failed to decode the HTML markup as an image, triggering the image error state.

The issue was resolved by synchronizing the genuine Intel assets into `ITHUB_ADMIN/public/images/`, safely updating `intel-partner.jpg` and `intel-partner.png` with backup preservation, and adding defensive `onError` fallback handlers across the Staff Portal and Storefront certificate components.

---

## 2. Phase 1 — Diagnostic Findings

The following 10 diagnostic points directly address the operational questions posed in the investigation:

| #   | Diagnostic Question                                                                    | Finding & Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **What image URL is stored in the database / state?**                                  | There is no remote SQL database table for partner certificates; records are managed via client storage (`localStorage["ithub-store-v2"]`) seeded from `DEFAULT_CERTIFICATES` in [`Certificates.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/ITHUB_ADMIN/src/pages/Certificates.tsx#L32-L110) and `initialCertificates` in [`catalog.ts`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/data/catalog.ts#L9934-L10070). For `cert-intel`, the configured URL is `"/images/about-store.png"`. |
| 2   | **Is the URL empty, malformed, outdated or incorrect?**                                | The URL path `"/images/about-store.png"` is valid for the Storefront (which has `public/images/about-store.png`), but the physical file was completely missing from `ITHUB_ADMIN/public/images/`.                                                                                                                                                                                                                                                                                 |
| 3   | **Does the image URL return HTTP 200?**                                                | **Yes.** Running `curl -I http://localhost:5174/images/about-store.png` returned `HTTP/1.1 200 OK`.                                                                                                                                                                                                                                                                                                                                                                               |
| 4   | **Does the URL return an actual image content type?**                                  | **No.** The initial response returned `Content-Type: text/html` and served Vite's `index.html` entrypoint. The browser cannot parse HTML as image pixels, triggering the broken image icon.                                                                                                                                                                                                                                                                                       |
| 5   | **Is the Supabase Storage bucket public or private?**                                  | N/A — Partner certificates are local static assets bundled with the development servers, not stored in Supabase Storage.                                                                                                                                                                                                                                                                                                                                                          |
| 6   | **If private, is the frontend generating a valid signed URL?**                         | N/A — No remote object storage is involved in certificate rendering.                                                                                                                                                                                                                                                                                                                                                                                                              |
| 7   | **Does the image require authentication?**                                             | **No.** Local static assets in Vite's public directory require no authentication headers or session cookies.                                                                                                                                                                                                                                                                                                                                                                      |
| 8   | **Is the URL being modified incorrectly by frontend code?**                            | `normalizeCertificates()` in [`Certificates.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/ITHUB_ADMIN/src/pages/Certificates.tsx#L112-L145) replaced `intel-partner.jpg` with `about-store.png` to avoid displaying the old IGGIS duplicate image. This was logically correct, but exposed the missing file in `ITHUB_ADMIN/public/`.                                                                                                                                                 |
| 9   | **Is the image inaccessible because of RLS, storage policies or expired signed URLs?** | **No.** Local filesystem and Vite public directory serving are completely independent of Supabase RLS.                                                                                                                                                                                                                                                                                                                                                                            |
| 10  | **Is the Staff Portal using the same image field as the Storefront?**                  | **Yes.** Both use `cert.image`. However, Storefront serves from `http://localhost:8443` while Staff Portal serves from `http://localhost:5174`.                                                                                                                                                                                                                                                                                                                                   |

---

## 3. Phase 2 — Source of Truth & Asset Integrity

### 3.1 SHA-256 Hash Verification Before and After

Before remediation:

- `public/images/about-store.png` = `9325122E7C3858B24EB029B6B9A0CEB3C36AC7A0925C0505C540966322FF1419` (Genuine Intel announcement photo)
- `public/images/recognition/intel-partner.jpg` = `9325122E...` (Genuine Intel image)
- `ITHUB_ADMIN/public/images/about-store.png` = **MISSING** (Returned `index.html`)
- `ITHUB_ADMIN/public/images/recognition/intel-partner.jpg` = `D740D6CD38346FBE6DA01AF989B29BDF987FA71CAEBDE33121C44B718F02F4EA` (Old duplicate of IGGIS award image)
- `public/images/recognition/iggis-honour-recognition.jpg` = `D740D6CD...` (Genuine IGGIS award image)
- `ITHUB_ADMIN/public/images/recognition/iggis-honour-recognition.jpg` = `D740D6CD...` (Genuine IGGIS award image)

After remediation:
All Intel image assets across both environments share the exact identical cryptographic hash, and the IGGIS award image remains completely untouched and independent:

```
Algorithm Hash                                                             Path
--------- ----                                                             ----
SHA256    9325122E7C3858B24EB029B6B9A0CEB3C36AC7A0925C0505C540966322FF1419 ...\public\images\about-store.png
SHA256    9325122E7C3858B24EB029B6B9A0CEB3C36AC7A0925C0505C540966322FF1419 ...\public\images\recognition\intel-partner.jpg
SHA256    9325122E7C3858B24EB029B6B9A0CEB3C36AC7A0925C0505C540966322FF1419 ...\public\images\recognition\intel-partner.png
SHA256    9325122E7C3858B24EB029B6B9A0CEB3C36AC7A0925C0505C540966322FF1419 ...\ITHUB_ADMIN\public\images\about-store.png
SHA256    9325122E7C3858B24EB029B6B9A0CEB3C36AC7A0925C0505C540966322FF1419 ...\ITHUB_ADMIN\public\images\recognition\intel-partner.jpg
SHA256    9325122E7C3858B24EB029B6B9A0CEB3C36AC7A0925C0505C540966322FF1419 ...\ITHUB_ADMIN\public\images\recognition\intel-partner.png
SHA256    D740D6CD38346FBE6DA01AF989B29BDF987FA71CAEBDE33121C44B718F02F4EA ...\public\images\recognition\iggis-honour-recognition.jpg
SHA256    D740D6CD38346FBE6DA01AF989B29BDF987FA71CAEBDE33121C44B718F02F4EA ...\ITHUB_ADMIN\public\images\recognition\iggis-honour-recognition.jpg
```

---

## 4. Phase 3 — Remediation Actions Taken

### 4.1 Asset Synchronization with Safety Backup

1. **Safety Backup:** Created `ITHUB_ADMIN/public/images/recognition/intel-partner.jpg.bak`.
2. **File Synchronization:**
   - Copied `public/images/about-store.png` to `ITHUB_ADMIN/public/images/about-store.png`.
   - Copied `public/images/about-store.png` to `ITHUB_ADMIN/public/images/recognition/intel-partner.jpg`.
   - Copied `public/images/about-store.png` to `ITHUB_ADMIN/public/images/recognition/intel-partner.png`.

### 4.2 Frontend Defensive Error Handling

Updated [`ITHUB_ADMIN/src/pages/Certificates.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/ITHUB_ADMIN/src/pages/Certificates.tsx):

- Added and exported `handleCertificateImageError(e, certId)` helper.
- Attached `onError` listener to the certificate grid card image:
  ```tsx
  <img
    src={cert.image}
    alt={cert.alt || cert.text}
    onError={(e) => handleCertificateImageError(e, cert.id)}
    className="h-full w-full object-cover transition hover:scale-105 duration-300"
  />
  ```
- Attached `onError` listener to the Edit Modal preview image:
  ```tsx
  <img
    src={formImage}
    alt="Certificate preview"
    onError={(e) => handleCertificateImageError(e, editingCert?.id)}
    className="rounded-lg max-h-36 object-contain mx-auto"
  />
  ```
- Attached `onError` listener to the Preview Modal inspection image:
  ```tsx
  <img
    src={previewCert.image}
    alt={previewCert.text}
    onError={(e) => handleCertificateImageError(e, previewCert.id)}
    className="w-full max-h-[70vh] object-contain bg-slate-950"
  />
  ```

Updated Storefront [`src/pages/Information.tsx`](file:///D:/mario/IT%20HUB/ITHUB_WEB/src/pages/Information.tsx):

- Added defensive `onError` handler to the About page certificates grid and inspection modal.

---

## 5. Phase 4 — Verification Evidence

### 5.1 HTTP Header & MIME Type Responses

Verified all 6 OEM partner certificates plus alternative paths across both servers:

#### Staff Portal (`http://localhost:5174`):

```
Url                                              Status ContentType  ContentLength
---                                              ------ -----------  -------------
images/recognition/asus-premium-partner.jpg         200 {image/jpeg} {361450}
images/recognition/canon-authorised-reseller.jpg    200 {image/jpeg} {421553}
images/recognition/epson-channel-partner.jpg        200 {image/jpeg} {401684}
images/recognition/numeric-energy-partner.jpg       200 {image/jpeg} {363663}
images/recognition/iggis-honour-recognition.jpg     200 {image/jpeg} {409953}
images/about-store.png                              200 {image/png}  {287759}
images/recognition/intel-partner.jpg                200 {image/jpeg} {287759}
```

#### Customer Storefront (`http://localhost:8443`):

```
Url                                              Status ContentType  ContentLength
---                                              ------ -----------  -------------
images/recognition/asus-premium-partner.jpg         200 {image/jpeg} {361450}
images/recognition/canon-authorised-reseller.jpg    200 {image/jpeg} {421553}
images/recognition/epson-channel-partner.jpg        200 {image/jpeg} {401684}
images/recognition/numeric-energy-partner.jpg       200 {image/jpeg} {363663}
images/recognition/iggis-honour-recognition.jpg     200 {image/jpeg} {409953}
images/about-store.png                              200 {image/png}  {287759}
images/recognition/intel-partner.jpg                200 {image/jpeg} {287759}
```

### 5.2 Automated Tests

Ran the expanded test suite in [`supabase/functions/tests/certificate-partner-image-mapping.test.ts`](file:///D:/mario/IT%20HUB/ITHUB_WEB/supabase/functions/tests/certificate-partner-image-mapping.test.ts):

- `CERT-1`: Intel announcement image and IGGIS award image have distinct SHA-256 hashes (passed)
- `CERT-2`: On-disk intel-partner.jpg is genuine Intel image and backup exists (passed)
- `CERT-3`: Storefront initialCertificates defines Intel and IGGIS independently with correct metadata (passed)
- `CERT-4`: Staff Portal DEFAULT_CERTIFICATES defines all 6 canonical partners including IGGIS and Intel (passed)
- `CERT-5`: Record association uses stable ID without relying on array index (passed)
- `CERT-6`: Staff editing of Intel record immutably preserves IGGIS record and image (passed)
- `CERT-7`: Staff editing of IGGIS record immutably preserves Intel record and image (passed)
- `CERT-8`: Normalization fixes legacy stale Intel data and restores missing IGGIS (passed)
- `CERT-9`: Storefront store.tsx includes certificate normalization (passed)
- `CERT-10`: About page renders certificates from store using item.image (passed)
- `CERT-11`: Staff Portal public assets contain genuine Intel images matching Storefront hash (passed)
- `CERT-12`: Staff Portal IGGIS certificate asset remains untouched and distinct from Intel (passed)
- `CERT-13`: All DEFAULT_CERTIFICATES asset files exist in both Storefront and Staff Portal public folders (passed)
- `CERT-14`: Staff Portal Certificates component has handleCertificateImageError and onError handlers (passed)

**Result:** `14 passed | 0 failed`

### 5.3 Full Regression Suite

- `npm test`: **627 passed | 0 failed** across all test suites
- `npm run test:portal`: **68 passed | 0 failed** across all portal suites
- `npm run typecheck`: **0 errors** (TypeScript 5.7)
- `npm run portal:typecheck`: **0 errors** (TypeScript 5.7)
- `npm run build`: **Success in 1.20s**
- `npm run portal:build`: **Success in 540ms**
- Dev servers at `http://localhost:8443` and `http://localhost:5174`: **Active and serving HTTP 200**
