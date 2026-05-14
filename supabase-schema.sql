create table if not exists public.registrations (
  id text primary key,
  order_code bigint unique not null,
  plan_id text not null,
  plan_name text not null,
  amount integer not null default 0,
  status text not null,
  full_name text not null,
  email text not null,
  phone text not null,
  company text,
  payment_provider text,
  payment_url text,
  payment_qr text,
  payment_link_id text,
  payos_status text,
  amount_paid integer,
  amount_remaining integer,
  payment_reference text,
  transactions jsonb,
  created_at timestamptz not null,
  paid_at timestamptz,
  checked_in_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists registrations_created_at_idx
  on public.registrations (created_at desc);

create index if not exists registrations_status_idx
  on public.registrations (status);

create index if not exists registrations_plan_id_idx
  on public.registrations (plan_id);

alter table public.registrations enable row level security;

-- The app uses SUPABASE_SERVICE_ROLE_KEY from the server, which bypasses RLS.
-- Do not add anon/public policies for this table unless you intentionally build a public admin API.
