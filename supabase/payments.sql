create table if not exists public.telegram_payments (
    telegram_payment_charge_id text primary key,
    telegram_id bigint not null,
    payload text not null,
    created_at timestamptz not null default now()
);

alter table public.telegram_payments enable row level security;

create table if not exists public.users (
    telegram_id bigint primary key,
    is_vip boolean not null default false,
    trial_count integer not null default 0 check (trial_count >= 0),
    created_at timestamptz not null default now()
);

create table if not exists public.inquiries (
    inquiry_id uuid primary key default gen_random_uuid(),
    telegram_id bigint not null references public.users(telegram_id),
    category text not null,
    destination text not null,
    dates text not null,
    status text not null default 'pending',
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

alter table public.inquiries add column if not exists details jsonb not null default '{}'::jsonb;

create table if not exists public.payments_log (
    charge_id text primary key,
    telegram_id bigint not null,
    package_id text not null,
    stars_paid integer not null,
    payload text not null,
    created_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.inquiries enable row level security;
alter table public.payments_log enable row level security;

create table if not exists public.deal_rates (
    rate_id uuid primary key default gen_random_uuid(),
    category text not null check (category in ('Hotels', 'Transfers', 'Sightseeing', 'Cruises', 'Packages', 'Festivals')),
    title text not null,
    unit text not null,
    reference_rate numeric(12, 2) not null check (reference_rate >= 0),
    our_rate numeric(12, 2) not null check (our_rate >= 0 and our_rate <= reference_rate),
    reference_source text not null default 'manual reference',
    freshness_label text not null default 'Reference snapshot',
    is_active boolean not null default true,
    updated_at timestamptz not null default now()
);

create index if not exists deal_rates_category_active_idx
    on public.deal_rates (category, is_active, updated_at desc);

alter table public.deal_rates enable row level security;

-- Example maintenance queries for the Supabase SQL Editor:
-- update public.deal_rates
-- set reference_rate = 220.00, our_rate = 198.00,
--     freshness_label = 'Reference snapshot · updated today', updated_at = now()
-- where category = 'Hotels' and title = 'Lisbon';
-- select * from public.deal_rates
-- where is_active = true order by category, title;

create or replace function public.create_inquiry(
    p_telegram_id bigint,
    p_category text,
    p_destination text,
    p_dates text,
    p_details jsonb default '{}'::jsonb
)
returns setof public.inquiries
language plpgsql
security definer
set search_path = public
as $$
declare
    account public.users;
begin
    if p_telegram_id is null or nullif(trim(p_category), '') is null
        or nullif(trim(p_destination), '') is null or nullif(trim(p_dates), '') is null then
        raise exception 'Inquiry fields are required' using errcode = '22023';
    end if;

    insert into public.users (telegram_id)
    values (p_telegram_id)
    on conflict (telegram_id) do nothing;

    select * into account
    from public.users
    where telegram_id = p_telegram_id
    for update;

    if not account.is_vip and account.trial_count >= 2 then
        raise exception 'Two free quotes have already been used' using errcode = 'P0001';
    end if;

    return query
    insert into public.inquiries (telegram_id, category, destination, dates, status)
    values (p_telegram_id, trim(p_category), trim(p_destination), trim(p_dates), 'received', coalesce(p_details, '{}'::jsonb))
    returning *;

    update public.users
    set trial_count = case when account.is_vip then trial_count else trial_count + 1 end
    where telegram_id = p_telegram_id;
end;
$$;

drop function if exists public.create_inquiry(bigint, text, text, text);

revoke execute on function public.create_inquiry(bigint, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_inquiry(bigint, text, text, text, jsonb) to service_role;

create table if not exists public.vip_access (
    telegram_id bigint primary key,
    package_id text not null,
    stars_paid integer not null,
    starts_at timestamptz not null default now(),
    expires_at timestamptz not null,
    updated_at timestamptz not null default now()
);

alter table public.vip_access enable row level security;

create or replace function public.grant_vip_access(
    p_telegram_id bigint,
    p_package_id text,
    p_stars_paid integer,
    p_payload text,
    p_charge_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    package_duration interval;
    package_stars integer;
begin
    select stars, duration
    into package_stars, package_duration
    from (values
        ('secret_miles_vip_monthly', 750, '30 days'::interval),
        ('secret_miles_vip_annual', 7500, '365 days'::interval),
        ('secret_miles_single_pass', 150, '1 day'::interval)
    ) as packages(package_id, stars, duration)
    where packages.package_id = p_package_id;

    if package_stars is null or p_stars_paid <> package_stars then
        raise exception 'Invalid VIP package or price';
    end if;

    if p_telegram_id is null or p_charge_id is null or p_payload is null then
        raise exception 'Payment identity is required';
    end if;

    insert into public.payments_log (charge_id, telegram_id, package_id, stars_paid, payload)
    values (p_charge_id, p_telegram_id, p_package_id, p_stars_paid, p_payload)
    on conflict (charge_id) do nothing
    returning charge_id;

    if not found then
        return;
    end if;

    insert into public.users (telegram_id, is_vip, trial_count)
    values (p_telegram_id, true, 0)
    on conflict (telegram_id) do update
    set is_vip = true;

    insert into public.vip_access (telegram_id, package_id, stars_paid, starts_at, expires_at, updated_at)
    values (
        p_telegram_id,
        p_package_id,
        p_stars_paid,
        now(),
        now() + package_duration,
        now()
    )
    on conflict (telegram_id) do update
    set package_id = excluded.package_id,
        stars_paid = excluded.stars_paid,
        starts_at = excluded.starts_at,
        expires_at = greatest(vip_access.expires_at, now()) + package_duration,
        updated_at = excluded.updated_at;
end;
$$;

revoke execute on function public.grant_vip_access(bigint, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.grant_vip_access(bigint, text, integer, text, text) to service_role;

create or replace function public.grant_meme_pack(
    p_telegram_id bigint,
    p_meme_amount integer,
    p_payload text,
    p_charge_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.telegram_payments (telegram_payment_charge_id, telegram_id, payload)
    values (p_charge_id, p_telegram_id, p_payload)
    on conflict (telegram_payment_charge_id) do nothing;

    if found then
        insert into public.players (telegram_id, meme_balance, updated_at)
        values (p_telegram_id, p_meme_amount, now())
        on conflict (telegram_id) do update
        set meme_balance = players.meme_balance + excluded.meme_balance,
            updated_at = now();
    end if;
end;
$$;

create or replace function public.grant_energy_pack(
    p_telegram_id bigint,
    p_energy integer,
    p_charge_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.telegram_payments (telegram_payment_charge_id, telegram_id, payload)
    values (p_charge_id, p_telegram_id, 'energy_pack_5000')
    on conflict (telegram_payment_charge_id) do nothing;

    if found then
        insert into public.players (telegram_id, energy, updated_at)
        values (p_telegram_id, p_energy, now())
        on conflict (telegram_id) do update
        set energy = players.energy + excluded.energy,
            updated_at = now();
    end if;
end;
$$;
