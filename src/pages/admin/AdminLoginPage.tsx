import { Link } from 'react-router-dom'
import { PageShell } from '../../components/common/PageShell'

export default function AdminLoginPage() {
  return <PageShell eyebrow="Control Room" title="Accesso Regia"><p className="max-w-md text-muted">Login Staff sarà collegato in una milestone successiva.</p><Link className="action mt-8 w-fit" to="/admin/games">Vai al game selector</Link></PageShell>
}
