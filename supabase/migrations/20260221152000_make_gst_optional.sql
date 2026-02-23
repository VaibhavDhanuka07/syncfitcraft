-- GST is optional for B2B registration.
alter table public.profiles
  alter column gst_number drop not null;

-- Remove uniqueness enforcement to allow blank/any GST values.
drop index if exists public.idx_profiles_gst_unique;

