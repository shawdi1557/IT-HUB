# Phase 2: Passwordless SMS OTP Authentication & Indian Gateway Hook

**Status**: Completed  
**Delivered Files**: [`src/lib/auth.ts`](file:///d:/mario/IT%20HUB/ITHUB_WEB/src/lib/auth.ts), [`src/components/AuthModal.tsx`](file:///d:/mario/IT%20HUB/ITHUB_WEB/src/components/AuthModal.tsx), [`supabase/functions/send-sms-hook/index.ts`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/functions/send-sms-hook/index.ts)

---

## 1. Objectives & Scope

- **Objective 1**: Implement passwordless mobile authentication designed for the Indian market (+91 domestic numbers).
- **Objective 2**: Normalize phone numbers to the E.164 standard across both frontend and backend layers.
- **Objective 3**: Implement a versatile Supabase Auth SMS Provider Webhook supporting major Indian SMS gateways (Fast2SMS, 2Factor, MSG91) with DLT template compliance.
- **Objective 4**: Support Supabase Test Phone Numbers so developers can test OTP flows without consuming SMS gateway credits.
- **Objective 5**: Ensure automatic customer profile reconciliation on successful authentication via the `ensure_profile()` RPC.

---

## 2. Technical Architecture & Authentication Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User as Customer (India)
    participant UI as AuthModal.tsx
    participant Client as src/lib/auth.ts
    participant GoTrue as Supabase Auth (GoTrue)
    participant Hook as send-sms-hook (Deno Edge Function)
    participant Gateway as Indian SMS Gateway (Fast2SMS / 2Factor / MSG91)
    participant DB as PostgreSQL (profiles)

    User->>UI: Enters 10-digit mobile (e.g. 98470 12345)
    UI->>Client: normalizePhone("9847012345")
    Client-->>UI: Normalized "+919847012345"
    UI->>Client: sendPhoneOtp("+919847012345")
    Client->>GoTrue: signInWithOtp(phone: "+919847012345")
    GoTrue->>Hook: POST /send-sms-hook (Webhook Payload)

    alt Test Phone Number Configured in Supabase
        Hook-->>GoTrue: 200 OK (Bypassed gateway, test OTP logged)
    else Live Indian Number
        Hook->>Gateway: POST /sms (DLT Header + 6-digit OTP)
        Gateway-->>User: Delivers Transactional SMS
        Gateway-->>Hook: 200 OK
        Hook-->>GoTrue: 200 OK
    end

    GoTrue-->>UI: OTP Dispatched Successfully
    User->>UI: Enters 6-digit OTP ("123456")
    UI->>Client: verifyPhoneOtp("+919847012345", "123456")
    Client->>GoTrue: verifyOtp(type: 'sms', token: '123456')
    GoTrue-->>Client: Returns JWT Session & User Object
    Client->>DB: RPC ensure_profile()
    DB-->>Client: Profile Provisioned / Synchronized
    Client-->>UI: Authenticated! Close Modal & Update Global State
```

---

## 3. Key Implementations

### 3.1. Client-Side Phone Utilities & Auth Service ([`src/lib/auth.ts`](file:///d:/mario/IT%20HUB/ITHUB_WEB/src/lib/auth.ts))
- **`normalizePhone(input: string)`**:
  - Strips non-digit characters, spaces, and hyphens.
  - Automatically prepends `+91` to standard 10-digit Indian numbers starting with 6, 7, 8, or 9.
  - Retains existing `+` country codes for international numbers.
  - Validates format: `^\+[1-9]\d{9,14}$`.
- **`sendPhoneOtp(phone: string)`**:
  - Triggers Supabase Auth's `signInWithOtp` with `{ shouldCreateUser: true }`.
  - Distinguishes between network timeouts, rate limit errors (HTTP 429), and gateway rejections.
- **`verifyPhoneOtp(phone: string, token: string)`**:
  - Validates the 6-digit verification code with `verifyOtp`.
  - Automatically invokes `fetchOrCreateProfile()` to ensure a matching row in `public.profiles`.
- **`subscribeToAuthChanges(callback)`**:
  - Listens to `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`, and `USER_UPDATED` events.

### 3.2. Interactive Customer UI ([`src/components/AuthModal.tsx`](file:///d:/mario/IT%20HUB/ITHUB_WEB/src/components/AuthModal.tsx))
- **Stateful Progression**: Transitions from Phone Input step $\rightarrow$ 6-digit OTP Verification step.
- **Resend Countdown Timer**: Prevents aggressive retry attempts by enforcing a 60-second cooldown timer.
- **Accessibility & Feedback**: Visual feedback with loading indicators, auto-focusing OTP input fields, and clear error messaging for expired/incorrect codes.

### 3.3. Serverless SMS Provider Hook ([`supabase/functions/send-sms-hook/index.ts`](file:///d:/mario/IT%20HUB/ITHUB_WEB/supabase/functions/send-sms-hook/index.ts))
The Edge Function serves as Supabase's HTTP hook for SMS dispatch, offering:
- **DLT Compliance (Telecom Regulatory Authority of India)**:
  - Supports registered DLT entity IDs, sender headers (`ITHUBK`), and pre-approved template IDs.
- **Multi-Gateway Routing**:
  - **Fast2SMS**: Native DLT template and Quick OTP API support.
  - **2Factor**: TSMS OTP endpoints.
  - **MSG91**: Flow-based transactional SMS APIs.
- **Development Test Number Bypass**:
  - Seamlessly handles configured test phone numbers without burning production SMS credits.
- **Security & Authorization**:
  - Validates incoming `Authorization` Bearer token against `HOOK_SECRET` to prevent unauthorized invocation.

---

## 4. Verification & Testing

- **Edge Function Unit & Security Suite**: 96/96 automated tests passing covering:
  - Phone normalization edge cases (leading zeros, spaces, international prefixes).
  - DLT payload construction for Fast2SMS, 2Factor, and MSG91.
  - Secret token verification and rejection of unauthenticated webhooks.
  - Error translation for invalid phone numbers and provider network failures.
- **Frontend Integration**: Production build compiles with zero TypeScript errors.

