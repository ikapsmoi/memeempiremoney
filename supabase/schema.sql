create table if not exists public.players (
    telegram_id bigint primary key,
    score numeric not null default 0,
    energy numeric not null default 0,
    updated_at timestamptz not null default now()
);

alter table public.players enable row level security;
