import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// Übernachtungsdaten des Turniers inkl. je ein Tag Puffer davor/danach.
// Ein Datum bezeichnet die Nacht von <date> auf den Folgetag.
function nightRange(startStr, endStr) {
  if (!startStr || !endStr) return []
  const out = []
  const start = new Date(`${startStr}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - 1)
  const last = new Date(`${endStr}T00:00:00Z`)
  last.setUTCDate(last.getUTCDate() + 1)
  for (let d = new Date(start); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

const cellKey = (catId, date) => `${catId}|${date}`

// Teil B: Kontingent-Raster pro Hotel. Zeilen = Nächte, Spalten = Kategorien,
// Zellen = Anzahl verfügbarer ZIMMER → room_inventory (Batch-Upsert).
export default function InventoryManager({ hotels, startsOn, endsOn }) {
  const [hotelId, setHotelId] = useState('')
  const [values, setValues] = useState({}) // cellKey → string
  const [initial, setInitial] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)

  const hotel = hotels.find((h) => h.id === hotelId) ?? null
  const categories = hotel?.room_categories ?? []
  const nights = useMemo(() => nightRange(startsOn, endsOn), [startsOn, endsOn])
  const catIds = categories.map((c) => c.id)

  const loadInventory = useCallback(async () => {
    if (catIds.length === 0) {
      setValues({}); setInitial({}); return
    }
    const { data, error: e } = await supabase
      .from('room_inventory')
      .select('room_category_id, date, available_count')
      .in('room_category_id', catIds)
    if (e) { setError(e.message); return }
    const map = {}
    for (const r of data ?? []) map[cellKey(r.room_category_id, r.date)] = String(r.available_count)
    setValues(map)
    setInitial(map)
    setError(null)
  }, [catIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadInventory() }, [loadInventory])

  function setCell(catId, date, v) {
    // nur nichtnegative Ganzzahlen oder leer
    if (v !== '' && !/^\d+$/.test(v)) return
    setValues((m) => ({ ...m, [cellKey(catId, date)]: v }))
  }

  const dirty = Object.keys({ ...values, ...initial }).some(
    (k) => (values[k] ?? '') !== (initial[k] ?? ''),
  )

  async function save() {
    setError(null)
    setBusy(true)
    const upserts = []
    const deletes = []
    const keys = new Set([...Object.keys(values), ...Object.keys(initial)])
    for (const k of keys) {
      const cur = values[k] ?? ''
      if (cur === (initial[k] ?? '')) continue // unverändert
      const [catId, date] = k.split('|')
      if (cur === '') deletes.push({ catId, date })
      else upserts.push({ room_category_id: catId, date, available_count: Number(cur) })
    }
    try {
      if (upserts.length > 0) {
        const { error: e } = await supabase
          .from('room_inventory')
          .upsert(upserts, { onConflict: 'room_category_id,date' })
        if (e) throw e
      }
      for (const d of deletes) {
        const { error: e } = await supabase
          .from('room_inventory')
          .delete()
          .eq('room_category_id', d.catId)
          .eq('date', d.date)
        if (e) throw e
      }
      await loadInventory()
      setSavedAt(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h3>Kontingent-Raster</h3>
      <p className="muted">
        Anzahl verfügbarer <strong>Zimmer</strong> (nicht Betten) pro Kategorie und Nacht.
        Ein Datum = Nacht von diesem Tag auf den Folgetag. Puffertage vor/nach dem
        Turnier sind enthalten.
      </p>

      <label>
        Hotel
        <select value={hotelId} onChange={(e) => setHotelId(e.target.value)}>
          <option value="">— Hotel wählen —</option>
          {hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
      </label>

      {hotelId && categories.length === 0 && (
        <p className="muted">Dieses Hotel hat noch keine Zimmerkategorien.</p>
      )}
      {hotelId && !startsOn && (
        <p className="muted">Für das Turnier ist kein Zeitraum gesetzt.</p>
      )}

      {hotelId && categories.length > 0 && nights.length > 0 && (
        <>
          <div className="grid-scroll">
            <table className="inv-grid">
              <thead>
                <tr>
                  <th>Nacht</th>
                  {categories.map((c) => <th key={c.id}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {nights.map((date) => (
                  <tr key={date}>
                    <th className="night">{date}</th>
                    {categories.map((c) => (
                      <td key={c.id}>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="inv-cell"
                          value={values[cellKey(c.id, date)] ?? ''}
                          onChange={(e) => setCell(c.id, date, e.target.value)}
                          placeholder="0"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button className="primary" onClick={save} disabled={busy || !dirty}>
              {busy ? 'Speichern …' : dirty ? 'Raster speichern' : 'Gespeichert'}
            </button>
            {savedAt && !dirty && (
              <span className="muted small">Gespeichert {savedAt.toLocaleTimeString('de-DE')}</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
