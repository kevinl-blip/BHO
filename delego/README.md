# Delego – Turnier-Logistik

Multi-Tenant-Web-App für Turnier-Logistik (Delegationen, Anmeldung, Transfers,
Hotelzuteilung). React + Vite + Supabase.

## Stand (Meilenstein 1)

- Login / Registrierung (Supabase Auth, E-Mail + Passwort)
- Organisation anlegen (Ersteller wird automatisch `admin`-Mitglied)
- Turnier anlegen (Name, Zeitraum, Austragungsort, Meldeschluss, Status `draft`)

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
- E-Mail-Auth ist aktiviert. Ist „Confirm email" eingeschaltet, müssen sich
  neue Nutzer erst per Bestätigungslink verifizieren.

## Struktur

```
src/
  lib/supabaseClient.js      Supabase-Client (liest VITE_SUPABASE_URL / _ANON_KEY)
  context/AuthContext.jsx    Session-Handling (getSession + onAuthStateChange)
  pages/LoginPage.jsx        Anmelden / Registrieren
  pages/DashboardPage.jsx    Organisationen auflisten + anlegen
  pages/OrganizationPage.jsx Turniere einer Organisation auflisten + anlegen
  App.jsx                    Routing, geschützter Bereich mit Topbar
```
