import { Link } from 'react-router-dom'
import { PageShell } from '../components/common/PageShell'

export default function HomePage() {
  return <PageShell eyebrow="Black Bulls Lab · Foundation" title="Liar System">
    <div className="home-hero max-w-3xl">
      <p className="max-w-xl text-xl leading-8 text-muted">Un gioco sociale dal vivo. Le decisioni accadono a tavola; la Regia tiene il filo.</p>
      <div className="mt-10 grid max-w-xl gap-3 border-l-2 border-primary pl-5 text-sm text-muted sm:grid-cols-3 sm:border-l-0 sm:border-t-2 sm:pl-0 sm:pt-4">
        <span>01 / Entra</span><span>02 / Osserva</span><span>03 / Dubita</span>
      </div>
      <nav aria-label="Superfici foundation" className="mt-10 flex flex-wrap gap-3">
        <Link className="action" to="/admin/games">Control Room</Link>
        <Link className="action action-secondary" to="/play/demo">Player entry</Link>
      </nav>
    </div>
  </PageShell>
}
