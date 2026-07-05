-- ============================================================
-- Delego – Schema V1 (Rev. 2)
-- Einspielen: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- ---------- Hilfsfunktion: updated_at automatisch pflegen ----------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- Tabellen ----------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  role text not null check (role in ('admin','staff','driver')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, organization_id)
);

create table tournaments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  venue text,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  submission_deadline timestamptz,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table delegations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,
  country_code text,
  contact_name text,
  contact_email text,
  contact_phone text,
  access_token uuid not null unique default gen_random_uuid(),
  status text not null default 'invited'
    check (status in ('invited','in_progress','submitted','confirmed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table persons (
  id uuid primary key default gen_random_uuid(),
  delegation_id uuid not null references delegations(id) on delete cascade,
  last_name text not null,
  first_name text not null,
  gender text,
  role text not null default 'athlete' check (role in ('athlete','coach','official')),
  custom_fields jsonb not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table travel_groups (
  id uuid primary key default gen_random_uuid(),
  delegation_id uuid not null references delegations(id) on delete cascade,
  direction text not null check (direction in ('arrival','departure')),
  scheduled_at timestamptz not null,
  carrier_ref text,
  location text,
  status text not null default 'planned'
    check (status in ('planned','delayed','landed','done')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table travel_group_members (
  id uuid primary key default gen_random_uuid(),
  travel_group_id uuid not null references travel_groups(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  unique (travel_group_id, person_id)
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  label text not null,
  capacity int not null default 8,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table transfers (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  travel_group_ids uuid[] not null default '{}',
  driver_user_id uuid references auth.users(id) on delete set null,
  vehicle_id uuid references vehicles(id) on delete set null,
  pickup_at timestamptz,
  from_location text,
  to_location text,
  status text not null default 'unassigned'
    check (status in ('unassigned','assigned','en_route','completed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table hotels (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name text not null,
  address text,
  is_official boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table room_categories (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  label text not null,
  capacity int not null default 1,
  price_per_person_night numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table accommodation_requests (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references persons(id) on delete cascade,
  hotel_id uuid not null references hotels(id) on delete restrict,
  room_category_id uuid not null references room_categories(id) on delete restrict,
  check_in date not null,
  check_out date not null,
  roommate_wish text,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in)
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references hotels(id) on delete cascade,
  room_category_id uuid not null references room_categories(id) on delete restrict,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table room_assignments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  check_in date not null,
  check_out date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in)
);

-- ---------- updated_at-Trigger auf alle Tabellen ----------
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','memberships','tournaments','delegations','persons',
    'travel_groups','vehicles','transfers','hotels','room_categories',
    'accommodation_requests','rooms','room_assignments']
  loop
    execute format(
      'create trigger trg_%s_updated before update on %I
       for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- ---------- Indizes für die häufigen Zugriffe ----------
create index on memberships (user_id);
create index on tournaments (organization_id);
create index on delegations (tournament_id);
create index on persons (delegation_id);
create index on travel_groups (delegation_id, direction, scheduled_at);
create index on travel_group_members (person_id);
create index on transfers (tournament_id, pickup_at);
create index on transfers (driver_user_id);
create index on hotels (tournament_id);
create index on room_categories (hotel_id);
create index on accommodation_requests (person_id);
create index on rooms (hotel_id);
create index on room_assignments (room_id, check_in);
create index on room_assignments (person_id);

-- ============================================================
-- Row-Level-Security
-- Prinzip: Angemeldete Nutzer sehen nur Daten ihrer Organisation.
-- Das Delegationsportal läuft NICHT über diese Policies, sondern
-- über Edge Functions (service_role), die das access_token und
-- die Deadline prüfen.
-- ============================================================

-- Hilfsfunktionen (security definer, damit Policies keine Rekursion
-- auf memberships auslösen)
create or replace function is_org_member(org uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from memberships
    where organization_id = org and user_id = auth.uid()
  );
$$;

create or replace function org_role(org uuid)
returns text language sql security definer stable
set search_path = public as $$
  select role from memberships
  where organization_id = org and user_id = auth.uid()
  limit 1;
$$;

create or replace function tournament_org(t uuid)
returns uuid language sql security definer stable
set search_path = public as $$
  select organization_id from tournaments where id = t;
$$;

create or replace function delegation_org(d uuid)
returns uuid language sql security definer stable
set search_path = public as $$
  select t.organization_id from delegations dl
  join tournaments t on t.id = dl.tournament_id
  where dl.id = d;
$$;

create or replace function person_org(p uuid)
returns uuid language sql security definer stable
set search_path = public as $$
  select delegation_org(delegation_id) from persons where id = p;
$$;

create or replace function hotel_org(h uuid)
returns uuid language sql security definer stable
set search_path = public as $$
  select tournament_org(tournament_id) from hotels where id = h;
$$;

-- RLS aktivieren
alter table organizations enable row level security;
alter table memberships enable row level security;
alter table tournaments enable row level security;
alter table delegations enable row level security;
alter table persons enable row level security;
alter table travel_groups enable row level security;
alter table travel_group_members enable row level security;
alter table vehicles enable row level security;
alter table transfers enable row level security;
alter table hotels enable row level security;
alter table room_categories enable row level security;
alter table accommodation_requests enable row level security;
alter table rooms enable row level security;
alter table room_assignments enable row level security;

-- organizations: Mitglieder lesen; nur Admins ändern.
create policy org_select on organizations for select
  using (is_org_member(id));
create policy org_update on organizations for update
  using (org_role(id) = 'admin');
-- Neue Organisation darf jeder angemeldete Nutzer anlegen
-- (Onboarding; Membership wird per RPC direkt mitgesetzt, s. App-Code).
create policy org_insert on organizations for insert
  with check (auth.uid() is not null);

-- memberships: eigene sehen; Admins verwalten alle der Organisation.
create policy mem_select on memberships for select
  using (user_id = auth.uid() or org_role(organization_id) = 'admin');
create policy mem_write on memberships for all
  using (org_role(organization_id) = 'admin')
  with check (org_role(organization_id) = 'admin');

-- tournaments: Mitglieder lesen; admin/staff schreiben.
create policy tour_select on tournaments for select
  using (is_org_member(organization_id));
create policy tour_write on tournaments for all
  using (org_role(organization_id) in ('admin','staff'))
  with check (org_role(organization_id) in ('admin','staff'));

-- Muster für alle turnier-/delegationsgebundenen Tabellen:
-- lesen = Mitglied, schreiben = admin/staff.

create policy del_select on delegations for select
  using (is_org_member(tournament_org(tournament_id)));
create policy del_write on delegations for all
  using (org_role(tournament_org(tournament_id)) in ('admin','staff'))
  with check (org_role(tournament_org(tournament_id)) in ('admin','staff'));

create policy per_select on persons for select
  using (is_org_member(delegation_org(delegation_id)));
create policy per_write on persons for all
  using (org_role(delegation_org(delegation_id)) in ('admin','staff'))
  with check (org_role(delegation_org(delegation_id)) in ('admin','staff'));

create policy tg_select on travel_groups for select
  using (is_org_member(delegation_org(delegation_id)));
create policy tg_write on travel_groups for all
  using (org_role(delegation_org(delegation_id)) in ('admin','staff'))
  with check (org_role(delegation_org(delegation_id)) in ('admin','staff'));

create policy tgm_select on travel_group_members for select
  using (is_org_member(person_org(person_id)));
create policy tgm_write on travel_group_members for all
  using (org_role(person_org(person_id)) in ('admin','staff'))
  with check (org_role(person_org(person_id)) in ('admin','staff'));

create policy veh_select on vehicles for select
  using (is_org_member(tournament_org(tournament_id)));
create policy veh_write on vehicles for all
  using (org_role(tournament_org(tournament_id)) in ('admin','staff'))
  with check (org_role(tournament_org(tournament_id)) in ('admin','staff'));

-- transfers: admin/staff alles; Fahrer sehen eigene Fahrten und
-- dürfen deren Status fortschreiben.
create policy tra_select on transfers for select
  using (
    org_role(tournament_org(tournament_id)) in ('admin','staff')
    or driver_user_id = auth.uid()
  );
create policy tra_write on transfers for insert
  with check (org_role(tournament_org(tournament_id)) in ('admin','staff'));
create policy tra_update on transfers for update
  using (
    org_role(tournament_org(tournament_id)) in ('admin','staff')
    or driver_user_id = auth.uid()
  )
  with check (
    org_role(tournament_org(tournament_id)) in ('admin','staff')
    or driver_user_id = auth.uid()
  );
create policy tra_delete on transfers for delete
  using (org_role(tournament_org(tournament_id)) in ('admin','staff'));

create policy hot_select on hotels for select
  using (is_org_member(tournament_org(tournament_id)));
create policy hot_write on hotels for all
  using (org_role(tournament_org(tournament_id)) in ('admin','staff'))
  with check (org_role(tournament_org(tournament_id)) in ('admin','staff'));

create policy rc_select on room_categories for select
  using (is_org_member(hotel_org(hotel_id)));
create policy rc_write on room_categories for all
  using (org_role(hotel_org(hotel_id)) in ('admin','staff'))
  with check (org_role(hotel_org(hotel_id)) in ('admin','staff'));

create policy ar_select on accommodation_requests for select
  using (is_org_member(person_org(person_id)));
create policy ar_write on accommodation_requests for all
  using (org_role(person_org(person_id)) in ('admin','staff'))
  with check (org_role(person_org(person_id)) in ('admin','staff'));

create policy roo_select on rooms for select
  using (is_org_member(hotel_org(hotel_id)));
create policy roo_write on rooms for all
  using (org_role(hotel_org(hotel_id)) in ('admin','staff'))
  with check (org_role(hotel_org(hotel_id)) in ('admin','staff'));

create policy ra_select on room_assignments for select
  using (is_org_member(person_org(person_id)));
create policy ra_write on room_assignments for all
  using (org_role(person_org(person_id)) in ('admin','staff'))
  with check (org_role(person_org(person_id)) in ('admin','staff'));
