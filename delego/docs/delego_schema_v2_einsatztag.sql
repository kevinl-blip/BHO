-- ============================================================
-- Delego – Schema-Erweiterung V2 (Einsatztag-Sichten, Meilenstein 4b Teil 1)
-- Baut auf delego_schema_v1.sql auf. Einspielen NACH V1/RPC/Grants.
-- Supabase → SQL Editor → New query → einfügen → Run.
-- ============================================================

-- ------------------------------------------------------------
-- 1) FAHRER als eigene Ressource mit Token-Zugang
--    (ersetzt die bisherige Annahme "Fahrer = auth.users-Account")
-- ------------------------------------------------------------
create table drivers (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,
  phone text,
  access_token uuid not null unique default gen_random_uuid(),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- transfers zeigt jetzt auf die neue drivers-Tabelle statt auf auth.users.
-- Die alte Spalte driver_user_id bleibt vorerst bestehen (nichts geht kaputt),
-- wird aber vom neuen Code nicht mehr genutzt.
alter table transfers
  add column driver_id uuid references drivers(id) on delete set null;

-- ------------------------------------------------------------
-- 2) KOORDINATOREN am Flughafen, ebenfalls Token-Zugang.
--    Jeder Koordinator hat einen eigenen Link (einzeln entwertbar).
-- ------------------------------------------------------------
create table coordinators (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,
  phone text,
  access_token uuid not null unique default gen_random_uuid(),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3) ANWESENHEITSSTATUS pro Person (der eigentliche Abgleich).
--    Getrennte Tabelle statt Spalte in persons, weil der Status
--    am Einsatztag entsteht und über Token-Zugang geschrieben wird –
--    das hält persons sauber und die Schreibrechte klar abgegrenzt.
-- ------------------------------------------------------------
create table arrival_checkins (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references persons(id) on delete cascade unique,
  status text not null default 'expected'
    check (status in ('expected','present','missing')),
  -- Wer hat den Status gesetzt? Nachvollziehbarkeit bei mehreren Koordinatoren.
  set_by_coordinator_id uuid references coordinators(id) on delete set null,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4) UNANGEMELDETE Personen: taucht jemand ohne Anmeldung auf,
--    vermerkt der Koordinator ihn hier (kein Eintrag in persons,
--    weil er nicht Teil der offiziellen Meldung ist).
-- ------------------------------------------------------------
create table walkins (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  delegation_id uuid references delegations(id) on delete set null, -- falls zuordenbar
  name text not null,
  note text,
  reported_by_coordinator_id uuid references coordinators(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- updated_at-Trigger für die neuen Tabellen (Funktion set_updated_at
-- stammt aus V1 und existiert bereits).
-- ------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'drivers','coordinators','arrival_checkins','walkins']
  loop
    execute format(
      'create trigger trg_%s_updated before update on %I
       for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- Indizes für die häufigen Zugriffe am Einsatztag
-- ------------------------------------------------------------
create index on drivers (tournament_id);
create index on coordinators (tournament_id);
create index on transfers (driver_id);
create index on arrival_checkins (person_id);
create index on walkins (tournament_id);

-- ============================================================
-- Row-Level-Security
-- Prinzip wie in V1: angemeldete Veranstalter (admin/staff) verwalten
-- alles innerhalb ihrer Organisation. Fahrer und Koordinatoren greifen
-- NICHT über diese Policies zu, sondern ausschließlich über Edge
-- Functions (service_role), die ihren jeweiligen access_token prüfen –
-- exakt dasselbe Muster wie beim Delegationsportal.
-- Hilfsfunktionen aus V1 (is_org_member, org_role, tournament_org)
-- werden wiederverwendet.
-- ============================================================

alter table drivers          enable row level security;
alter table coordinators     enable row level security;
alter table arrival_checkins enable row level security;
alter table walkins          enable row level security;

-- drivers: Veranstalter der Organisation lesen; admin/staff schreiben.
create policy drv_select on drivers for select
  using (is_org_member(tournament_org(tournament_id)));
create policy drv_write on drivers for all
  using (org_role(tournament_org(tournament_id)) in ('admin','staff'))
  with check (org_role(tournament_org(tournament_id)) in ('admin','staff'));

-- coordinators: gleiches Muster.
create policy crd_select on coordinators for select
  using (is_org_member(tournament_org(tournament_id)));
create policy crd_write on coordinators for all
  using (org_role(tournament_org(tournament_id)) in ('admin','staff'))
  with check (org_role(tournament_org(tournament_id)) in ('admin','staff'));

-- arrival_checkins: Veranstalter lesen (Live-Überblick), admin/staff dürfen
-- auch selbst setzen. Das eigentliche Schreiben durch Koordinatoren läuft
-- über die Edge Function (service_role), nicht über diese Policy.
create policy chk_select on arrival_checkins for select
  using (is_org_member(person_org(person_id)));
create policy chk_write on arrival_checkins for all
  using (org_role(person_org(person_id)) in ('admin','staff'))
  with check (org_role(person_org(person_id)) in ('admin','staff'));

-- walkins: gleiches Muster wie checkins.
create policy wlk_select on walkins for select
  using (is_org_member(tournament_org(tournament_id)));
create policy wlk_write on walkins for all
  using (org_role(tournament_org(tournament_id)) in ('admin','staff'))
  with check (org_role(tournament_org(tournament_id)) in ('admin','staff'));

-- GRANTs analog zu grants_v1.sql: RLS ist die Schutzschicht, aber die
-- Rollen brauchen die Grundrechte auf den Tabellen (sonst "permission denied").
grant select, insert, update, delete on
  drivers, coordinators, arrival_checkins, walkins
  to authenticated;
grant select, insert, update, delete on
  drivers, coordinators, arrival_checkins, walkins
  to service_role;
