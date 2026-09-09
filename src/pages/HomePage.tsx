import { Link } from 'react-router-dom'
import { PageShell } from '../components/common/PageShell'

export default function HomePage() {
  return <PageShell eyebrow="Black Bulls Lab · Foundation" title="Liar System">
    <div className="max-w-xl">
      <p className="text-lg leading-8 text-muted">Motore per esperienze sociali live. Foundation tecnica pronta per le milestone successive.</p>
      <nav aria-label="Superfici foundation" className="mt-8 flex flex-wrap gap-3">
        <Link className="action" to="/admin/games">Control Room</Link>
        <Link className="action action-secondary" to="/play/demo">Player entry</Link>
      </nav>
    </div>
  </PageShell>
}
