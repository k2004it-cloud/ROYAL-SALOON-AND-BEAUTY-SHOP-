alter table public.business_settings
  add column if not exists attendance_qr_token text not null default '';
