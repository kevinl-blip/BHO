import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [orgs, setOrgs] = useState(null)
  const [name, setName] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const loadOrgs = useCallback(async () => {
    const { data, error } = await supabase
      .from('memberships')
      .select('role, organizations ( id, name, slug )')
      .eq('user_id', user.id)
    if (error) {
      setError(error.message)
      setOrgs([])
    } else {
      setOrgs(data.filter((m) => m.organizations))
    }
  }, [user.id])

  useEffect(() => { loadOrgs() }, [loadOrgs])

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)

    // Legt Organisation + eigene Admin-Mitgliedschaft atomar an
    // (security definer, siehe docs/rpc_create_organization.sql) –
    // direkte Inserts scheitern an den RLS-Policies (mem_write
    // verlangt bereits die Admin-Rolle).
    const { error: rpcError } = await supabase.rpc('create_organization', {
      org_name: name,
      org_slug: slugify(name),
    })

    if (rpcError) {
      setError(rpcError.message)
    } else {
      setName('')
      await loadOrgs()
    }
    setBusy(false)
  }

  return (
    <div className="page">
      <h2>Meine Organisationen</h2>

      {orgs === null && <p className="muted">Lade …</p>}
      {orgs?.length === 0 && (
        <p className="muted">
          Noch keine Organisation. Lege unten deine erste an – du wirst automatisch Admin.
        </p>
      )}

      <ul className="item-list">
        {orgs?.map((m) => (
          <li key={m.organizations.id}>
            <Link to={`/org/${m.organizations.id}`} className="item">
              <span>{m.organizations.name}</span>
              <span className="badge">{m.role}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="card">
        <h3>Neue Organisation anlegen</h3>
        <form onSubmit={handleCreate} className="stack">
          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="z. B. Judo-Verband NRW"
            />
          </label>
          {name && <p className="muted">Slug: {slugify(name)}</p>}
          {error && <p className="error">{error}</p>}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Bitte warten …' : 'Organisation anlegen'}
          </button>
        </form>
      </div>
    </div>
  )
}
