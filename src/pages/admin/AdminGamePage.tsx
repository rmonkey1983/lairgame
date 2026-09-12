import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageShell } from "../../components/common/PageShell";
import {
  getAllowedLifecycleTransitions,
  getAllowedNarrativePhaseTransitions,
} from "../../domain/game/game.state-machine";
import type {
  GameLifecycle,
  NarrativePhase,
} from "../../domain/game/game.types";
import {
  isStaleLifecycleError,
  transitionGameLifecycle,
} from "../../domain/session/staff.game.command";
import {
  isStaleNarrativePhaseError,
  transitionGameNarrativePhase,
} from "../../domain/session/staff.game.phase.command";
import { assignGameRoles } from "../../domain/session/staff.game.roles.command";
import {
  getStaffGameOverview,
  getStaffGameRoster,
  getStaffGameClues,
  getStaffGameComparisons,
  getStaffGamePressureRoutes,
  getStaffGameRoles,
  type StaffGameOverview,
  type StaffGameRosterPlayer,
  type StaffGameRole,
  type StaffGameClue,
  type StaffGameComparison,
  type StaffGamePressureRoute,
} from "../../domain/session/staff.game.read";
import { subscribeToStaffGameState } from "../../domain/session/staff.game.realtime";

const lifecycleLabels: Record<GameLifecycle, string> = {
  draft: "Bozza",
  ready: "Rendi pronta",
  checkin_open: "Apri check-in",
  live: "Avvia partita",
  paused: "Metti in pausa",
  completed: "Completa partita",
  aborted: "Interrompi partita",
};
const narrativePhaseLabels: Record<NarrativePhase, string> = {
  lobby: "Lobby",
  role_reveal: "Role reveal",
  briefing: "Briefing",
  discovery: "Scoperta",
  comparison: "Confronto",
  pressure: "Pressione",
  auction: "Asta",
  deliberation: "Deliberazione",
  final_vote: "Voto finale",
  reveal: "Rivelazione",
};
const narrativePhaseActionLabels: Record<NarrativePhase, string> = {
  lobby: "Vai a scoperta ruoli",
  role_reveal: "Vai al briefing",
  briefing: "Vai a scoperta",
  discovery: "Vai al confronto",
  comparison: "Vai alla pressione",
  pressure: "Vai all’asta",
  auction: "Vai alla deliberazione",
  deliberation: "Vai al voto finale",
  final_vote: "Vai alla rivelazione",
  reveal: "",
};
const roleLabels: Record<StaffGameRole["role"], string> = {
  liar: "Bugiardo",
  accomplice: "Complice",
  scapegoat: "Capro espiatorio",
  investigator: "Investigatore",
};
const seatsPerTable = 6;
function lifecycleActionLabel(from: GameLifecycle, target: GameLifecycle) {
  return target === "live" && from === "paused"
    ? "Riprendi partita"
    : lifecycleLabels[target];
}

export default function AdminGamePage() {
  const { gameCode } = useParams();
  const [overview, setOverview] = useState<StaffGameOverview | null>(null);
  const [roster, setRoster] = useState<StaffGameRosterPlayer[] | null>(null);
  const [roles, setRoles] = useState<StaffGameRole[] | null>(null);
  const [clues, setClues] = useState<StaffGameClue[] | null>(null);
  const [comparisons, setComparisons] = useState<StaffGameComparison[] | null>(null);
  const [pressureRoutes, setPressureRoutes] = useState<StaffGamePressureRoute[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [commandPending, setCommandPending] = useState(false);
  const [phaseCommandPending, setPhaseCommandPending] = useState(false);
  const [roleCommandPending, setRoleCommandPending] = useState(false);
  const loadOverview = useCallback(async () => {
    if (!gameCode) return null;
    const r = await getStaffGameOverview(gameCode);
    if (r.ok) {
      setOverview(r.value);
      setError(null);
    } else setError(r.error.userMessage);
    return r;
  }, [gameCode]);
  const loadRoster = useCallback(async () => {
    if (!gameCode) return null;
    const r = await getStaffGameRoster(gameCode);
    if (r.ok) setRoster(r.value);
    else setError(r.error.userMessage);
    return r;
  }, [gameCode]);
  const loadRoles = useCallback(async () => {
    if (!gameCode) return null;
    const r = await getStaffGameRoles(gameCode);
    if (r.ok) setRoles(r.value);
    else setError(r.error.userMessage);
    return r;
  }, [gameCode]);
  const loadClues = useCallback(async () => {
    if (!gameCode) return null;
    const r = await getStaffGameClues(gameCode);
    if (r.ok) setClues(r.value);
    else setError(r.error.userMessage);
    return r;
  }, [gameCode]);
  const loadComparisons = useCallback(async () => {
    if (!gameCode) return null;
    const r = await getStaffGameComparisons(gameCode);
    if (r.ok) setComparisons(r.value);
    else setError(r.error.userMessage);
    return r;
  }, [gameCode]);
  const loadPressureRoutes = useCallback(async () => {
    if (!gameCode) return null;
    const r = await getStaffGamePressureRoutes(gameCode);
    if (r.ok) setPressureRoutes(r.value);
    else setError(r.error.userMessage);
    return r;
  }, [gameCode]);
  useEffect(() => {
    if (!gameCode) return;
    let active = true;
    let unsubscribe: () => void = () => undefined;
    void getStaffGameOverview(gameCode).then((r) => {
      if (!active) return;
      if (!r.ok) {
        setError(r.error.userMessage);
        return;
      }
      setOverview(r.value);
      setError(null);
      void Promise.all([loadRoster(), loadRoles(), loadClues(), loadComparisons(), loadPressureRoutes()]);
      unsubscribe = subscribeToStaffGameState(r.value.id, () => {
        void Promise.all([loadOverview(), loadRoster(), loadRoles(), loadClues(), loadComparisons(), loadPressureRoutes()]);
      });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [gameCode, loadOverview, loadRoster, loadRoles, loadClues, loadComparisons, loadPressureRoutes]);
  async function handleTransition(target: GameLifecycle) {
    if (!overview || !gameCode || commandPending) return;
    if (
      (target === "completed" || target === "aborted") &&
      !window.confirm(`Confermi: ${lifecycleLabels[target]}?`)
    )
      return;
    setCommandPending(true);
    setError(null);
    const r = await transitionGameLifecycle({
      gameCode,
      expectedLifecycle: overview.lifecycle as GameLifecycle,
      targetLifecycle: target,
      commandId: crypto.randomUUID(),
    });
    if (!r.ok) {
      if (isStaleLifecycleError(r.error)) {
        const fresh = await loadOverview();
        if (fresh?.ok) setNotice(r.error.userMessage);
      } else setError(r.error.userMessage);
      setCommandPending(false);
      return;
    }
    await loadOverview();
    setNotice("Lifecycle aggiornato.");
    setCommandPending(false);
  }
  async function handlePhase(target: NarrativePhase) {
    if (!overview || !gameCode || phaseCommandPending) return;
    setPhaseCommandPending(true);
    setError(null);
    const r = await transitionGameNarrativePhase({
      gameCode,
      expectedPhase: overview.narrative_phase as NarrativePhase,
      targetPhase: target,
      commandId: crypto.randomUUID(),
    });
    if (!r.ok) {
      if (isStaleNarrativePhaseError(r.error)) {
        const fresh = await loadOverview();
        if (fresh?.ok) setNotice(r.error.userMessage);
      } else setError(r.error.userMessage);
      setPhaseCommandPending(false);
      return;
    }
    await loadOverview();
    setNotice("Fase narrativa aggiornata.");
    setPhaseCommandPending(false);
  }
  async function handleAssignRoles() {
    if (!gameCode || roleCommandPending) return;
    setRoleCommandPending(true);
    setError(null);
    const r = await assignGameRoles(gameCode);
    await Promise.all([loadOverview(), loadRoles()]);
    if (r.ok) setNotice("Ruoli assegnati.");
    else setError(r.error.userMessage);
    setRoleCommandPending(false);
  }
  const allowed = overview
    ? getAllowedLifecycleTransitions(overview.lifecycle as GameLifecycle)
    : [];
  const narrativeAllowed = overview
    ? getAllowedNarrativePhaseTransitions(
        overview.narrative_phase as NarrativePhase,
      )
    : [];
  const nextPhase = narrativeAllowed[0];
  const rolesAssigned = Boolean(
    overview &&
    (overview.player_count === 0 ||
      (roles &&
        roster &&
        overview.player_count >= 3 &&
        roles.length === overview.player_count &&
        roles.length === roster.length)),
  );
  const acknowledgedCount = roles?.filter((role) => role.role_acknowledged).length ?? 0;
  const acknowledgementsComplete = Boolean(rolesAssigned && roles && acknowledgedCount === roles.length);
  const canAssign =
    overview?.lifecycle === "live" &&
    overview.narrative_phase === "lobby" &&
    !rolesAssigned;
  return (
    <PageShell eyebrow="Control Room · game context" title="Regia">
      <div className="max-w-2xl">
        <Link
          className="text-sm text-primary underline-offset-4"
          to="/admin/games"
        >
          ← Torna alle partite
        </Link>
        <p className="mt-8 text-sm uppercase tracking-[0.16em] text-muted">
          Game selezionato
        </p>
        <p className="mt-2 font-mono text-3xl font-semibold text-primary">
          {gameCode}
        </p>
        <div className="mt-8" aria-live="polite">
          {!overview && !error && (
            <p role="status" className="text-muted">
              Caricamento overview…
            </p>
          )}
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-success">
              {notice}
            </p>
          )}
          {commandPending && (
            <p role="status" className="mt-4 text-sm text-muted">
              Aggiornamento lifecycle in corso…
            </p>
          )}
          {phaseCommandPending && (
            <p role="status" className="mt-4 text-sm text-muted">
              Aggiornamento fase narrativa in corso…
            </p>
          )}
          {overview && (
            <>
              <p className="text-xl font-semibold text-text">
                {overview.event_name}
              </p>
              {overview.scenario_title && (
                <p className="mt-2 text-sm text-muted">
                  Scenario: <span className="font-semibold text-text">{overview.scenario_title}</span> · Versione {overview.scenario_version_number}
                </p>
              )}
              {overview.narrative_phase === "briefing" && overview.briefing_title && (
                <section className="mt-6 border border-border p-4" aria-labelledby="staff-briefing-title">
                  <p className="text-sm uppercase tracking-[0.16em] text-muted">Briefing</p>
                  <h2 id="staff-briefing-title" className="mt-2 text-2xl font-semibold text-primary">{overview.briefing_title}</h2>
                  <p className="mt-4 whitespace-pre-wrap leading-7">{overview.briefing_body}</p>
                </section>
              )}
              {overview.narrative_phase === "discovery" && overview.discovery_title && (
                <section className="mt-6 border border-border p-4" aria-labelledby="staff-discovery-title">
                  <p className="text-sm uppercase tracking-[0.16em] text-muted">Scoperta</p>
                  <h2 id="staff-discovery-title" className="mt-2 text-2xl font-semibold text-primary">{overview.discovery_title}</h2>
                  <p className="mt-4 whitespace-pre-wrap leading-7">{overview.discovery_body}</p>
                </section>
              )}
              {overview.narrative_phase === "discovery" && (
                <section className="mt-6 border border-border p-4" aria-labelledby="staff-clues-title">
                  <p className="text-sm uppercase tracking-[0.16em] text-muted">Frammenti dei tavoli</p>
                  <h2 id="staff-clues-title" className="sr-only">Frammenti dei tavoli</h2>
                  <div className="mt-4 grid gap-4">
                    {Array.from({ length: 5 }, (_, index) => {
                      const clue = clues?.find((item) => item.table_number === index + 1);
                      return <article key={index + 1} className="border-t border-border pt-3 first:border-t-0 first:pt-0"><h3 className="font-semibold">Tavolo {index + 1}</h3>{clue ? <><p className="mt-1 font-semibold text-primary">{clue.title}</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{clue.body}</p></> : <p className="mt-1 text-sm text-muted">Nessun frammento disponibile.</p>}</article>;
                    })}
                  </div>
                </section>
              )}
              {overview.narrative_phase === "comparison" && overview.comparison_title && (
                <section className="mt-6 border border-border p-4" aria-labelledby="staff-comparison-title">
                  <p className="text-sm uppercase tracking-[0.16em] text-muted">Confronto</p>
                  <h2 id="staff-comparison-title" className="mt-2 text-2xl font-semibold text-primary">{overview.comparison_title}</h2>
                  <p className="mt-4 whitespace-pre-wrap leading-7">{overview.comparison_body}</p>
                  <div className="mt-6 grid gap-4">
                    {(comparisons ?? []).map((route) => <article key={route.source_table_number} className="border-t border-border pt-3 first:border-t-0 first:pt-0"><h3 className="font-semibold">Tavolo {route.source_table_number} → Tavolo {route.target_table_number}</h3><p className="mt-1 text-sm leading-6">{route.instruction}</p></article>)}
                  </div>
                </section>
              )}
              {overview.narrative_phase === "pressure" && overview.pressure_title && (
                <section className="mt-6 border border-border p-4" aria-labelledby="staff-pressure-title">
                  <p className="text-sm uppercase tracking-[0.16em] text-muted">Pressione</p>
                  <h2 id="staff-pressure-title" className="mt-2 text-2xl font-semibold text-primary">{overview.pressure_title}</h2>
                  <p className="mt-4 whitespace-pre-wrap leading-7">{overview.pressure_body}</p>
                  <div className="mt-6 grid gap-4">
                    {(pressureRoutes ?? []).map((route) => <article key={route.source_table_number} className="border-t border-border pt-3 first:border-t-0 first:pt-0"><h3 className="font-semibold">Tavolo {route.source_table_number} → Tavolo {route.target_table_number}</h3><p className="mt-1 font-semibold text-primary">{route.title}</p><p className="mt-1 text-sm leading-6">{route.instruction}</p></article>)}
                  </div>
                </section>
              )}
              <dl className="mt-6 grid gap-5 border-t border-border pt-6 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-muted">Lifecycle</dt>
                  <dd className="mt-1 font-semibold">{overview.lifecycle}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted">Narrative phase</dt>
                  <dd className="mt-1 font-semibold">
                    {narrativePhaseLabels[
                      overview.narrative_phase as NarrativePhase
                    ] ?? overview.narrative_phase}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted">Partecipanti</dt>
                  <dd className="mt-1 text-2xl font-semibold text-primary">
                    {overview.player_count}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted">Tavoli</dt>
                  <dd className="mt-1 text-2xl font-semibold text-primary">
                    {overview.table_count}
                  </dd>
                </div>
              </dl>
              <section
                className="mt-10 border-t border-border pt-6"
                aria-labelledby="roster-title"
              >
                <h2
                  id="roster-title"
                  className="text-sm font-semibold uppercase tracking-[0.16em] text-muted"
                >
                  Partecipanti
                </h2>
                {roster ? (
                  <>
                    <p className="mt-2 text-sm text-muted">
                      {roster.length} / {overview.table_count * seatsPerTable}{" "}
                      posti occupati
                    </p>
                    <div className="mt-5 grid gap-5">
                      {Array.from({ length: overview.table_count }, (_, ti) => (
                        <section key={ti + 1}>
                          <h3 className="font-semibold">Tavolo {ti + 1}</h3>
                          <ol className="mt-2 grid gap-2">
                            {Array.from({ length: seatsPerTable }, (_, si) => {
                              const player = roster.find(
                                (p) =>
                                  p.table_number === ti + 1 &&
                                  p.seat_number === si + 1,
                              );
                              return (
                                <li
                                  key={si + 1}
                                  className="flex items-center justify-between border border-border px-3 py-2 text-sm"
                                >
                                  <span>Posto {si + 1}</span>
                                  <span
                                    className={
                                      player
                                        ? "font-semibold text-text"
                                        : "text-muted"
                                    }
                                  >
                                    {player?.nickname ?? "Posto vuoto"}
                                  </span>
                                </li>
                              );
                            })}
                          </ol>
                        </section>
                      ))}
                    </div>
                  </>
                ) : (
                  <p role="status" className="mt-4 text-sm text-muted">
                    Caricamento partecipanti…
                  </p>
                )}
              </section>
              {canAssign && (
                <section
                  className="mt-10 border-t border-border pt-6"
                  aria-labelledby="roles-control-title"
                >
                  <h2
                    id="roles-control-title"
                    className="text-sm font-semibold uppercase tracking-[0.16em] text-muted"
                  >
                    Ruoli
                  </h2>
                  <p className="mt-2 text-sm text-muted">
                    {overview.player_count < 3
                      ? "Servono almeno 3 partecipanti."
                      : "Congela il roster assegnando i ruoli."}
                  </p>
                  <button
                    className="action mt-5"
                    type="button"
                    disabled={
                      roleCommandPending ||
                      overview.player_count < 3 ||
                      roles === null
                    }
                    onClick={() => void handleAssignRoles()}
                  >
                    {roleCommandPending
                      ? "Assegnazione in corso…"
                      : "Assegna ruoli"}
                  </button>
                </section>
              )}
              {rolesAssigned && (
                <section
                  className="mt-10 border-t border-border pt-6"
                  aria-labelledby="assigned-roles-title"
                >
                  <h2
                    id="assigned-roles-title"
                    className="text-sm font-semibold uppercase tracking-[0.16em] text-muted"
                  >
                    Ruoli assegnati
                  </h2>
                  <ul className="mt-4 grid gap-2">
                    {roles?.map((p) => (
                      <li
                        key={p.player_id}
                        className="flex items-center justify-between border border-border px-3 py-2 text-sm"
                      >
                        <span className="font-semibold">{p.nickname}</span>
                        <span className="text-right">{roleLabels[p.role]} · Tavolo {p.table_number}, posto {p.seat_number}<br /><span className={p.role_acknowledged ? "text-success" : "text-muted"}>{p.role_acknowledged ? "Confermato" : "In attesa"}</span></span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <section
                className="mt-10 border-t border-border pt-6"
                aria-labelledby="lifecycle-control-title"
              >
                <h2
                  id="lifecycle-control-title"
                  className="text-sm font-semibold uppercase tracking-[0.16em] text-muted"
                >
                  Controllo lifecycle
                </h2>
                <p className="mt-2 text-sm text-muted">
                  Stato attuale:{" "}
                  <span className="font-semibold text-text">
                    {overview.lifecycle}
                  </span>
                </p>
                {allowed.length ? (
                  <div className="mt-5 flex flex-wrap gap-3">
                    {allowed.map((target) => (
                      <button
                        key={target}
                        className="action"
                        type="button"
                        disabled={commandPending}
                        onClick={() => void handleTransition(target)}
                      >
                        {commandPending
                          ? "Operazione in corso…"
                          : lifecycleActionLabel(
                              overview.lifecycle as GameLifecycle,
                              target,
                            )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-5 text-sm text-muted">
                    Nessuna transizione disponibile.
                  </p>
                )}
                {overview.lifecycle !== "live" && allowed.length > 0 && (
                  <p className="mt-3 text-sm text-muted">
                    Disponibile solo con lifecycle live.
                  </p>
                )}
              </section>
              <section
                className="mt-10 border-t border-border pt-6"
                aria-labelledby="narrative-phase-control-title"
              >
                <h2
                  id="narrative-phase-control-title"
                  className="text-sm font-semibold uppercase tracking-[0.16em] text-muted"
                >
                  Fase narrativa
                </h2>
                <p className="mt-4 text-sm text-muted">
                  Fase corrente:{" "}
                  <span className="font-semibold text-text">
                    {narrativePhaseLabels[
                      overview.narrative_phase as NarrativePhase
                    ] ?? overview.narrative_phase}
                  </span>
                </p>
                {rolesAssigned && <p className="mt-2 text-sm text-muted">Ruoli confermati: {acknowledgedCount} / {roles?.length ?? 0}</p>}
                {nextPhase ? (
                  <>
                    <button
                      className={`action mt-5 ${
                        nextPhase === "role_reveal" && !rolesAssigned
                          ? "cursor-not-allowed opacity-50"
                          : ""
                      }`}
                      type="button"
                      disabled={
                        phaseCommandPending ||
                        overview.lifecycle !== "live" ||
                        (nextPhase === "role_reveal" && !rolesAssigned) ||
                        (nextPhase === "briefing" && !acknowledgementsComplete)
                      }
                      onClick={() => void handlePhase(nextPhase)}
                    >
                      {phaseCommandPending
                        ? "Operazione in corso…"
                        : narrativePhaseActionLabels[
                            overview.narrative_phase as NarrativePhase
                          ]}
                    </button>
                    {nextPhase === "role_reveal" && !rolesAssigned && (
                      <p className="mt-3 text-sm text-muted">
                        Assegna i ruoli prima di avanzare.
                      </p>
                    )}
                    {nextPhase === "briefing" && !acknowledgementsComplete && (
                      <p className="mt-3 text-sm text-muted">Attendi la conferma di tutti i Player.</p>
                    )}
                  </>
                ) : (
                  <p className="mt-5 text-sm text-muted">
                    Nessuna fase narrativa successiva.
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
