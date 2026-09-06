create table if not exists public.telegram_payments (
    telegram_payment_charge_id text primary key,
    telegram_id bigint not null,
    payload text not null,
    created_at timestamptz not null default now()
);

alter table public.telegram_payments enable row level security;

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
