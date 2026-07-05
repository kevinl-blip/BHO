import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { session } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setBusy(true)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
      } else if (data.user && !data.session) {
        // E-Mail-Bestätigung ist im Supabase-Projekt aktiviert
        setInfo('Registrierung erfolgreich. Bitte bestätige deine E-Mail-Adresse und melde dich dann an.')
        setMode('login')
      }
    }
    setBusy(false)
  }

  return (
    <div className="auth-layout">
      <div className="card auth-card">
        <h1 className="brand">Delego</h1>
        <p className="muted">Turnier-Logistik für Veranstalter</p>

        <div className="tabs">
          <button
            className={mode === 'login' ? 'tab active' : 'tab'}
            onClick={() => { setMode('login'); setError(null); setInfo(null) }}
          >
            Anmelden
          </button>
          <button
            className={mode === 'register' ? 'tab active' : 'tab'}
            onClick={() => { setMode('register'); setError(null); setInfo(null) }}
          >
            Registrieren
          </button>
        </div>

        <form onSubmit={handleSubmit} className="stack">
          <label>
            E-Mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Passwort
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {error && <p className="error">{error}</p>}
          {info && <p className="info">{info}</p>}

          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Bitte warten …' : mode === 'login' ? 'Anmelden' : 'Konto erstellen'}
          </button>
        </form>
      </div>
    </div>
  )
}
