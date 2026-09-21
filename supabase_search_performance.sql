-- Safe search-performance migration. It creates indexes only and does not edit medicine rows.
-- Run once in the Supabase SQL Editor.

create extension if not exists pg_trgm;

create index if not exists medicines_search_trgm_idx
  on public.medicines using gin (search_text gin_trgm_ops);

create index if not exists medicines_upload_id_idx
  on public.medicines (upload_id);

create index if not exists medicines_upload_source_numeric_idx
  on public.medicines (upload_id, (trim(source_id)::bigint) desc)
  where trim(source_id) ~ '^[0-9]+$';

create or replace function public.latest_numeric_source_id(p_upload_id uuid)
returns text
language sql
stable
as $$
  select trim(source_id)
  from public.medicines
  where upload_id = p_upload_id
    and trim(source_id) ~ '^[0-9]+$'
  order by (trim(source_id))::bigint desc
  limit 1;
$$;

analyze public.medicines;
