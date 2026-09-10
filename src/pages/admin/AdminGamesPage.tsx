import { useOutletContext } from 'react-router-dom'
import { PageShell } from '../../components/common/PageShell'
import { signOutStaff, type StaffAccess } from '../../domain/session/staff.auth'
import { useNavigate } from 'react-router-dom'

export default function AdminGamesPage() {
  const access = useOutletContext<StaffAccess>()
  const navigate = useNavigate()
  async function logout() { await signOutStaff(); navigate('/admin/login', { replace: true }) }
  return <PageShell eyebrow="Control Room" title="Regia"><p className="max-w-md text-muted">Accesso autorizzato{access.display_name ? ` · ${access.display_name}` : ''}.</p><p className="mt-3 text-muted">Game selector disponibile in milestone successiva.</p><button className="action action-secondary mt-8 w-fit" type="button" onClick={() => void logout()}>Logout</button></PageShell>
}
