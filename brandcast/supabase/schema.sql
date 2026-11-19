-- Brandcast database. Already applied to the Supabase project "brandcast". Kept here for reference.
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  created_at timestamptz default now()
);

create table if not exists ads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  business_name text not null,
  description text,
  phone text,
  email text,
  website text,
  logo_url text,
  photo_urls text[] default '{}',
  video_url text,
  channels text[] default '{}',
  audience text,
  expires_at timestamptz,
  plan text check (plan in ('starter','growth','everywhere')),
  status text not null default 'draft' check (status in ('draft','awaiting_payment','paid','live','expired')),
  created_at timestamptz default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references ads on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  provider text not null check (provider in ('paypal','opay','wamd')),
  provider_ref text not null unique,
  currency text not null,
  expected_amount numeric(12,2) not null,
  paid_amount numeric(12,2),
  status text not null default 'pending' check (status in ('pending','paid','failed')),
  created_at timestamptz default now()
);

create table if not exists ad_posts (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references ads on delete cascade,
  channel text not null,
  status text not null,
  external_id text,
  error text,
  created_at timestamptz default now(),
  unique (ad_id, channel)
);

create table if not exists logo_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz default now()
);

-- Create a profile row automatically when someone signs up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;

alter table ad_posts enable row level security;
alter table logo_generations enable row level security;
alter table profiles enable row level security;
alter table ads enable row level security;
alter table payments enable row level security;

create policy "own profile" on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "read own ads" on ads for select using (user_id = auth.uid());
create policy "create own draft ads" on ads for insert with check (user_id = auth.uid() and status = 'draft');
create policy "edit own unpaid ads" on ads for update using (user_id = auth.uid() and status in ('draft','awaiting_payment'))
  with check (user_id = auth.uid() and status in ('draft','awaiting_payment'));
create policy "delete own draft ads" on ads for delete using (user_id = auth.uid() and status = 'draft');
create policy "read own ad posts" on ad_posts for select using (exists (select 1 from ads where ads.id = ad_posts.ad_id and ads.user_id = auth.uid()));
create policy "read own payments" on payments for select using (user_id = auth.uid());
-- logo_generations has no policy on purpose: only the server reads and writes it.
-- No insert/update policy on payments: only the server (service role) can write payments or mark ads paid.

-- File storage for logos, photos and 1-minute videos (50 MB per file).
insert into storage.buckets (id, name, public, file_size_limit)
values ('ad-media', 'ad-media', true, 52428800) on conflict (id) do nothing;
create policy "upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'ad-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "public read ad media" on storage.objects for select using (bucket_id = 'ad-media');

-- ---- Added later: free trial, admin and review (already applied to the brandcast project) ----
alter table profiles add column if not exists is_admin boolean not null default false;
alter table profiles add column if not exists free_until timestamptz not null default (now() + interval '14 days');
alter table ads add column if not exists origin text not null default 'paid' check (origin in ('paid','trial'));
alter table ads drop constraint if exists ads_status_check;
alter table ads add constraint ads_status_check check (status in ('draft','awaiting_payment','pending_review','rejected','paid','live','expired'));
-- Users can read their own profile but never change it (stops self-granted admin or longer trials).
drop policy if exists "own profile" on profiles;
create policy "read own profile" on profiles for select using (id = auth.uid());
revoke insert, update, delete on profiles from anon, authenticated;
-- To make someone an admin (run by the owner only):
--   update public.profiles set is_admin = true where id = (select id from auth.users where email = 'owner@example.com');
