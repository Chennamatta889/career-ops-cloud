-- Career-Ops Phase 4. Private extracted resume text and job tracking.
-- No public resumes, no cross-account access, no exposed service-role keys.
-- This migration is for career-ops-private only (not DraftflowAI).
create table if not exists public.careerops_resume_vault (
  user_id uuid primary key references auth.users(id) on delete cascade,
  label text not null default 'Primary resume'
    check (char_length(label) between 1 and 120),
  resume_text text not null
    check (char_length(resume_text) between 250 and 16000),
  source_filename text not null default ''
    check (char_length(source_filename) <= 160),
  updated_at timestamptz not null default now()
);

alter table public.careerops_resume_vault enable row level security;
revoke all on table public.careerops_resume_vault from public, anon;
grant select, insert, update, delete on table public.careerops_resume_vault to authenticated;

create policy "vault_select_own" on public.careerops_resume_vault
for select to authenticated using ((select auth.uid()) = user_id);
create policy "vault_insert_own" on public.careerops_resume_vault
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "vault_update_own" on public.careerops_resume_vault
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "vault_delete_own" on public.careerops_resume_vault
for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.careerops_job_tracking (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_key text not null check (char_length(job_key) between 6 and 1500),
  title text not null check (char_length(title) between 1 and 160),
  company text not null check (char_length(company) between 1 and 130),
  location text not null default '' check (char_length(location) <= 160),
  job_url text not null default '' check (char_length(job_url) <= 1500),
  stage text not null check (stage in ('Saved', 'Review', 'Applied', 'Interview', 'Offer', 'Rejected')),
  updated_at timestamptz not null default now(),
  primary key (user_id, job_key)
);

create index if not exists careerops_tracking_owner_updated
  on public.careerops_job_tracking (user_id, updated_at desc);

alter table public.careerops_job_tracking enable row level security;
revoke all on table public.careerops_job_tracking from public, anon;
grant select, insert, update, delete on table public.careerops_job_tracking to authenticated;

create policy "tracking_select_own" on public.careerops_job_tracking
for select to authenticated using ((select auth.uid()) = user_id);
create policy "tracking_insert_own" on public.careerops_job_tracking
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "tracking_update_own" on public.careerops_job_tracking
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
create policy "tracking_delete_own" on public.careerops_job_tracking
for delete to authenticated using ((select auth.uid()) = user_id);
