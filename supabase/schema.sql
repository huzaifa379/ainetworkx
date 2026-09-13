-- Vid Download — download counter, Supabase (Postgres) schema.
-- Paste this whole file into Supabase → SQL Editor → Run. It is idempotent, so
-- running it again on a live table is safe: columns are added only if missing,
-- functions are replaced, and no existing counts are lost.
--
-- What a row is: one row per device per day, not one row per tap. Tapping the
-- button five times increments `hits` on the same row instead of writing five
-- rows, which is what the dashboard's "taps" figure is for.

create table if not exists public.downloads (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  country       text,
  device        text,     -- android | ios | desktop | other
  referrer      text,     -- where the click came from, truncated
  app_version   text,     -- APK version served at that moment
  visitor_hash  text      -- daily one-way hash, kept as a fallback dedupe key
);

-- Added after the first release, hence `if not exists` rather than being part of
-- the create above: the counter now keeps the network address and the browser
-- identification the request already carried.
alter table public.downloads add column if not exists ip              text;
alter table public.downloads add column if not exists ua              text;
alter table public.downloads add column if not exists browser         text;
alter table public.downloads add column if not exists browser_version text;
alter table public.downloads add column if not exists os              text;
alter table public.downloads add column if not exists os_version      text;
alter table public.downloads add column if not exists city            text;
alter table public.downloads add column if not exists region          text;
alter table public.downloads add column if not exists hits            integer not null default 1;
alter table public.downloads add column if not exists last_at         timestamptz;

create index if not exists downloads_created_at_idx on public.downloads (created_at desc);
create index if not exists downloads_visitor_idx    on public.downloads (visitor_hash);
create index if not exists downloads_ip_day_idx     on public.downloads (ip, created_at desc);

-- Optional second table: app-side events (first-run popup) so the same
-- dashboard can show installs next to downloads. Fed by n8n, not by the app —
-- the APK itself is not touched.
create table if not exists public.app_events (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  event         text not null,   -- welcome_shown | gmail_submitted | welcome_dismissed
  app_version   text,
  country       text
);

create index if not exists app_events_created_at_idx on public.app_events (created_at desc);

-- Row level security on, and deliberately no policies: the anon/publishable key
-- can neither read nor write. Only the service_role key — which lives in a
-- Vercel environment variable and never in the repo or the browser — gets in.
alter table public.downloads  enable row level security;
alter table public.app_events enable row level security;

-- One-time repair: rows written before deduping existed are collapsed to one
-- row per device per day, with the taps they represented preserved in `hits`.
-- Runs harmlessly (zero rows affected) once the data is already clean.
update public.downloads t
   set hits = s.c, last_at = s.last_at
  from (
    select coalesce(ip, visitor_hash) as k,
           (created_at at time zone 'utc')::date as d,
           count(*) as c, min(id) as keep_id, max(created_at) as last_at
      from public.downloads
     where coalesce(ip, visitor_hash) is not null
     group by 1, 2
  ) s
 where t.id = s.keep_id and s.c > 1;

delete from public.downloads t
 using (
    select coalesce(ip, visitor_hash) as k,
           (created_at at time zone 'utc')::date as d,
           min(id) as keep_id
      from public.downloads
     where coalesce(ip, visitor_hash) is not null
     group by 1, 2
  ) s
 where coalesce(t.ip, t.visitor_hash) = s.k
   and (t.created_at at time zone 'utc')::date = s.d
   and t.id <> s.keep_id;

-- One round trip per click: bump today's row for this device, or create it.
-- Returns 'repeat' or 'new' so /api/download can report which happened in its
-- X-Download-Counter header.
create or replace function public.record_download(
  p_country         text default null,
  p_device          text default null,
  p_referrer        text default null,
  p_app_version     text default null,
  p_visitor_hash    text default null,
  p_ip              text default null,
  p_ua              text default null,
  p_browser         text default null,
  p_browser_version text default null,
  p_os              text default null,
  p_os_version      text default null,
  p_city            text default null,
  p_region          text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_id bigint;
begin
  -- Same device, same UTC day. The IP is the tightest available notion of "the
  -- same phone"; visitor_hash is the fallback when the address is unavailable.
  select id into v_id
    from downloads
   where created_at >= date_trunc('day', now())
     and ((p_ip is not null and ip = p_ip)
       or (p_ip is null and p_visitor_hash is not null and visitor_hash = p_visitor_hash))
   order by id desc
   limit 1;

  if v_id is not null then
    update downloads set hits = hits + 1, last_at = now() where id = v_id;
    return 'repeat';
  end if;

  insert into downloads (country, device, referrer, app_version, visitor_hash,
                         ip, ua, browser, browser_version, os, os_version,
                         city, region, hits, last_at)
  values (p_country, p_device, p_referrer, p_app_version, p_visitor_hash,
          p_ip, p_ua, p_browser, p_browser_version, p_os, p_os_version,
          p_city, p_region, 1, now());
  return 'new';
end;
$$;

-- Everything the dashboard shows, in one round trip. `total` counts devices
-- (one row each); `taps` counts button presses, so the gap between the two is
-- how often people press it more than once.
create or replace function public.download_stats(p_days int default 30)
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'generated_at', now(),
    'total',        (select count(*) from downloads),
    'taps',         (select coalesce(sum(hits), 0) from downloads),
    'unique_total', (select count(distinct visitor_hash) from downloads where visitor_hash is not null),
    'today',        (select count(*) from downloads where created_at >= date_trunc('day', now())),
    'taps_today',   (select coalesce(sum(hits), 0) from downloads where created_at >= date_trunc('day', now())),
    'last_7d',      (select count(*) from downloads where created_at >= now() - interval '7 days'),
    'last_30d',     (select count(*) from downloads where created_at >= now() - interval '30 days'),
    'activations',  (select count(*) from app_events where event = 'welcome_shown'),
    'emails',       (select count(*) from app_events where event = 'gmail_submitted'),
    'by_day', (
      select coalesce(json_agg(t order by t.d), '[]'::json) from (
        select (created_at at time zone 'utc')::date as d, count(*) as n
        from downloads
        where created_at >= now() - make_interval(days => p_days)
        group by 1
      ) t),
    'by_country', (
      select coalesce(json_agg(t order by t.n desc), '[]'::json) from (
        select coalesce(country, '??') as country, count(*) as n
        from downloads group by 1 order by 2 desc limit 12
      ) t),
    'by_device', (
      select coalesce(json_agg(t order by t.n desc), '[]'::json) from (
        select coalesce(device, 'other') as device, count(*) as n
        from downloads group by 1 order by 2 desc
      ) t),
    'by_browser', (
      select coalesce(json_agg(t order by t.n desc), '[]'::json) from (
        select coalesce(browser, 'unknown') as browser, count(*) as n
        from downloads group by 1 order by 2 desc limit 12
      ) t),
    'by_os', (
      select coalesce(json_agg(t order by t.n desc), '[]'::json) from (
        select coalesce(os, 'unknown') as os, count(*) as n
        from downloads group by 1 order by 2 desc limit 12
      ) t),
    'recent', (
      select coalesce(json_agg(t order by t.created_at desc), '[]'::json) from (
        select created_at, last_at, country, city, region, device, browser,
               browser_version, os, os_version, ip, hits, referrer
        from downloads order by created_at desc limit 25
      ) t)
  );
$$;

-- Both functions are only ever called server-side with the service key.
revoke all on function public.download_stats(int) from anon, authenticated;
revoke all on function public.record_download(text, text, text, text, text, text,
  text, text, text, text, text, text, text) from anon, authenticated;
