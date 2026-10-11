# IT HUB — FEATURE UPDATE PROMPT
## Update Date: 07-10-2026

You are working on the existing **IT HUB E-Commerce project**.

Your task is to **update the existing application** with the requirements below.

## IMPORTANT IMPLEMENTATION RULES

- Do NOT rebuild the application from scratch.
- Do NOT remove or break existing features.
- First inspect the existing frontend, backend, Supabase schema, storage buckets, authentication, admin dashboard, checkout flow, product architecture, and existing service/courier flow.
- Reuse the existing architecture, components, styles, database patterns, and authentication wherever possible.
- Follow the existing UI/UX design system.
- Keep the implementation modular and production-ready.
- Do not use mock functionality where a real Supabase implementation is already possible.
- Update database migrations/schema safely.
- Maintain proper Row Level Security (RLS).
- Validate all user-submitted files and data.
- Make sure admin-only operations cannot be accessed by normal customers.

---

# 1. OFFER / COUPON SYSTEM

Add a proper coupon/offer system to IT HUB.

## Customer Side

During checkout, provide:

```text
Have a Coupon?
[ Enter Coupon Code ] [ Apply ]
```

When a valid coupon is applied:

- Show the discount.
- Update the order total.
- Show the applied coupon.
- Allow the customer to remove the coupon.

Invalid/expired/used coupons must display an appropriate error message.

## One-Time Coupon Requirement

The client specifically requires **one-time-valid coupons**.

A coupon must be configurable as:

- One-time use
- Multiple-use

For one-time coupons:

- Once successfully used in a completed order, the coupon cannot be reused by the same customer.
- Prevent duplicate usage through backend/database validation, not only frontend logic.
- Do not mark a coupon as used merely because it was entered.
- Coupon usage should be recorded only when the order/payment is successfully completed according to the existing checkout/payment architecture.

## Admin Side

Add a Coupon Management section.

Admin must be able to:

- Create coupon
- Edit coupon
- Enable/disable coupon
- Delete/deactivate coupon
- Set coupon code
- Set discount type:
  - Percentage
  - Fixed amount
- Set discount value
- Set minimum order value
- Set maximum discount if percentage-based
- Set validity start/end date
- Set usage type:
  - One-time
  - Multiple-use
- Set total usage limit if required
- View coupon usage/history

Suggested database structure:

```text
coupons
coupon_usages
```

Make coupon codes case-insensitive and prevent duplicate active coupon codes.

---

# 2. PRODUCTS SECTION UPDATE

Update the main Products experience.

When the customer selects **Products**, present three options:

```text
PRODUCTS

┌─────────────────────┐
│ 🆕 FRESH ITEMS      │
│ New IT HUB Products │
└─────────────────────┘

┌─────────────────────┐
│ ♻️ SECOND-HAND      │
│ Pre-owned Products  │
└─────────────────────┘

┌─────────────────────┐
│ 💰 SELL YOUR ITEM   │
│ Sell your device    │
└─────────────────────┘
```

The three sections must be visually distinct but remain part of the same Products experience.

---

# 3. FRESH ITEMS

Keep the existing normal IT HUB product shopping functionality.

Fresh Items should represent:

- Brand-new products
- Normal product listing
- Product details
- Pricing
- Stock
- Cart
- Checkout
- Existing product filters/search/etc.

Do not break the current product system.

---

# 4. SECOND-HAND ITEMS

Create a dedicated section for **verified pre-owned / second-hand products**.

Second-hand products should have their own product classification.

Admin should be able to identify whether a product is:

```text
Fresh
Second-Hand
```

Second-hand products should support the existing product architecture wherever applicable:

- Product images
- Product name
- Description
- Condition
- Price
- Availability
- Category
- Relevant specifications

Add a clear visual indication that the product is **Second-Hand / Pre-Owned**.

Do not mix fresh and second-hand inventory incorrectly.

---

# 5. SELL YOUR ITEM — OLX-STYLE FLOW

The third option is:

**Sell Your Item**

This allows customers to submit their own electronic products to IT HUB for evaluation/purchase.

Possible categories:

```text
Phone
Laptop
Desktop / PC
Monitor
Printer
Tablet
Accessories
Other Electronics
```

The exact category list should remain compatible with the existing product/category architecture.

---

# 6. SELL YOUR ITEM USER FLOW

Create the following flow:

```text
SELL YOUR ITEM
      ↓
SELECT CATEGORY
      ↓
ENTER PRODUCT DETAILS
      ↓
WARRANTY STATUS
      ↓
 ┌───────────────┐
 │               │
 YES             NO
 │               │
 ▼               ▼
Warranty       Product
Details        Details
 │               │
Invoice         Product
Upload          Images
 │               │
Product         Description
Images           │
 │               │
 └───────┬───────┘
         ↓
      SUBMIT
         ↓
    UNDER REVIEW
         ↓
IT HUB WILL CONTACT YOU
AFTER VALIDATION
```

---

# 7. WARRANTY = YES FLOW

If the customer selects:

**Yes, warranty remains**

Ask for:

### Warranty Information

- Warranty status
- Warranty remaining period
- Warranty provider/brand if applicable
- Warranty details

### Required uploads

- Product images
- Original invoice/bill

Allow multiple product images.

The invoice should be securely uploaded to Supabase Storage.

Do NOT expose the invoice publicly.

Only authorized admins should be able to access it.

---

# 8. WARRANTY = NO FLOW

If the customer selects:

**No warranty**

Do NOT request an invoice as a mandatory field.

Ask for:

- Product images
- Product details
- Condition/details of the item
- Any relevant information required for evaluation

Then allow the customer to submit the request.

---

# 9. PRODUCT IMAGE UPLOAD

Implement proper upload handling.

Requirements:

- Multiple images
- Image preview before submission
- Remove image option
- File type validation
- File size validation
- Secure Supabase Storage upload
- Store file references/paths in database
- Do not store image binary data directly in database

Use appropriate storage organization, for example:

```text
sell-requests/
    {request_id}/
        product-images/
        invoice/
```

The exact bucket/path structure can be adapted to the existing Supabase architecture.

---

# 10. CUSTOMER SUBMISSION RESULT

After successfully submitting a Sell Your Item request, show a dedicated confirmation screen.

Example:

```text
✓ REQUEST SUBMITTED

Your product has been submitted successfully.

Our IT HUB team will review the information
and contact you after validation.

Request ID:
#ITHUB-XXXXXX

Status:
UNDER REVIEW
```

Do not immediately list the customer's item publicly.

This is an **evaluation/request system**, not an automatic marketplace listing.

---

# 11. ADMIN SELL REQUEST MANAGEMENT

Create a dedicated section inside the Admin Dashboard:

```text
SELL REQUESTS
```

Admin should be able to view incoming requests.

Provide filtering/grouping by:

### Category

```text
All
Phones
Laptops
PCs
Monitors
Printers
Tablets
Accessories
Other
```

### Warranty

```text
All
Warranty Available
No Warranty
```

### Status

```text
Pending
Under Review
Contacted
Approved
Rejected
Completed
```

---

# 12. ADMIN SELL REQUEST DETAILS

When an admin opens a request, show:

### Customer Information

- Customer name
- Email
- Phone/contact details
- Submission date

### Product Information

- Category
- Product name/model
- Description
- Condition
- Warranty status
- Warranty remaining period
- Warranty provider/details where applicable

### Uploaded Files

- Product images
- Invoice/bill when available

### Admin Controls

Admin should be able to:

- Change status
- Add internal notes
- Mark customer as contacted
- Approve request
- Reject request
- Mark completed

Suggested status flow:

```text
PENDING
   ↓
UNDER REVIEW
   ↓
CONTACTED
   ↓
APPROVED / REJECTED
   ↓
COMPLETED
```

Do not allow customers to modify admin-only status fields.

---

# 13. ADMIN UI ORGANIZATION

The admin dashboard should make it easy to distinguish:

```text
SELL REQUESTS

┌───────────────────────────────────────┐
│ Warranty Available                   │
│  ├── Phones                          │
│  ├── Laptops                         │
│  ├── PCs                             │
│  └── Others                          │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│ No Warranty                          │
│  ├── Phones                          │
│  ├── Laptops                         │
│  ├── PCs                             │
│  └── Others                          │
└───────────────────────────────────────┘
```

Also provide search/filter/sort functionality.

---

# 14. SUPABASE DATABASE

Extend the existing database safely.

Suggested tables:

```text
coupons
coupon_usages

sell_requests
sell_request_images
sell_request_documents
```

Possible `sell_requests` fields:

```text
id
customer_id
category_id
product_name
brand
model
description
condition
has_warranty
warranty_provider
warranty_remaining
status
admin_notes
created_at
updated_at
```

Possible `sell_request_images`:

```text
id
sell_request_id
storage_path
display_order
created_at
```

Possible `sell_request_documents`:

```text
id
sell_request_id
document_type
storage_path
created_at
```

Use the existing project naming conventions if they differ.

---

# 15. SECURITY / RLS

This is important.

Customers must only be able to:

- Create their own sell request
- View their own submitted requests
- Upload files belonging to their own request
- View their own request status

Customers must NOT be able to:

- View other customers' requests
- View other customers' invoices
- View admin notes
- Change request status
- Access private invoice files
- Access admin coupon management

Admins should have appropriate access according to the existing IT HUB RBAC system.

Implement/modify Supabase RLS policies accordingly.

---

# 16. COURIER / DIAGNOSIS CHARGE UPDATE

Update the existing courier/service request flow.

The client does NOT want the customer-facing interface to explicitly display a separate **Courier Cost**.

Instead, incorporate the applicable courier/pickup component into the overall:

**Diagnosis Charge**

Customer-facing presentation should therefore look like:

```text
Service Request

Diagnosis Charge
₹XXXX

[ Continue ]
```

Do NOT display:

```text
Courier Cost
₹XXX
```

as a separate customer-facing line item.

However, internally the backend/database may maintain separate cost components if required for accounting, reporting, or future business logic.

The customer should only see the final applicable Diagnosis Charge according to the business rules.

Make sure this does not break the existing courier/service workflow.

---

# 17. AUDIT LOGS

Integrate these new actions with the existing audit-log system.

Record important admin actions such as:

```text
Coupon Created
Coupon Updated
Coupon Disabled
Coupon Used
Sell Request Submitted
Sell Request Status Changed
Sell Request Approved
Sell Request Rejected
Admin Notes Updated
```

Do not log sensitive file contents.

Store appropriate metadata instead.

---

# 18. NOTIFICATIONS

Use the existing notification architecture if available.

At minimum, the system should be structured so that notifications can later be triggered for:

```text
Sell Request Submitted
Sell Request Under Review
Customer Contacted
Sell Request Approved
Sell Request Rejected
```

Do not introduce a completely separate notification architecture if one already exists.

---

# 19. UI/UX REQUIREMENTS

Maintain the existing IT HUB design system.

The new UI should feel like a natural extension of the current website.

Prioritize:

- Mobile responsiveness
- Clean cards
- Clear CTAs
- Simple forms
- Good upload UX
- Progress/step indicators for Sell Your Item
- Clear status badges
- Empty states
- Loading states
- Error states
- Success states
- Confirmation dialogs for destructive admin actions

Avoid unnecessarily complex animations.

The primary goal is usability and conversion.

---

# 20. VALIDATION & EDGE CASES

Handle at minimum:

- Expired coupon
- Disabled coupon
- Invalid coupon
- Already-used one-time coupon
- Coupon minimum order not reached
- Duplicate coupon codes
- Missing required product details
- Warranty selected but invoice missing
- Invalid image format
- Image too large
- Failed upload
- Failed submission
- Duplicate sell request submission
- Unauthorized admin access
- Customer attempting to access another customer's request
- Customer attempting to modify request status

---

# 21. IMPLEMENTATION PROCESS

Before modifying code:

1. Inspect the existing project architecture.
2. Identify the existing:
   - Product system
   - Admin dashboard
   - Authentication
   - Supabase schema
   - Storage buckets
   - Checkout/payment flow
   - Service/courier system
   - Audit logging
   - RBAC
3. Identify reusable components.
4. Implement database migrations first where required.
5. Implement Supabase RLS policies.
6. Implement backend/data-access logic.
7. Implement customer UI.
8. Implement admin UI.
9. Integrate audit logs.
10. Test all major flows.
11. Fix TypeScript/lint/build errors.
12. Verify that all existing features continue working.

---

# 22. FINAL ACCEPTANCE CHECKLIST

Before considering this update complete, verify:

### Coupons
- [ ] Admin can create coupons
- [ ] Admin can manage coupons
- [ ] Customer can apply coupons
- [ ] One-time coupons cannot be reused
- [ ] Coupon usage is securely recorded
- [ ] Invalid/expired coupons are handled

### Products
- [ ] Fresh Items works
- [ ] Second-Hand Items works
- [ ] Sell Your Item works
- [ ] Fresh and second-hand products remain properly separated

### Sell Your Item
- [ ] Category selection works
- [ ] Warranty YES flow works
- [ ] Warranty NO flow works
- [ ] Invoice upload works for warranty products
- [ ] Product image upload works
- [ ] Request submission works
- [ ] Under Review screen works
- [ ] Request ID is generated
- [ ] Admin can view requests
- [ ] Admin can filter by category
- [ ] Admin can filter by warranty
- [ ] Admin can update status
- [ ] Admin can add notes
- [ ] Customer cannot access another customer's data

### Courier / Diagnosis
- [ ] Courier-related amount is not displayed separately to customers
- [ ] Applicable cost is incorporated into Diagnosis Charge
- [ ] Existing service workflow still works

### Security
- [ ] Supabase RLS verified
- [ ] Private invoices protected
- [ ] Admin-only actions protected
- [ ] Audit logs updated
- [ ] No sensitive data exposed

### Quality
- [ ] Responsive UI
- [ ] Loading states
- [ ] Error states
- [ ] Empty states
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Production build succeeds

## IMPORTANT

After implementation, provide a concise summary containing:

1. Files/components changed
2. Database migrations added
3. RLS policies added/modified
4. Storage changes
5. Customer-side changes
6. Admin-side changes
7. Testing performed
8. Any remaining issues or decisions requiring client confirmation

Do not rewrite unrelated parts of the application.
Only make changes required for this feature update and necessary supporting infrastructure.