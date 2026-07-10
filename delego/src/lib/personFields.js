// Geteilte Logik für die turnierspezifischen Personenfelder
// (tournaments.settings.person_fields). Wird von der Config-UI, der PortalPage
// und der Leseansicht des Veranstalters benutzt, damit alle dieselbe
// Definition von „Typ" und „Pflichtfeld" verwenden.
//
// Feld-Form: { key, label, type, options?, required? }
//   key      stabile ID (ändert sich nie, unabhängig vom Label)
//   type     'text' | 'select' | 'date' | 'boolean'
//   options  string[] – nur bei type 'select'
//   required boolean  – bei 'boolean' bedeutungslos (immer erfüllt)

export const FIELD_TYPES = ['text', 'select', 'date', 'boolean']

export function generateFieldKey() {
  return `f_${crypto.randomUUID().slice(0, 8)}`
}

// Gilt ein Wert als „leer" für die Pflichtprüfung? Ein boolean hat immer einen
// Wert (true/false), zählt also nie als leer.
export function isFieldEmpty(field, value) {
  if (field.type === 'boolean') return false
  return value === undefined || value === null || String(value).trim() === ''
}

// Label des ersten fehlenden Pflichtfeldes oder null. Identische Logik wird
// serverseitig in der Edge Function gespiegelt.
export function firstMissingRequired(fields, customFields) {
  if (!Array.isArray(fields)) return null
  for (const f of fields) {
    if (!f?.required) continue
    if (isFieldEmpty(f, customFields?.[f.key])) return f.label || f.key
  }
  return null
}

// Anzeigeform eines gespeicherten Custom-Werts für Leseansichten.
export function formatCustomValue(field, value, { yes = 'Yes', no = 'No' } = {}) {
  if (field.type === 'boolean') return value ? yes : no
  if (value === undefined || value === null || value === '') return '—'
  return String(value)
}
