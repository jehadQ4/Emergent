-- Pharmacy Medicine Search System — Database Schema
-- Run this once in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/dkghpmzmlvytplkewcob/sql/new

-- Required extension for fast fuzzy/partial search (Arabic + English)
create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- ============================================================
-- profiles (linked to auth.users for role management)
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null check (role in ('admin','staff','pending')) default 'pending',
  created_at timestamptz default now()
);

-- ============================================================
-- uploads (track every uploaded file)
-- ============================================================
create table if not exists public.uploads (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_email text,
  rows_count int default 0,
  warehouse_hint text,
  created_at timestamptz default now()
);

-- ============================================================
-- medicines (every row from every upload — HISTORICAL, never overwritten)
-- ============================================================
create table if not exists public.medicines (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid references public.uploads(id) on delete set null,
  source_id text,                  -- original ID from Excel
  file_number text,                -- رقم الملف
  warehouse text,                  -- المخزن (مصدر الفاتورة)
  invoice_date date,               -- التاريخ
  invoice_number text,             -- ID القائمة / رقم الفاتورة
  name text not null,              -- اسم الدواء
  scientific_name text,            -- الاسم العلمي
  company text,                    -- الشركة
  quantity numeric,                -- الكمية
  min_stock numeric default 10,    -- الحد الأدنى للتنبيه في المخزن
  gift numeric,                    -- هدية
  rep_gift numeric,                -- هدية مندوب
  expiry_raw text,                 -- expiry as written in file
  expiry_date date,                -- parsed expiry (if possible)
  unit_price numeric,              -- سعر الوحدة
  total_price numeric,             -- السعر الكلي
  original_price numeric,          -- السعر الاصلي
  selling_price numeric,           -- سعر البيع (إذا توفر)
  batch_number text,               -- رقم الدفعة
  barcode text,                    -- الباركود
  notes text,                      -- ملاحظات
  search_text text,                -- combined searchable text
  created_at timestamptz default now()
);

-- ============================================================
-- Indexes for blazing-fast search (Arabic + English, partial match)
-- ============================================================
create index if not exists medicines_name_trgm_idx
  on public.medicines using gin (name gin_trgm_ops);

create index if not exists medicines_search_trgm_idx
  on public.medicines using gin (search_text gin_trgm_ops);

create index if not exists medicines_company_trgm_idx
  on public.medicines using gin (company gin_trgm_ops);

create index if not exists medicines_scientific_trgm_idx
  on public.medicines using gin (scientific_name gin_trgm_ops);

create index if not exists medicines_invoice_idx on public.medicines (invoice_number);
create index if not exists medicines_barcode_idx on public.medicines (barcode);
create index if not exists medicines_created_idx on public.medicines (created_at desc);

-- ============================================================
-- Auto-fill search_text trigger (combine all searchable fields)
-- ============================================================
create or replace function public.medicines_search_text_update()
returns trigger language plpgsql as $$
begin
  new.search_text := lower(coalesce(new.name,'') || ' ' ||
                           coalesce(new.scientific_name,'') || ' ' ||
                           coalesce(new.company,'') || ' ' ||
                           coalesce(new.barcode,'') || ' ' ||
                           coalesce(new.invoice_number,'') || ' ' ||
                           coalesce(new.warehouse,''));
  return new;
end; $$;

drop trigger if exists medicines_search_text_trg on public.medicines;
create trigger medicines_search_text_trg
before insert or update on public.medicines
for each row execute function public.medicines_search_text_update();

-- ============================================================
-- Helper RPC: live suggestions (ordered by similarity)
-- ============================================================
create or replace function public.search_medicines_suggestions(q text, max_results int default 10)
returns table(name text, scientific_name text, company text, hits bigint)
language sql stable as $$
  select name,
         max(scientific_name) as scientific_name,
         max(company) as company,
         count(*) as hits
  from public.medicines
  where search_text ilike '%' || lower(q) || '%'
  group by name
  order by
    case when lower(name) like lower(q) || '%' then 0 else 1 end,
    count(*) desc
  limit max_results;
$$;

-- ============================================================
-- Helper RPC: search with full info + recent first
-- ============================================================
create or replace function public.search_medicines(q text, max_results int default 100)
returns setof public.medicines
language sql stable as $$
  select *
  from public.medicines
  where q is null or q = '' or search_text ilike '%' || lower(q) || '%'
  order by created_at desc
  limit max_results;
$$;

-- ============================================================
-- Statistics view
-- ============================================================
create or replace view public.stats_overview as
select
  (select count(*) from public.medicines) as total_records,
  (select count(distinct name) from public.medicines) as unique_medicines,
  (select count(*) from public.uploads) as total_uploads,
  (select count(distinct warehouse) from public.medicines where warehouse is not null) as warehouses_count,
  (select count(distinct company) from public.medicines where company is not null) as companies_count;

-- ============================================================
-- Row Level Security (kept permissive for now — service role used server-side)
-- ============================================================
alter table public.profiles enable row level security;
alter table public.uploads enable row level security;
alter table public.medicines enable row level security;

-- Safe migration for databases created before inventory management was added
alter table public.medicines add column if not exists min_stock numeric default 10;

-- Allow authenticated users to read everything (search use case)
drop policy if exists medicines_read on public.medicines;
create policy medicines_read on public.medicines for select using (true);

drop policy if exists uploads_read on public.uploads;
create policy uploads_read on public.uploads for select using (true);

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (true);
