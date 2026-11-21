// UX guard only. The server is the security boundary: every endpoint re-checks role, tenant and consent.
import { Navigate, Outlet } from 'react-router-dom'
import type { Role } from '../api/types'
import { homeFor, useAuth } from './AuthProvider'

export default function ProtectedRoute({ roles }: { roles: Role[] }) {
  const { me, loading } = useAuth()
  if (loading && !me) return <div className="p-8 text-ink-soft" role="status">…</div>
  if (!me) return <Navigate to="/login" replace />
  if (!roles.includes(me.role)) return <Navigate to={homeFor(me.role)} replace />
  return <Outlet />
}
