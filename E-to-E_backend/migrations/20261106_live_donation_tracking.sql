-- Live delivery tracking and volunteer acceptance.
-- Apply after the existing application schema has been created.

-- The base schema predates volunteer logins, although the later organization
-- migration already documents volunteers as profile roles.
alter type public.user_role add value if not exists 'volunteer';

alter table public.volunteers
  add column if not exists profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_updated_at timestamptz;

alter table public.deliveries
  add column if not exists volunteer_assigned_at timestamptz,
  add column if not exists location_latitude double precision,
  add column if not exists location_longitude double precision,
  add column if not exists location_updated_at timestamptz,
  add column if not exists collection_verified_at timestamptz;

do $$
begin
  if not exists (
    select 1 from public.volunteers
    where profile_id is not null
    group by profile_id having count(*) > 1
  ) then
    create unique index if not exists volunteers_profile_id_unique
      on public.volunteers(profile_id)
      where profile_id is not null;
  else
    raise notice 'Duplicate volunteer profile links exist. Resolve them before linking those accounts.';
  end if;
end;
$$;

create index if not exists deliveries_open_for_volunteer_idx
  on public.deliveries(created_at desc)
  where volunteer_id is null and delivery_status = 'assigned';

create index if not exists volunteers_available_location_idx
  on public.volunteers(ngo_id, location_updated_at desc)
  where availability_status = true and profile_id is not null;

create index if not exists deliveries_volunteer_active_idx
  on public.deliveries(volunteer_id, delivery_status, created_at desc);

-- Keep OTP hashes and an encrypted display copy in a service-role-only table.
-- Delivery rows are published to Realtime, so the code must not live there.
create table if not exists public.delivery_collection_secrets (
  delivery_id uuid primary key references public.deliveries(delivery_id) on delete cascade,
  otp_hash text not null,
  otp_ciphertext text,
  otp_iv text,
  otp_tag text,
  expires_at timestamptz not null,
  attempt_count integer not null default 0,
  verified_at timestamptz,
  last_sent_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.delivery_collection_secrets
  add column if not exists last_sent_at timestamptz not null default now(),
  add column if not exists otp_ciphertext text,
  add column if not exists otp_iv text,
  add column if not exists otp_tag text;

alter table public.delivery_collection_secrets enable row level security;
revoke all on public.delivery_collection_secrets from anon, authenticated;
grant all on public.delivery_collection_secrets to service_role;

drop function if exists public.accept_volunteer_delivery(uuid, uuid, uuid, text, timestamptz);

create or replace function public.accept_volunteer_delivery(
  p_delivery_id uuid,
  p_volunteer_id uuid,
  p_profile_id uuid,
  p_otp_hash text,
  p_otp_expires_at timestamptz,
  p_otp_ciphertext text,
  p_otp_iv text,
  p_otp_tag text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_delivery_id uuid;
  v_ngo_id uuid;
begin
  if p_otp_hash is null or p_otp_hash = ''
     or p_otp_ciphertext is null or p_otp_iv is null or p_otp_tag is null
     or p_otp_expires_at <= now() then
    raise exception 'INVALID_OTP_SETUP';
  end if;

  -- Serialize accepts for the same volunteer and do not allow one volunteer
  -- to pick up another active delivery while already assigned.
  select v.ngo_id into v_ngo_id
  from public.volunteers v
  where v.volunteer_id = p_volunteer_id
    and v.profile_id = p_profile_id
    and v.availability_status = true
  for update;

  if not found then
    raise exception 'VOLUNTEER_UNAVAILABLE';
  end if;

  if exists (
    select 1 from public.deliveries active
    where active.volunteer_id = p_volunteer_id
      and active.delivery_status in ('assigned', 'in_transit')
  ) then
    raise exception 'VOLUNTEER_HAS_ACTIVE_DELIVERY';
  end if;

  -- The row lock and conditional update make concurrent accepts mutually exclusive.
  select d.delivery_id into v_delivery_id
  from public.deliveries d
  join public.ngo_claims c on c.claim_id = d.claim_id
  where d.delivery_id = p_delivery_id
    and d.volunteer_id is null
    and d.delivery_status = 'assigned'
    and c.ngo_id = v_ngo_id
  for update;

  if not found then
    raise exception 'DELIVERY_UNAVAILABLE';
  end if;

  update public.deliveries
  set volunteer_id = p_volunteer_id,
      volunteer_assigned_at = now(),
      location_latitude = null,
      location_longitude = null,
      location_updated_at = null,
      collection_verified_at = null
  where delivery_id = v_delivery_id;

  insert into public.delivery_collection_secrets (
    delivery_id, otp_hash, otp_ciphertext, otp_iv, otp_tag,
    expires_at, attempt_count, verified_at, updated_at
  ) values (
    v_delivery_id, p_otp_hash, p_otp_ciphertext, p_otp_iv, p_otp_tag,
    p_otp_expires_at, 0, null, now()
  )
  on conflict (delivery_id) do update set
    otp_hash = excluded.otp_hash,
    otp_ciphertext = excluded.otp_ciphertext,
    otp_iv = excluded.otp_iv,
    otp_tag = excluded.otp_tag,
    expires_at = excluded.expires_at,
    attempt_count = 0,
    verified_at = null,
    last_sent_at = now(),
    updated_at = now();

  update public.volunteers
  set availability_status = false
  where volunteer_id = p_volunteer_id;

  return v_delivery_id;
end;
$$;

revoke all on function public.accept_volunteer_delivery(uuid, uuid, uuid, text, timestamptz, text, text, text) from public, anon, authenticated;
grant execute on function public.accept_volunteer_delivery(uuid, uuid, uuid, text, timestamptz, text, text, text) to service_role;

create or replace function public.verify_delivery_collection_otp(
  p_delivery_id uuid,
  p_volunteer_id uuid,
  p_candidate_hash text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_secret public.delivery_collection_secrets%rowtype;
begin
  perform 1 from public.deliveries d
  where d.delivery_id = p_delivery_id
    and d.volunteer_id = p_volunteer_id
    and d.delivery_status = 'assigned'
  for update;
  if not found then
    return 'delivery_unavailable';
  end if;

  select * into v_secret
  from public.delivery_collection_secrets s
  where s.delivery_id = p_delivery_id
  for update;

  if not found then return 'not_found'; end if;
  if v_secret.verified_at is not null then return 'already_verified'; end if;
  if v_secret.expires_at <= now() then return 'expired'; end if;
  if v_secret.attempt_count >= 5 then return 'locked'; end if;

  if p_candidate_hash is null or v_secret.otp_hash <> p_candidate_hash then
    update public.delivery_collection_secrets
    set attempt_count = attempt_count + 1, updated_at = now()
    where delivery_id = p_delivery_id;
    return 'invalid';
  end if;

  update public.delivery_collection_secrets
  set verified_at = now(), updated_at = now()
  where delivery_id = p_delivery_id;

  update public.deliveries
  set collection_verified_at = now(),
      pickup_time = coalesce(pickup_time, now()),
      delivery_status = 'in_transit'
  where delivery_id = p_delivery_id
    and volunteer_id = p_volunteer_id
    and delivery_status = 'assigned';

  return 'verified';
end;
$$;

revoke all on function public.verify_delivery_collection_otp(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.verify_delivery_collection_otp(uuid, uuid, text) to service_role;

drop function if exists public.rotate_delivery_collection_otp(uuid, uuid, text, timestamptz);

create or replace function public.rotate_delivery_collection_otp(
  p_delivery_id uuid,
  p_donor_profile_id uuid,
  p_otp_hash text,
  p_otp_expires_at timestamptz,
  p_otp_ciphertext text,
  p_otp_iv text,
  p_otp_tag text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_secret public.delivery_collection_secrets%rowtype;
begin
  perform 1
  from public.deliveries d
  join public.ngo_claims c on c.claim_id = d.claim_id
  join public.food_listings l on l.listing_id = c.listing_id
  join public.donors donor on donor.donor_id = l.donor_id
  where d.delivery_id = p_delivery_id
    and d.volunteer_id is not null
    and d.delivery_status in ('assigned', 'in_transit')
    and donor.profile_id = p_donor_profile_id
  for update of d;
  if not found then
    return 'not_authorized';
  end if;

  select * into v_secret
  from public.delivery_collection_secrets
  where delivery_id = p_delivery_id
  for update;
  if not found then return 'not_found'; end if;
  if v_secret.verified_at is not null then return 'verified'; end if;
  if v_secret.last_sent_at > now() - interval '60 seconds' then return 'cooldown'; end if;

  update public.delivery_collection_secrets
  set otp_hash = p_otp_hash,
      otp_ciphertext = p_otp_ciphertext,
      otp_iv = p_otp_iv,
      otp_tag = p_otp_tag,
      expires_at = p_otp_expires_at,
      attempt_count = 0,
      last_sent_at = now(),
      updated_at = now()
  where delivery_id = p_delivery_id;
  return 'rotated';
end;
$$;

revoke all on function public.rotate_delivery_collection_otp(uuid, uuid, text, timestamptz, text, text, text) from public, anon, authenticated;
grant execute on function public.rotate_delivery_collection_otp(uuid, uuid, text, timestamptz, text, text, text) to service_role;

create or replace function public.release_volunteer_delivery(
  p_delivery_id uuid,
  p_volunteer_id uuid,
  p_profile_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Lock the volunteer first, matching the acceptance function's lock order.
  perform 1
  from public.volunteers v
  where v.volunteer_id = p_volunteer_id
    and v.profile_id = p_profile_id
  for update;
  if not found then return 'not_authorized'; end if;

  -- Once the donor code has been verified, the volunteer has collected the food
  -- and must complete or report the delivery instead of releasing it.
  perform 1
  from public.deliveries d
  where d.delivery_id = p_delivery_id
    and d.volunteer_id = p_volunteer_id
    and d.delivery_status = 'assigned'
    and d.collection_verified_at is null
  for update;
  if not found then return 'not_cancellable'; end if;

  delete from public.delivery_collection_secrets
  where delivery_id = p_delivery_id;

  update public.deliveries
  set volunteer_id = null,
      volunteer_assigned_at = null,
      pickup_time = null,
      location_latitude = null,
      location_longitude = null,
      location_updated_at = null,
      collection_verified_at = null
  where delivery_id = p_delivery_id;

  update public.volunteers
  set availability_status = true,
      latitude = null,
      longitude = null,
      location_updated_at = null
  where volunteer_id = p_volunteer_id;

  return 'released';
end;
$$;

revoke all on function public.release_volunteer_delivery(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_volunteer_delivery(uuid, uuid, uuid) to service_role;

-- Realtime reads are limited to the donor who owns the listing, its NGO, and
-- the volunteer assigned to the delivery. The API continues to use service_role.
alter table public.deliveries enable row level security;
grant select on public.deliveries to authenticated;

-- The base schema's "View assigned deliveries" policy uses USING (TRUE),
-- which is permissive and would OR with any participant policy. Use a
-- SECURITY DEFINER predicate so the ownership joins are evaluated without
-- exposing broader SELECT access to the related tables.
create or replace function public.can_read_delivery_tracking(
  p_claim_id uuid,
  p_volunteer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.ngo_claims c
    join public.food_listings l on l.listing_id = c.listing_id
    join public.donors d on d.donor_id = l.donor_id
    where c.claim_id = p_claim_id
      and d.profile_id = auth.uid()
  )
  or exists (
    select 1
    from public.ngo_claims c
    join public.ngos n on n.ngo_id = c.ngo_id
    where c.claim_id = p_claim_id
      and n.profile_id = auth.uid()
  )
  or exists (
    select 1
    from public.volunteers v
    where v.volunteer_id = p_volunteer_id
      and v.profile_id = auth.uid()
  );
$$;

revoke all on function public.can_read_delivery_tracking(uuid, uuid) from public, anon;
grant execute on function public.can_read_delivery_tracking(uuid, uuid) to authenticated;

drop policy if exists "View assigned deliveries" on public.deliveries;
drop policy if exists delivery_tracking_participant_read on public.deliveries;
create policy delivery_tracking_participant_read on public.deliveries
  for select to authenticated
  using (public.can_read_delivery_tracking(claim_id, volunteer_id));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'deliveries'
     ) then
    alter publication supabase_realtime add table public.deliveries;
  end if;
exception
  when insufficient_privilege then
    raise notice 'Add public.deliveries to supabase_realtime manually; migration role lacks publication privileges.';
end;
$$;
