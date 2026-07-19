-- ============================================================
-- Delego – Schema-Korrektur V3a (Selbstbucher, Meilenstein 5a)
-- Baut auf V3 auf. Einspielen NACH delego_schema_v3_hotelkontingente.sql.
-- Supabase → SQL Editor → New query → einfügen → Run.
-- ============================================================

-- ------------------------------------------------------------
-- HINTERGRUND
--
-- accommodation_requests verlangte bisher immer room_category_id,
-- check_in und check_out. Für Selbstbucher (Hotel mit
-- is_official = false) ergibt das keinen Sinn: Die Delegation teilt
-- nur mit, dass sie sich selbst kümmert – sie kennt weder Hotelname
-- noch Zimmerkategorie noch zwingend die Daten.
--
-- Der Eintrag muss aber trotzdem existieren, denn nur so ist
-- "hat bewusst selbst gebucht" von "hat den Wunsch vergessen"
-- unterscheidbar. Genau dafür gab es im BJEC-Formular die
-- "Non-official hotel"-Zeile.
--
-- Regel ab jetzt:
--   offizielles Hotel   → Kategorie und Zeitraum sind Pflicht
--   Selbstbucher-Hotel  → beides darf leer bleiben
--
-- Durchgesetzt wird das in der Edge Function (portal-accommodation),
-- weil is_official in der Tabelle hotels liegt und ein CHECK-
-- Constraint nicht über Tabellengrenzen prüfen kann. Die Datenbank
-- erlaubt daher nur noch das, was ohne Fremdtabelle prüfbar ist.
-- ------------------------------------------------------------

alter table accommodation_requests
  alter column room_category_id drop not null,
  alter column check_in drop not null,
  alter column check_out drop not null;

-- Der alte CHECK erzwang check_out > check_in bedingungslos und
-- würde bei zwei NULL-Werten nicht mehr passen. Ersetzen durch eine
-- Variante, die den Vergleich nur zieht, wenn beide Daten gesetzt sind.
alter table accommodation_requests
  drop constraint if exists accommodation_requests_check;

alter table accommodation_requests
  add constraint accommodation_requests_dates_check
  check (
    (check_in is null and check_out is null)
    or (check_in is not null and check_out is not null and check_out > check_in)
  );

comment on column accommodation_requests.room_category_id is
  'NULL erlaubt: bei Selbstbucher-Hotels (hotels.is_official = false). '
  'Bei offiziellen Hotels erzwingt portal-accommodation die Angabe.';

comment on column accommodation_requests.check_in is
  'NULL erlaubt: bei Selbstbucher-Hotels. Entweder beide Daten gesetzt '
  'oder beide NULL – siehe accommodation_requests_dates_check.';
