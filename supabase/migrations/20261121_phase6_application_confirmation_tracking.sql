-- Career-Ops: user-confirmed application status, separate from external-link opens.
-- Applies only to the career-ops-private project; existing records are unchanged.
alter table public.careerops_job_tracking
  add column if not exists opened_at timestamptz,
  add column if not exists applied_on date;
alter table public.careerops_job_tracking
  drop constraint if exists careerops_job_tracking_stage_check;
alter table public.careerops_job_tracking
  add constraint careerops_job_tracking_stage_check
  check (stage in ('Opened','Saved','Review','Applied','Interview','Offer','Rejected'));
comment on column public.careerops_job_tracking.opened_at is
  'Last time user opened employer listing; not confirmation of an application.';
comment on column public.careerops_job_tracking.applied_on is
  'User-confirmed submission date, not independently verified by employer.';
-- Existing row-level security and ownership policies remain unchanged.
