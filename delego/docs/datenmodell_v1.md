# Datenmodell V1 – Turnier- & Event-Logistik

Stand: Juli 2026, Rev. 2 (nach Auswertung des BJEC-Hotelformulars).
Alle Tabellen: `id uuid`, `created_at` / `updated_at`.

## Grundprinzipien

1. **Multi-Tenant:** Alles hängt an einer `organization` (Veranstalter). Row-Level-Security trennt Mandanten strikt.
2. **Delegationen ohne Accounts:** Zugangslink mit Token. Sie legen ihre Delegation selbst an, tragen Personen, Reisen und Unterkunftswünsche ein und können **bis zur Deadline beliebig ändern** – danach schreibgeschützt (`tournaments.submission_deadline`, serverseitig erzwungen). Der Veranstalter kann jederzeit ändern.
3. **Reisen sind individuell:** Jede Delegation reist, wie sie will. `travel_groups` erfassen nur, was ankommt (Zeit, Ort, Flugnr., Personen). Die Bündelung zu effizienten Fahrten passiert beim Veranstalter in der Transferplanung – mit Vorschlagslogik (siehe unten).
4. **Unterkunft = Wunsch → Zuteilung:** Delegationen äußern strukturierte Wünsche (`accommodation_requests`), der Veranstalter teilt zu (`room_assignments`). Beide Ebenen bleiben getrennt, damit nachvollziehbar ist, was gewünscht vs. was zugeteilt wurde.
5. **Geld wird gerechnet, nicht kassiert:** Das Excel rechnet pro Person Hotel + Verpflegung + Gebühren zusammen. Das übernimmt die App als automatische Kostenvorschau pro Person/Delegation. Zahlungsabwicklung selbst bleibt V2.

## Tabellen

### organizations
name, slug

### memberships
user_id → auth.users, organization_id, role (`admin` | `staff` | `driver`)

### tournaments
organization_id, name, starts_on, ends_on, venue, status (`draft`|`active`|`archived`), **submission_deadline timestamptz**, settings jsonb

`settings` enthält u. a.:
- **fees:** Liste von Gebühren (Label, Betrag, Bedingung z. B. „nur EC-Teilnehmer") – z. B. Entry fee 40 €, Service fee EC 120 €, Service fee ITC 60 €
- **meal_slots:** konfigurierbare Verpflegungsangebote (Datum, Label z. B. „Lunch Venue Hall 22.06.", Preis) – Delegationen wählen pro Person an/ab
- **person_fields:** turnier­spezifische Zusatzfelder pro Person (z. B. Gewichtsklasse, ITC-Teilnahme ja/nein) – als konfigurierbare Felder, nicht hart codiert

### delegations
tournament_id, name, country_code (frei, z. B. `DEU-NR`), contact_name/email/phone, access_token, status (`invited`|`in_progress`|`submitted`|`confirmed`), notes

### persons
delegation_id, last_name, first_name, gender, role (`athlete`|`coach`|`official`), custom_fields jsonb (füllt die person_fields des Turniers), notes

### travel_groups
delegation_id, direction (`arrival`|`departure`), scheduled_at, carrier_ref (Flug/Zug), location, status (`planned`|`delayed`|`landed`|`done`), notes

### travel_group_members
travel_group_id, person_id

### vehicles
tournament_id, label, capacity

### transfers
tournament_id, travel_group_ids uuid[] (**eine Fahrt kann mehrere Reisegruppen bündeln**), driver_user_id, vehicle_id, pickup_at, from/to_location, status (`unassigned`|`assigned`|`en_route`|`completed`), notes

**Vorschlagslogik (App, nicht DB):** Ankünfte im gleichen Zeitfenster (konfigurierbar, z. B. ±45 min) am gleichen Ort werden als Bündelungsvorschlag angezeigt, solange die Fahrzeugkapazität reicht. Bei Statuswechsel auf `delayed` fliegt die Gruppe aus dem Bündel und landet in einer „Neu planen"-Liste. Kein Vollautomat – der Planer entscheidet, die App rechnet und warnt.

### hotels
tournament_id, name, address, is_official boolean (**„Non-official hotel" aus dem Formular = Pseudo-Hotel je Turnier**, damit auch Selbstbucher vollständig erfasst sind)

### room_categories
hotel_id, label (`single`|`double`|`triple`|`quadruple` oder frei), capacity, **price_per_person_night numeric**

### accommodation_requests  (der Wunsch – ersetzt das Excel-Formular)
person_id, hotel_id, room_category_id, check_in, check_out, roommate_wish text, remarks

Eine Person kann **mehrere Zeilen** haben (im Excel der „two lines"-Hack: 1 Nacht Einzel, 2 Nächte Doppel) – hier normal abgebildet.

### rooms
hotel_id, room_category_id, label

### room_assignments  (die Zuteilung)
room_id, person_id, check_in, check_out

### Kostenvorschau (berechnet, keine Tabelle)
Pro Person: Σ Übernachtungen × Kategoriepreis + gewählte meal_slots + zutreffende fees. Aggregiert pro Delegation. Ersetzt die Formelspalten des Excel und ist im Delegationsportal live sichtbar – **das** ist der sichtbarste Mehrwert gegenüber dem Formular.

## Zugriffsmodell
- Mitglieder: alles innerhalb ihrer Organisation; Rolle `driver` nur eigene Transfers.
- Delegationen: nie direkt auf die DB; Edge Functions prüfen Token + Deadline.

## Bewusst NICHT in V1
Zahlungsabwicklung (nur Vorschau), Wettkampf-/Ergebnisverwaltung, Auslosung, automatische Flugstatus-APIs, Dokumenten-Upload, Mehrsprachigkeit der Verwaltung (Portal: Englisch).

## Entschieden
- Zimmerwünsche: strukturiert (Hotel + Kategorie + Zeitraum + Mitbewohnerwunsch), nicht Freitext – das Excel beweist, dass Delegationen das ausfüllen können.
- Deadline: hart, serverseitig, pro Turnier.
- Turnierspezifische Personenfelder (Gewichtsklasse etc.): konfigurierbar statt hart codiert – macht das Produkt sportartübergreifend.
