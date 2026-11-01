-- ============================================================================
-- Migration: 20261026000006_secure_service_tracking.sql
-- Description: Audited, secure service tracking with guest token verification,
-- canonical staff RBAC enforcement (can_manage_services), eight-character hex
-- prefix format validation, Priority-1 guest token prefix collision disambiguation,
-- strict exclusion of user_id (replaced with is_owner boolean), safe parsing of
-- booleans/numerics with no runtime cast exceptions, deterministic stable IDs,
-- and distinct representation of missing prices vs genuine zero prices.
-- ============================================================================

-- Ensure pgcrypto extension is active for gen_random_bytes
create extension if not exists "pgcrypto";

-- 1. High-entropy guest tracking token and supporting workflow columns
alter table public.service_requests
  add column if not exists guest_tracking_token text,
  add column if not exists approved_items text[] not null default '{}',
  add column if not exists declined_items text[] not null default '{}',
  add column if not exists decision_notes text,
  add column if not exists decision_at timestamptz;

update public.service_requests
set guest_tracking_token = encode(gen_random_bytes(16), 'hex')
where guest_tracking_token is null;

alter table public.service_requests
  alter column guest_tracking_token set default encode(gen_random_bytes(16), 'hex');

create index if not exists idx_service_requests_guest_token
  on public.service_requests (guest_tracking_token);

-- 2. Drop any previous draft
drop function if exists public.get_service_request_tracking(text);
drop function if exists public.get_service_request_tracking(text, text);

-- 3. Create audited secure service tracking RPC
create or replace function public.get_service_request_tracking(
  p_tracking_id text,
  p_guest_token text default null
)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_clean text;
  v_rec record;
  v_auth_uid uuid := auth.uid();
  v_is_staff boolean := false;
  v_match_count integer := 0;
  v_safe_findings jsonb := '[]'::jsonb;
  v_safe_quotation_items jsonb := '[]'::jsonb;
  v_safe_decision_notes text := null;
begin
  if p_tracking_id is null or trim(p_tracking_id) = '' then
    return null;
  end if;

  -- Clean input: remove '#' prefix and trim whitespace
  v_clean := lower(trim(regexp_replace(p_tracking_id, '^[#\s]+', '')));

  -- Canonical Staff Authorization / RBAC check:
  -- Only portal_admin and service_staff (with is_active = true) can view all service requests.
  -- Deactivated staff or quotation_staff are strictly excluded.
  begin
    v_is_staff := coalesce(public.can_manage_services(), false);
  exception when undefined_function then
    v_is_staff := (v_auth_uid is not null) and (
      exists (
        select 1 from public.staff_members
        where user_id = v_auth_uid and is_active = true and role in ('portal_admin', 'service_staff')
      ) or exists (
        select 1 from public.profiles
        where id = v_auth_uid and role = 'admin'
      )
    );
  end;

  -- 1. EXACT FULL-UUID LOOKUP (36 characters)
  if v_clean ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into v_rec
    from public.service_requests
    where id = v_clean::uuid;

    if not found then
      return null;
    end if;

  -- 2. EXACT EIGHT-CHARACTER HEX PREFIX LOOKUP
  elsif v_clean ~ '^[0-9a-f]{8}$' then
    -- PRIORITY 1: High-entropy guest tracking token provided.
    -- Resolves prefix collisions safely by binding directly to the token secret,
    -- allowing a user authenticated as another customer to track with a shared guest token.
    if p_guest_token is not null and trim(p_guest_token) <> '' then
      select * into v_rec
      from public.service_requests
      where id::text ilike v_clean || '%'
        and guest_tracking_token = trim(p_guest_token);

      if not found then
        return null;
      end if;

    -- PRIORITY 2: Authorized staff member (portal_admin or active service_staff)
    elsif v_is_staff then
      select count(*) into v_match_count
      from public.service_requests
      where id::text ilike v_clean || '%';

      if v_match_count = 1 then
        select * into v_rec
        from public.service_requests
        where id::text ilike v_clean || '%';
      else
        -- 0 matches or ambiguous collision among multiple tickets (staff must use full UUID)
        return null;
      end if;

    -- PRIORITY 3: Authenticated customer looking up their own ticket
    elsif v_auth_uid is not null then
      select count(*) into v_match_count
      from public.service_requests
      where id::text ilike v_clean || '%'
        and user_id = v_auth_uid;

      if v_match_count = 1 then
        select * into v_rec
        from public.service_requests
        where id::text ilike v_clean || '%'
          and user_id = v_auth_uid;
      else
        -- 0 matches or multiple colliding tickets owned by same user
        return null;
      end if;

    -- PRIORITY 4: Anonymous caller without guest token
    else
      -- Anonymous prefix scraping without a valid guest token is strictly rejected
      return null;
    end if;

  else
    -- Reject all other formats (e.g. arbitrary length, invalid hex, short strings < 8 chars)
    return null;
  end if;

  -- AUTHORIZATION POLICY:
  -- Case A: Authorized staff member (portal_admin or service_staff)
  -- Case B: Authenticated ticket owner (user_id matches auth.uid())
  -- Case C: Guest caller providing exact cryptographic guest_tracking_token
  -- If none of the above match, reject access (returns null to block enumeration)
  if not (
    v_is_staff
    or (v_auth_uid is not null and v_rec.user_id = v_auth_uid)
    or (p_guest_token is not null and trim(p_guest_token) <> '' and v_rec.guest_tracking_token = trim(p_guest_token))
  ) then
    return null;
  end if;

  -- CUSTOMER-SAFE PROJECTION FOR DIAGNOSIS FINDINGS:
  -- Internal technician notes, staff UUIDs, supplier costs, and raw private metadata
  -- are strictly excluded.
  -- Preserves stable IDs (or deterministic ordinal IDs) without generating random UUIDs on each read.
  -- Safe boolean parsing ensures malformed legacy values never trigger runtime exceptions.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', coalesce(
          nullif(trim(elem->>'id'), ''),
          nullif(trim(elem->>'findingId'), ''),
          nullif(trim(elem->>'finding_id'), ''),
          'finding-' || ord::text
        ),
        'title', coalesce(nullif(trim(elem->>'title'), ''), 'Diagnostic Observation'),
        'description', coalesce(elem->>'description', ''),
        'customerExplanation', coalesce(nullif(trim(elem->>'customerExplanation'), ''), nullif(trim(elem->>'customer_explanation'), ''), elem->>'description', ''),
        'recommendedRepair', coalesce(elem->>'recommendedRepair', elem->>'recommended_repair', ''),
        'source', case
          when lower(trim(coalesce(elem->>'source', ''))) in ('customer', 'technician') then lower(trim(elem->>'source'))
          else 'technician'
        end,
        'safety', case
          when lower(trim(coalesce(elem->>'safety', ''))) in ('required', 'recommended', 'optional') then lower(trim(elem->>'safety'))
          else 'optional'
        end,
        'classification', case
          when lower(trim(coalesce(elem->>'classification', ''))) in ('confirmed', 'suspected', 'customer_reported', 'prevention') then lower(trim(elem->>'classification'))
          else 'confirmed'
        end,
        'isEligibleForRepair', coalesce(
          case
            when lower(trim(coalesce(elem->>'isEligibleForRepair', elem->>'is_eligible_for_repair', ''))) in ('true', 't', '1', 'yes') then true
            when lower(trim(coalesce(elem->>'isEligibleForRepair', elem->>'is_eligible_for_repair', ''))) in ('false', 'f', '0', 'no') then false
            else null
          end,
          true
        ),
        'createdAt', coalesce(nullif(trim(elem->>'createdAt'), ''), nullif(trim(elem->>'created_at'), ''), to_char(v_rec.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
      )
      order by ord
    ),
    '[]'::jsonb
  ) into v_safe_findings
  from jsonb_array_elements(
    case
      when jsonb_typeof(v_rec.findings) = 'array' then v_rec.findings
      else '[]'::jsonb
    end
  ) with ordinality as f(elem, ord);

  -- CUSTOMER-SAFE PROJECTION FOR ITEMIZE QUOTATION ITEMS:
  -- Strips internal markup, wholesale distributor rates, and staff notes.
  -- Validates numeric and boolean types defensively without crashing on legacy malformed fields.
  -- Distinguishes genuine zero prices (₹0) from missing/unpriced items (null), never inventing totals.
  -- Guarantees stable deterministic IDs if item id was omitted in database.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', parsed.id,
        'findingId', parsed.finding_id,
        'title', parsed.title,
        'description', parsed.description,
        'partCost', parsed.part_cost,
        'labourCost', parsed.labour_cost,
        'quantity', parsed.quantity,
        'discount', parsed.discount,
        'lineTotal', coalesce(
          parsed.explicit_line_total,
          case
            when parsed.part_cost is not null and parsed.labour_cost is not null
            then (parsed.part_cost + parsed.labour_cost) * parsed.quantity - coalesce(parsed.discount, 0)
            else null
          end
        ),
        'isRequired', parsed.is_required,
        'canDefer', parsed.can_defer,
        'dependsOn', parsed.depends_on,
        'approvalState', parsed.approval_state,
        'requirementLevel', parsed.requirement_level
      )
      order by parsed.ord
    ),
    '[]'::jsonb
  ) into v_safe_quotation_items
  from (
    select
      ord,
      coalesce(
        nullif(trim(elem->>'id'), ''),
        nullif(trim(elem->>'findingId'), ''),
        nullif(trim(elem->>'itemId'), ''),
        nullif(trim(elem->>'item_id'), ''),
        'item-' || ord::text
      ) as id,
      coalesce(nullif(trim(elem->>'findingId'), ''), nullif(trim(elem->>'finding_id'), '')) as finding_id,
      coalesce(nullif(trim(elem->>'title'), ''), 'Service Item') as title,
      coalesce(elem->>'description', '') as description,
      case
        when trim(coalesce(elem->>'partCost', elem->>'part_cost', '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (trim(coalesce(elem->>'partCost', elem->>'part_cost')))::numeric
        else null
      end as part_cost,
      case
        when trim(coalesce(elem->>'labourCost', elem->>'labour_cost', '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (trim(coalesce(elem->>'labourCost', elem->>'labour_cost')))::numeric
        else null
      end as labour_cost,
      case
        when trim(coalesce(elem->>'quantity', '')) ~ '^[0-9]+(\.[0-9]+)?$'
          and (trim(elem->>'quantity'))::numeric > 0
        then (trim(elem->>'quantity'))::numeric
        else 1
      end as quantity,
      case
        when trim(coalesce(elem->>'discount', '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (trim(elem->>'discount'))::numeric
        else 0
      end as discount,
      case
        when trim(coalesce(elem->>'lineTotal', elem->>'line_total', '')) ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (trim(coalesce(elem->>'lineTotal', elem->>'line_total')))::numeric
        else null
      end as explicit_line_total,
      coalesce(
        case
          when lower(trim(coalesce(elem->>'requirementLevel', elem->>'requirement_level', ''))) = 'required' then true
          when lower(trim(coalesce(elem->>'isRequired', elem->>'is_required', ''))) in ('true', 't', '1', 'yes') then true
          when lower(trim(coalesce(elem->>'isRequired', elem->>'is_required', ''))) in ('false', 'f', '0', 'no') then false
          else null
        end,
        false
      ) as is_required,
      coalesce(
        case
          when lower(trim(coalesce(elem->>'requirementLevel', elem->>'requirement_level', ''))) = 'required' then false
          when lower(trim(coalesce(elem->>'isRequired', elem->>'is_required', ''))) in ('true', 't', '1', 'yes') then false
          when lower(trim(coalesce(elem->>'canDefer', elem->>'can_defer', ''))) in ('false', 'f', '0', 'no') then false
          when lower(trim(coalesce(elem->>'canDefer', elem->>'can_defer', ''))) in ('true', 't', '1', 'yes') then true
          else null
        end,
        true
      ) as can_defer,
      case
        when jsonb_typeof(coalesce(elem->'dependsOn', elem->'depends_on')) = 'array'
        then coalesce(elem->'dependsOn', elem->'depends_on')
        else '[]'::jsonb
      end as depends_on,
      case
        when lower(trim(coalesce(elem->>'approvalState', elem->>'approval_state', ''))) in ('pending', 'approved', 'declined', 'deferred', 'rejected')
        then lower(trim(coalesce(elem->>'approvalState', elem->>'approval_state')))
        else 'pending'
      end as approval_state,
      coalesce(
        nullif(trim(elem->>'requirementLevel'), ''),
        nullif(trim(elem->>'requirement_level'), ''),
        case
          when lower(trim(coalesce(elem->>'isRequired', elem->>'is_required', ''))) in ('true', 't', '1', 'yes') then 'required'
          else 'optional'
        end
      ) as requirement_level
    from jsonb_array_elements(
      case
        when jsonb_typeof(v_rec.quotation_items) = 'array' then v_rec.quotation_items
        else '[]'::jsonb
      end
    ) with ordinality as t(elem, ord)
  ) as parsed;

  -- Bounded and sanitized decision notes
  if v_rec.decision_notes is not null and trim(v_rec.decision_notes) <> '' then
    v_safe_decision_notes := substring(trim(v_rec.decision_notes) from 1 for 1000);
  end if;

  -- NARROW, PUBLIC-SAFE PROJECTION:
  -- user_id is completely eliminated from the response; replaced with computed is_owner boolean.
  -- Internal workshop notes ('notes'), customer contact details (name, email, phone, address),
  -- and guest tracking tokens are strictly redacted.
  return jsonb_build_object(
    'id', v_rec.id,
    'is_owner', (v_auth_uid is not null and v_rec.user_id = v_auth_uid),
    'device', v_rec.device,
    'model', v_rec.model,
    'problem', v_rec.problem,
    'method', v_rec.method,
    'status', v_rec.status,
    'quote', v_rec.quote,
    'quote_state', v_rec.quote_state,
    'quote_version', coalesce(v_rec.quote_version, 1),
    'technician_name', v_rec.technician_name,
    'courier_charge_return_delivery', v_rec.courier_charge_return_delivery,
    'findings', v_safe_findings,
    'quotation_items', v_safe_quotation_items,
    'approved_items', coalesce(v_rec.approved_items, '{}'::text[]),
    'declined_items', coalesce(v_rec.declined_items, '{}'::text[]),
    'decision_notes', v_safe_decision_notes,
    'decision_at', v_rec.decision_at,
    'created_at', v_rec.created_at,
    'updated_at', v_rec.updated_at
  );
end;
$$;

-- 4. Access controls: revoke broad public execute, grant strictly to authenticated and anon
revoke all on function public.get_service_request_tracking(text, text) from public;
grant execute on function public.get_service_request_tracking(text, text) to anon, authenticated;
