-- ============================================================
-- Delego – Schema-Erweiterung V3 (Hotelkontingente, Meilenstein 5a)
-- Baut auf V1 + V2 auf. Einspielen NACH schema_v1 / rpc / grants / v2.
-- Supabase → SQL Editor → New query → einfügen → Run.
-- ============================================================

-- ------------------------------------------------------------
-- TAGESGENAUE KONTINGENTE
--
-- Warum eine eigene Tabelle statt einer Zahl in room_categories:
-- Hotels melden pro Tag unterschiedliche Verfügbarkeiten
-- ("am 24.4. drei Einzel, am 25.4. fünf Einzel"). Genau darauf
-- baut die Zuteilungslogik auf – eine Person darf nur dann ein
-- Zimmer bekommen, wenn es an JEDEM Tag ihres Aufenthalts frei ist,
-- weil niemand während des Aufenthalts umziehen soll.
--
-- available_count = Anzahl ZIMMER dieser Kategorie an diesem Datum
-- (nicht Betten – die Bettenzahl steht als capacity in room_categories).
-- Das Datum bezeichnet die ÜBERNACHTUNG (Nacht vom <date> auf den Folgetag).
-- ------------------------------------------------------------
create table room_inventory (
  id uuid primary key default gen_random_uuid(),
  room_category_id uuid not null references room_categories(id) on delete cascade,
  date date not null,
  available_count int not null default 0 check (available_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_category_id, date)
);

-- ------------------------------------------------------------
-- rooms: Klarstellung der Bedeutung.
-- Die Zimmer werden NICHT vom Hotel vorgegeben – der Veranstalter
-- bekommt Kontingente und gibt dem Hotel am Ende vor, wie belegt
-- werden soll. rooms sind daher selbst erzeugte Belegungseinheiten
-- ("A-S001"), die sichtbar machen, wer mit wem zusammenliegt.
-- Sie tragen jetzt die Aufenthaltsdaten, weil eine Belegungseinheit
-- immer für einen konkreten Zeitraum gilt.
-- ------------------------------------------------------------
alter table rooms
  add column check_in date,
  add column check_out date,
  add column is_upgrade boolean not null default false;

comment on table rooms is
  'Selbst erzeugte Belegungseinheit (kein echtes Hotelzimmer). '
  'is_upgrade = true bedeutet: allein belegt, niemand darf dazu.';

-- ------------------------------------------------------------
-- Trigger + Indizes
-- ------------------------------------------------------------
create trigger trg_room_inventory_updated before update on room_inventory
  for each row execute function set_updated_at();

create index on room_inventory (room_category_id, date);
create index on rooms (check_in, check_out);

-- ============================================================
-- Row-Level-Security – Muster wie in V1:
-- Mitglieder der Organisation lesen, admin/staff schreiben.
-- Delegationen sehen Kontingente NICHT (sie äußern nur Wünsche);
-- ihr Portal-Zugriff läuft wie gehabt über Edge Functions.
-- ============================================================
alter table room_inventory enable row level security;

create policy inv_select on room_inventory for select
  using (is_org_member(hotel_org(
    (select hotel_id from room_categories where id = room_category_id))));

create policy inv_write on room_inventory for all
  using (org_role(hotel_org(
    (select hotel_id from room_categories where id = room_category_id))) in ('admin','staff'))
  with check (org_role(hotel_org(
    (select hotel_id from room_categories where id = room_category_id))) in ('admin','staff'));

-- GRANTs analog zu grants_v1.sql
grant select, insert, update, delete on room_inventory to authenticated;
grant select, insert, update, delete on room_inventory to service_role;
