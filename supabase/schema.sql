create extension if not exists pgcrypto;

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

create table if not exists public.hot_package_rates (
    id uuid primary key default gen_random_uuid(),
    destination text not null,
    nights integer not null check (nights > 0),
    days integer not null check (days > 0),
    price numeric(12, 2) not null check (price >= 0),
    tag text not null default 'Hot',
    note text not null default 'Live deal',
    is_active boolean not null default true,
    sort_order integer not null default 0,
    created_at timestamptz not null default now()
);

alter table public.deal_rates enable row level security;
alter table public.travel_deals enable row level security;
alter table public.hot_package_rates enable row level security;

insert into public.deal_rates (category, title, unit, reference_rate, our_rate, reference_source, freshness_label)
values
    ('Hotels', 'Bali escape stay', 'per stay', 900, 540, 'manual reference', 'Reference snapshot'),
    ('Transfers', 'Airport transfer', 'per transfer', 120, 84, 'manual reference', 'Reference snapshot'),
    ('Festivals', 'Tomorrowland pass', 'per pass', 1200, 1080, 'manual reference', 'Reference snapshot')
on conflict do nothing;

insert into public.travel_deals (title, category, tag, summary, destination, reference_price, deal_price, emoji, valid_until)
values
    ('Bali Villas', 'Hotels', 'Hot Deal', 'Private villa stays with member-ready rates.', 'Bali', 900, 540, '🌴', now() + interval '30 days'),
    ('Tomorrowland', 'Festivals', 'Music Festival', 'Festival access and travel planning for Boom, Belgium.', 'Boom, Belgium', 1200, 1080, '🎪', now() + interval '30 days'),
    ('Maldives Escape', 'Packages', 'Luxury', 'Island stay planning with flights and transfers.', 'Maldives', 1800, 1620, '🚤', now() + interval '30 days')
on conflict (title) do nothing;

insert into public.hot_package_rates (destination, nights, days, price, tag, note, sort_order)
values
    ('Bali', 5, 6, 620, 'Hot', 'Beach + stay combo', 1),
    ('Dubai', 3, 4, 480, 'Hot', 'Luxury city break', 2),
    ('Paris', 4, 5, 710, 'Hot', 'Weekend escape', 3),
    ('Maldives', 6, 7, 990, 'Hot', 'Island retreat', 4),
    ('Singapore', 4, 5, 540, 'Hot', 'City + food', 5),
    ('Rome', 3, 4, 430, 'Hot', 'Culture & charm', 6)
on conflict do nothing;
