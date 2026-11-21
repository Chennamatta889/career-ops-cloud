-- Career-Ops Phase 4 multi-user AI quota guard.
-- Any verified authenticated user may access the AI endpoint.
-- The expensive Gemini call is restricted to two attempts per account
-- per UTC day, and 20 attempts globally per UTC day (including failed calls).
-- Only Edge Functions with the service-role key may reserve quota.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.careerops_ai_usage (
  usage_date date not null,
  user_id uuid not null,
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 1000),
  updated_at timestamptz not null default now(),
  primary key (usage_date, user_id)
);
revoke all on private.careerops_ai_usage from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.careerops_ai_usage to service_role;

create or replace function public.careerops_reserve_ai_review(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  day_utc date := (now() at time zone 'UTC')::date;
  user_attempts integer;
  all_attempts bigint;
  per_user_limit constant integer := 2;
  global_limit constant integer := 20;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false,'code','INVALID_USER');
  end if;
  -- Serialize all requests for the shared Gemini key, across edge instances.
  perform pg_catalog.pg_advisory_xact_lock(379202611);
  select coalesce(attempts,0) into user_attempts
    from private.careerops_ai_usage
    where usage_date = day_utc and user_id = p_user_id;
  user_attempts := coalesce(user_attempts,0);
  select coalesce(sum(attempts),0) into all_attempts
    from private.careerops_ai_usage where usage_date=day_utc;
  if user_attempts >= per_user_limit then
    return jsonb_build_object('ok',false,'code','USER_DAILY_LIMIT','daily_limit',per_user_limit,'remaining',0);
  end if;
  if all_attempts >= global_limit then
    return jsonb_build_object('ok',false,'code','GLOBAL_DAILY_LIMIT','daily_limit',per_user_limit,'remaining',0);
  end if;
  insert into private.careerops_ai_usage (usage_date,user_id,attempts,updated_at)
    values(day_utc,p_user_id,1,now())
    on conflict (usage_date,user_id)
    do update set attempts=private.careerops_ai_usage.attempts+1,updated_at=now();
  return jsonb_build_object(
    'ok',true,'daily_limit',per_user_limit,
    'remaining',per_user_limit-user_attempts-1
  );
end;
$$;
revoke all on function public.careerops_reserve_ai_review(uuid)
  from public, anon, authenticated;
grant execute on function public.careerops_reserve_ai_review(uuid) to service_role;

comment on function public.careerops_reserve_ai_review(uuid) is
  'Service-role-only, atomic quota reservation for verified Career-Ops users. Counts all attempted Gemini requests before calling provider.';
