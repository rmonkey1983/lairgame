import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { PageShell } from '../../components/common/PageShell'
import { signInStaff } from '../../domain/session/staff.auth'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setSubmitting(true)
    const result = await signInStaff(email, password)
    if (!result.ok) { setError(result.error.userMessage); setSubmitting(false); return }
    const destination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/admin/games'
    navigate(destination, { replace: true })
  }
  return <PageShell eyebrow="Control Room" title="Accesso Regia"><form className="grid max-w-md gap-5" onSubmit={submit}>
    <label className="grid gap-2 text-sm font-semibold" htmlFor="staff-email">Email<input id="staff-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label className="grid gap-2 text-sm font-semibold" htmlFor="staff-password">Password<input id="staff-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <button className="action w-fit" type="submit" disabled={submitting}>{submitting ? 'Accesso in corso…' : 'Accedi alla Regia'}</button>
  </form></PageShell>
}
