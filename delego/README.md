# Delego – Turnier-Logistik

Multi-Tenant-Web-App für Turnier-Logistik (Delegationen, Anmeldung, Transfers,
Hotelzuteilung). React + Vite + Supabase.

## Stand

**Meilenstein 5a – Hotels, Kontingente & Unterkunftswünsche**

- Schema V3 (`docs/delego_schema_v3_hotelkontingente.sql`): `room_inventory`
  (tagesgenaue Zimmerkontingente), `rooms`-Spalten `check_in`/`check_out`/`is_upgrade`.
- Veranstalter (Turnier-Ansicht): Hotels anlegen/bearbeiten/löschen (Name,
  Adresse, `is_official`; `is_official=false` = Selbstbucher-Hotel), pro Hotel
  Zimmerkategorien (Label, Bettenzahl, Preis p. P./Nacht). Kontingent-Raster pro
  Hotel: Zeilen = Nächte (Turnierzeitraum ± 1 Puffertag), Spalten = Kategorien,
  Zellen = verfügbare **Zimmer** → `room_inventory` (Batch-Upsert).
- Portal (Delegation): Unterkunftswünsche pro Person → `accommodation_requests`
  (Hotel, Kategorie, check_in/out, Mitbewohnerwunsch, Bemerkung), mehrere Zeilen
  pro Person möglich. Auswählbar nur Hotels/Kategorien des eigenen Turniers.
- Neue Edge Function `portal-accommodation`: Deadline zuerst (403), dann
  dreifache Cross-Tournament-Kette – `person_not_in_delegation` /
  `hotel_not_in_tournament` / `category_not_in_hotel` (je harte 400) und
  `check_out > check_in`. `portal-session` liefert zusätzlich Hotels (mit
  Kategorien) und die Wünsche der Delegation.

**Meilenstein 4b Teil 1 – Einsatztag-Sichten (Fahrer & Koordinatoren)**

- Schema V2 (`docs/delego_schema_v2_einsatztag.sql`): `drivers`, `coordinators`,
  `arrival_checkins`, `walkins`, Spalte `transfers.driver_id`.
- Veranstalter (Turnier-Ansicht): Fahrer und Koordinatoren anlegen/bearbeiten/
  löschen (Name, Telefon, aktiv), je mit Token-Link zum Kopieren, „Link neu
  erzeugen" und Deaktivieren. Disposition weist Fahrer jetzt über `driver_id`
  (echter Name) statt über `driver_user_id` zu.
- Fahrer-Ansicht (`/driver/<token>`, ohne Login, mobil, live per Polling ~5 s):
  eigene Fahrten chronologisch mit Zeit, Ort, Personen inkl. Check-in-Status
  (present grün / missing rot / expected), pro Fahrt eine Zusammenfassung
  („All passengers here" bzw. „N missing — check with coordinator") und Kontakte
  der aktiven Koordinatoren als `tel:`-Links. Zielhotel-Feld (vorerst „not
  assigned yet"). Edge Function `driver-session` (nur Lesen) liefert Status und
  Kontakte mit – strikt auf die Fahrten des Tokens gescopet.
- Koordinator-Ansicht (`/coordinator/<token>`, ohne Login, mobil, live per
  Polling ~5 s): gesamte Ankunftsübersicht des Turniers mit Personen, Fahrer,
  Ort, Zeit; Abhaken pro Person (`expected/present/missing` → `arrival_checkins`)
  und Walk-ins erfassen. Edge Functions `coordinator-session` (Lesen) und
  `coordinator-checkin` (Schreiben).
- Cross-Tournament-Schutz: Koordinator-Token → `tournament_id` serverseitig;
  jede `person_id` wird über `persons→delegations` gegen dieses Turnier geprüft
  (400 `person_not_in_tournament`, harte Ablehnung), Walk-ins werden mit dem
  server-abgeleiteten `tournament_id` geschrieben.
- Veranstalter-Livesicht (`ArrivalBoard` in der Turnier-Ansicht): Anwesenheits-
  stand pro Delegation (present/expected/missing, pro Person aufklappbar) und
  Walk-in-Liste, per Polling ~5 s aktualisiert. Nur Lesen über RLS
  (`chk_select` / `wlk_select`).

**Meilenstein 4a – Reisen: Erfassung & einfache Disposition**

- Portal (`PortalTravel`): Delegation trägt Reisegruppen ein (Ankunft/Abreise,
  Zeitpunkt, Ort, Flug-/Zugnummer, mitreisende Personen). Anlegen/bearbeiten/
  löschen bis zum Meldeschluss, danach schreibgeschützt.
- Neue Edge Function `portal-travel` (analog zu `portal-persons`): gleiche
  Token-/Deadline-Logik (Deadline 403 vor allem anderen). Cross-Delegation-
  Schutz: `delegation_id` serverseitig gesetzt, alle Mitglieder-IDs (Feld
  `member_ids`, kanonisch wie in `portal-session`; `person_ids` als Alias
  toleriert) gegen die eigenen Personen der Delegation geprüft – eine fremde ID
  wird **hart abgelehnt** (400 `person_not_in_delegation`), nicht herausgefiltert.
  Es gibt kein DB-Constraint dafür – die Function ist der Durchsetzungspunkt.
  Eine Reisegruppe ohne gültige Mitglieder wird abgelehnt (400 `no_members`).
- `portal-session` liefert zusätzlich die `travel_groups` (mit Mitglieder-IDs).
- Disposition (`TravelDisposition`, Veranstalter): Ankunfts-/Abreiseübersicht
  nach `scheduled_at`, Mehrfachauswahl → Fahrt (`transfer`) erstellen; Fahrer,
  Fahrzeug, Abholzeit, Ziel, Status manuell setzen; Reisegruppen herauslösen;
  Fahrt löschen. Fahrzeugverwaltung (`VehiclesManager`). Passagier-/Kapazitäts-
  Anzeige mit Warnhinweis (kein Auto-Bündeln – das ist 4b).
- Fahrer werden per user_id-Kürzel angezeigt (kein Profil-Schema in V1).

**Meilenstein 1**

- Login / Registrierung (Supabase Auth, E-Mail + Passwort)
- Organisation anlegen (Ersteller wird automatisch `admin`-Mitglied)
- Turnier anlegen (Name, Zeitraum, Austragungsort, Meldeschluss, Status `draft`)

**Meilenstein 3 – Personenfelder & Meldeübersicht**

- Config-UI (Turnier-Ansicht): turnierspezifische Personenfelder verwalten
  (`tournaments.settings.person_fields`) – Bezeichnung, Typ (`text` | `select` |
  `date` | `boolean`), Optionen bei `select`, Pflicht-Flag, Reihenfolge.
- Portal rendert alle vier Typen und blockt das Absenden, solange ein
  Pflichtfeld leer ist (`boolean` ist von „Pflicht" ausgenommen – hat immer
  einen Wert).
- **Pflichtfeld-Validierung serverseitig** in `portal-persons` gespiegelt
  (400 `required_field_missing`): das Frontend ist keine Vertrauensgrenze, der
  Token-Inhaber kann die Function direkt aufrufen. Reihenfolge: Deadline (403)
  vor Pflichtfeld (400) – die Deadline-Sperre bleibt unberührt.
- Meldeübersicht: pro Delegation Anzahl gemeldeter Personen + Status; Personen
  je Delegation ausklappbar (nur lesen, keine Bearbeitung durch den
  Veranstalter).

**Meilenstein 2 – Delegations-Verwaltung & Portal**

- Veranstalter (in der Turnier-Ansicht): Delegationen anlegen/bearbeiten/löschen,
  pro Delegation ein Zugangslink mit Token zum Kopieren, Link neu erzeugen
  (macht den alten sofort ungültig).
- Öffentliches Delegationsportal unter `/portal/<token>` – **ohne Login**.
  Die Delegation trägt ihre Personen ein und bearbeitet sie bis zum
  Meldeschluss; danach serverseitig schreibgeschützt.
- Backend: zwei Supabase Edge Functions (`portal-session`, `portal-persons`),
  die mit `service_role` laufen. Die gesamte Zugriffskontrolle steckt im
  Function-Code: Token → genau eine `delegation_id`, jede Query darauf
  gefiltert; Deadline (`tournaments.submission_deadline`) wird bei jedem
  Schreibvorgang geprüft (403 nach Ablauf). RLS bleibt für die Tabellen aktiv;
  das Portal fasst sie nie direkt an.

## Setup

1. Abhängigkeiten installieren:

   ```sh
   npm install
   ```

2. Umgebungsvariablen setzen – `.env.example` nach `.env` kopieren und den
   **anon key** aus dem Supabase-Dashboard eintragen
   (Project Settings → API → `anon` `public`):

   ```sh
   cp .env.example .env
   ```

3. Dev-Server starten:

   ```sh
   npm run dev
   ```

## Voraussetzungen im Supabase-Projekt

- Schema V1 ist eingespielt (14 Tabellen mit RLS), siehe
  `docs/delego_schema_v1.sql` bzw. `docs/datenmodell_v1.md`.
- **Zusätzlich muss `docs/rpc_create_organization.sql` eingespielt werden**
  (SQL Editor → Run). Die RPC legt Organisation + Admin-Mitgliedschaft atomar
  an; das Schema selbst definiert sie nicht, verlangt sie aber (die
  `mem_write`-Policy setzt die Admin-Rolle bereits voraus – Henne-Ei beim
  Onboarding).
- **Und `docs/grants_v1.sql` einspielen** (SQL Editor → Run). Neu angelegte
  Supabase-Projekte setzen die Default-Tabellen-GRANTs für `authenticated`
  nicht mehr automatisch – ohne diese Datei scheitert schon das Dashboard mit
  `permission denied for table memberships`. Die GRANTs sind sicher, weil RLS
  auf allen Tabellen aktiv bleibt und die eigentliche Zeilen-Sperre ist
  (Details oben in der Datei).
- **Für die Einsatztag-Sichten (Meilenstein 4b): `docs/delego_schema_v2_einsatztag.sql`
  einspielen** (SQL Editor → Run), **als 4. Schritt nach Schema → RPC → Grants**.
  Legt die Tabellen `drivers`, `coordinators`, `arrival_checkins`, `walkins` an,
  ergänzt `transfers.driver_id` und bringt RLS-Policies + GRANTs für die vier
  neuen Tabellen gleich mit.
- **Für die Hotelkontingente (Meilenstein 5a): `docs/delego_schema_v3_hotelkontingente.sql`
  einspielen** (SQL Editor → Run), **als 5. Schritt**. Legt `room_inventory`
  (tagesgenaue Zimmerkontingente) an, ergänzt `rooms` um `check_in`/`check_out`/
  `is_upgrade` und bringt RLS-Policies + GRANTs mit.
- E-Mail-Auth ist aktiviert. Ist „Confirm email" eingeschaltet, müssen sich
  neue Nutzer erst per Bestätigungslink verifizieren.

**Reihenfolge der SQL-Dateien (im SQL Editor, in dieser Reihenfolge):**

1. `docs/delego_schema_v1.sql` – Basisschema + RLS
2. `docs/rpc_create_organization.sql` – Onboarding-RPC
3. `docs/grants_v1.sql` – Tabellen-GRANTs
4. `docs/delego_schema_v2_einsatztag.sql` – Einsatztag-Tabellen (Fahrer, Koordinatoren, Check-ins, Walk-ins)
5. `docs/delego_schema_v3_hotelkontingente.sql` – Hotelkontingente (`room_inventory`, `rooms`-Spalten)

## Edge Functions deployen (für Meilenstein 2 / das Portal)

Das Delegationsportal funktioniert erst, wenn die beiden Edge Functions im
Supabase-Projekt liegen. Die Functions bringen ihre Secrets automatisch mit
(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` werden von Supabase gesetzt) – du
musst nichts zusätzlich konfigurieren.

**Schritt für Schritt:**

1. Supabase CLI installieren (falls noch nicht vorhanden):

   ```sh
   npm install -g supabase
   # oder: brew install supabase/tap/supabase
   ```

2. Bei Supabase anmelden (öffnet den Browser):

   ```sh
   supabase login
   ```

3. In den `delego/`-Ordner wechseln und das lokale Projekt mit dem
   Cloud-Projekt verknüpfen (Project-Ref = `rlrgbrkebsnpirbtocrk`):

   ```sh
   cd delego
   supabase link --project-ref rlrgbrkebsnpirbtocrk
   ```

4. Beide Functions deployen. **Wichtig: `--no-verify-jwt`**, weil das Portal
   öffentlich ist (kein Login) – die Authentifizierung macht unser Token-Check
   im Function-Code, nicht Supabase-Auth:

   ```sh
   supabase functions deploy portal-session      --no-verify-jwt
   supabase functions deploy portal-persons      --no-verify-jwt
   supabase functions deploy portal-travel       --no-verify-jwt
   supabase functions deploy driver-session      --no-verify-jwt
   supabase functions deploy coordinator-session --no-verify-jwt
   supabase functions deploy coordinator-checkin --no-verify-jwt
   supabase functions deploy portal-accommodation --no-verify-jwt
   ```

5. Kurz prüfen (ungültiger Token muss `404 {"error":"invalid token"}` liefern;
   `<ANON_KEY>` durch deinen anon/publishable Key ersetzen):

   ```sh
   curl -i -X POST \
     https://rlrgbrkebsnpirbtocrk.supabase.co/functions/v1/portal-session \
     -H "Authorization: Bearer <ANON_KEY>" \
     -H "Content-Type: application/json" \
     -d '{"token":"nope"}'
   ```

Neu deployen nach Code-Änderungen: einfach Schritt 4 erneut ausführen.

## Struktur

```
src/
  lib/supabaseClient.js      Supabase-Client (liest VITE_SUPABASE_URL / _ANON_KEY)
  lib/portalApi.js           Client für die Portal-Edge-Functions (Token im Body)
  context/AuthContext.jsx    Session-Handling (getSession + onAuthStateChange)
  pages/LoginPage.jsx        Anmelden / Registrieren
  pages/DashboardPage.jsx    Organisationen auflisten + anlegen
  pages/OrganizationPage.jsx Turniere einer Organisation auflisten + anlegen
  pages/TournamentPage.jsx   Delegationen verwalten + Zugangslinks (Veranstalter)
  pages/PortalPage.jsx       Öffentliches Delegationsportal (ohne Login, EN)
  App.jsx                    Routing (öffentlich: /login, /portal/:token)

supabase/functions/
  _shared/cors.ts            CORS-Header + json()-Helper
  _shared/portal.ts          Token-Auflösung + Personen-Query (service_role)
  portal-session/index.ts    POST { token } → Kontext + Personenliste
  portal-persons/index.ts    POST { token, action, person } → CRUD, deadline-geschützt
```

## Sicherheitsmodell des Portals (Kurzfassung)

- Der `access_token` (UUIDv4, 122 Bit) ist ein Bearer-Credential: Wer den Link
  hat, darf genau diese Delegation bearbeiten. Bewusst so (Delegationen haben
  keine Accounts).
- Das Portal spricht **ausschließlich** die Edge Functions an, nie die Tabellen
  direkt. Die Functions laufen mit `service_role` (umgeht RLS) – deshalb liegt
  die komplette Zugriffskontrolle im Code: Token → eine `delegation_id`, jede
  Query strikt darauf gefiltert, `update`/`delete` zusätzlich mit
  `.eq('delegation_id', …)` gegen Cross-Delegation-Zugriff.
- Der Token wird im **POST-Body** übertragen (nicht als URL-Query), damit er
  nicht in Access-/Referer-Logs landet.
- Die Meldeschluss-Sperre ist serverseitig autoritativ: `portal-persons` lehnt
  nach Ablauf jeden Schreibvorgang mit **403** ab. Das `read_only`-Flag im
  Frontend ist reine UX.
