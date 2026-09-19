import { Navigate, useLocation } from 'react-router-dom'

export default function ProtectedRoute({ session, children }) {
  const location = useLocation()
  if (!session) return <Navigate to={`/auth${location.search || ''}`} replace />
  return children
}
