-- Safe search-performance migration. It creates indexes only and does not edit medicine rows.
-- Run once in the Supabase SQL Editor.

create extension if not exists pg_trgm;

create index if not exists medicines_search_trgm_idx
  on public.medicines using gin (search_text gin_trgm_ops);

create index if not exists medicines_upload_id_idx
  on public.medicines (upload_id);

analyze public.medicines;
