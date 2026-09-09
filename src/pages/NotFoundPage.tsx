import { Link } from 'react-router-dom'
import { PageShell } from '../components/common/PageShell'

export default function NotFoundPage() {
  return <PageShell eyebrow="404" title="Pagina non trovata"><Link className="action w-fit" to="/">Torna all’inizio</Link></PageShell>
}
