create table if not exists public.password_reset_tokens (
  token_hash text primary key,
  user_id text not null references public.users(id) on delete cascade,
  expires_at bigint not null,
  created_at text not null
);

create index if not exists password_reset_tokens_user_idx
  on public.password_reset_tokens(user_id, created_at);

alter table public.password_reset_tokens enable row level security;
revoke all on table public.password_reset_tokens from anon, authenticated;
