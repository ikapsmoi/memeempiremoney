create extension if not exists pgcrypto;

create table if not exists public.telegram_payments (
    telegram_payment_charge_id text primary key,
    telegram_id bigint not null,
    payload text not null,
    created_at timestamptz not null default now()
);

alter table public.telegram_payments enable row level security;

create table if not exists public.travel_deals (
    deal_id uuid primary key default gen_random_uuid(),
    title text not null unique,
    category text not null check (category in ('Hotels', 'Flights', 'Transfers', 'Packages', 'Sightseeing', 'Cruises', 'Festivals')),
    tag text not null,
    summary text not null,
    destination text not null,
    reference_price numeric(12, 2),
    deal_price numeric(12, 2),
    currency text not null default 'USD',
    emoji text not null default '✈️',
    is_active boolean not null default true,
    valid_until timestamptz,
    updated_at timestamptz not null default now(),
    check (reference_price is null or reference_price >= 0),
    check (deal_price is null or deal_price >= 0),
    check (reference_price is null or deal_price is null or deal_price <= reference_price)
);

create index if not exists travel_deals_active_idx
    on public.travel_deals (is_active, category, updated_at desc);

alter table public.travel_deals enable row level security;

insert into public.travel_deals (title, category, tag, summary, destination, reference_price, deal_price, emoji, valid_until)
values
    ('Bali Villas', 'Hotels', 'Hot Deal', 'Private villa stays with member-ready rates.', 'Bali', 900, 540, '🌴', now() + interval '30 days'),
    ('Tomorrowland', 'Festivals', 'Music Festival', 'Festival access and travel planning for Boom, Belgium.', 'Boom, Belgium', 1200, 1080, '🎪', now() + interval '30 days'),
    ('Maldives Escape', 'Packages', 'Luxury', 'Island stay planning with flights and transfers.', 'Maldives', 1800, 1620, '🚤', now() + interval '30 days')
on conflict do nothing;

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
    current_expiry timestamptz;
    inserted_charge_id text;
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

    insert into public.telegram_payments (telegram_payment_charge_id, telegram_id, payload)
    values (p_charge_id, p_telegram_id, p_payload)
    on conflict (telegram_payment_charge_id) do nothing
    returning telegram_payment_charge_id into inserted_charge_id;

    if inserted_charge_id is null then
        return;
    end if;

    select expires_at
    into current_expiry
    from public.vip_access
    where telegram_id = p_telegram_id
    for update;

    insert into public.vip_access (telegram_id, package_id, stars_paid, starts_at, expires_at, updated_at)
    values (
        p_telegram_id,
        p_package_id,
        p_stars_paid,
        now(),
        greatest(coalesce(current_expiry, now()), now()) + package_duration,
        now()
    )
    on conflict (telegram_id) do update
    set package_id = excluded.package_id,
        stars_paid = excluded.stars_paid,
        starts_at = excluded.starts_at,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at;
end;
$$;

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
