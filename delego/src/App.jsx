import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import OrganizationPage from './pages/OrganizationPage'

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
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/org/:orgId" element={<OrganizationPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
