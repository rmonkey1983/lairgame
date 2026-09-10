import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { getCurrentStaffAccess, signOutStaff, type StaffAccess } from '../../domain/session/staff.auth'

export function StaffGate({ children }: { children?: ReactNode }) {
  const [status, setStatus] = useState<'checking' | 'authorized' | 'unauthorized'>('checking')
  const [access, setAccess] = useState<StaffAccess | null>(null)

  useEffect(() => {
    let active = true
    void getCurrentStaffAccess().then((result) => {
      if (!active) return
      if (result.ok) { setAccess(result.value); setStatus('authorized') }
      else { void signOutStaff(); setStatus('unauthorized') }
    })
    return () => { active = false }
  }, [])

  if (status === 'checking') return <main className="mx-auto flex min-h-svh items-center justify-center px-5"><p className="text-muted">Verifica accesso…</p></main>
  if (status === 'unauthorized') return <Navigate to="/admin/login" replace />
  return children ? <>{children}</> : <Outlet context={access} />
}
