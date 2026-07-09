-- ============================================================
-- Delego – Tabellen-GRANTs für die API-Rollen (Ergänzung zu Schema V1)
-- Einspielen: Supabase Dashboard → SQL Editor → New query → Run
--
-- WARUM DIESE DATEI NÖTIG IST
-- Postgres prüft jeden Zugriff zweistufig:
--   (1) Hat die Rolle überhaupt ein Tabellen-GRANT? →  sonst sofort
--       "permission denied for table ..." – noch VOR jeder RLS-Prüfung.
--   (2) Erst danach greifen die RLS-Policies (welche Zeilen).
-- In neu angelegten Supabase-Projekten werden die früher automatischen
-- Default-GRANTs auf die Rolle 'authenticated' nicht mehr flächendeckend
-- gesetzt. Deshalb scheitert z. B. das direkte SELECT auf 'memberships'
-- (Dashboard) mit "permission denied for table memberships", obwohl die
-- RLS-Policy den Zugriff erlauben würde. Diese Datei setzt die GRANTs explizit.
--
-- WARUM DAS SICHER IST (RLS bleibt die Schutzschicht)
-- RLS ist auf ALLEN Tabellen aktiv (enable row level security). Ein GRANT
-- sagt nur "diese Rolle darf die Tabelle grundsätzlich anfassen" – WELCHE
-- Zeilen sichtbar oder schreibbar sind, entscheiden weiterhin ausschließlich
-- die Policies (is_org_member / org_role). Eine Rolle mit vollem DML-GRANT,
-- aber ohne passende Policy, sieht NULL Zeilen und kann nichts schreiben.
-- Keine der Policies ist permissiv (kein `using (true)`), alle sind
-- organisationsgebunden – die GRANTs erweitern die Datensicht also nicht.
-- ============================================================

grant usage on schema public to authenticated, service_role;

-- authenticated = eingeloggte Veranstalter-Mitglieder. Greifen direkt aus dem
-- Browser auf die Tabellen zu; zeilenweise durch RLS begrenzt.
grant select, insert, update, delete
  on all tables in schema public
  to authenticated;

-- service_role = ausschließlich serverseitig (Edge Functions des Portals).
-- Umgeht zwar RLS, braucht aber trotzdem Tabellen-GRANTs (ist kein Superuser).
-- Wird nie im Browser verwendet, der Schlüssel bleibt auf dem Server.
grant select, insert, update, delete
  on all tables in schema public
  to service_role;

-- BEWUSST KEIN GRANT FÜR 'anon':
-- Die App greift als anon NIE direkt auf Tabellen zu. Das öffentliche
-- Delegationsportal läuft über Edge Functions (service_role), nicht über den
-- anon-Schlüssel. Weniger Angriffsfläche; RLS würde anon ohnehin sperren.

-- KEINE SEQUENZ-GRANTS NÖTIG:
-- Alle Primärschlüssel sind uuid mit gen_random_uuid(); das Schema legt keine
-- Sequenzen (serial/bigserial) an, für die 'authenticated' USAGE bräuchte.

-- create_organization ausführbar halten (idempotent; die RPC-Datei setzt das
-- bereits – hier zur Sicherheit, falls die Dateien getrennt eingespielt werden).
grant execute on function create_organization(text, text) to authenticated;

-- Damit künftige Tabellen (V2) nicht wieder "permission denied" werfen:
-- Standard-Rechte für neu angelegte Objekte. Gilt für Tabellen, die von der
-- aktuell ausführenden Rolle erstellt werden (im SQL Editor: postgres).
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
