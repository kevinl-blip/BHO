import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import OrganizationPage from './pages/OrganizationPage'
import TournamentPage from './pages/TournamentPage'
import PortalPage from './pages/PortalPage'

function ProtectedLayout() {
  const { session, user, loading, signOut } = useAuth()

  if (loading) return <p className="page muted">Lade …</p>
  if (!session) return <Navigate to="/login" replace />

  return (
    <>
      <header className="topbar">
        <span className="brand">Delego</span>
        <div className="topbar-right">
          <span className="muted">{user.email}</span>
          <button onClick={signOut}>Abmelden</button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Öffentliches Delegationsportal – ohne Login, Auth über Token */}
          <Route path="/portal/:token" element={<PortalPage />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/org/:orgId" element={<OrganizationPage />} />
            <Route path="/tournament/:tournamentId" element={<TournamentPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
