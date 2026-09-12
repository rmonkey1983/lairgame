import type { BrainControlLevel } from './brain.types'

export type CoreLaw =
  | 'PEOPLE_ARE_THE_GAME'
  | 'TRUST_BEFORE_DOUBT'
  | 'NO_FORCED_EXPOSURE'
  | 'NO_ACTING_REQUIRED'
  | 'SOCIAL_MISSIONS_FIRST'
  | 'PHONE_DOWN'
  | 'DINNER_REMAINS_DINNER'
  | 'INFORMATION_MUST_BE_RESOLVABLE'
  | 'NO_ONE_KNOWS_EVERYTHING'
  | 'MEANINGFUL_DECISIONS'
  | 'REVEAL_MUST_EXPLAIN'
  | 'SOCIAL_SAFETY'
  | 'MINIMUM_PERSONAL_DATA'
  | 'ACTION_HAS_CONSEQUENCE'
  | 'IMMUTABLE_TRUTH'

export type CoreLawRule = {
  id: CoreLaw
  enabled: true
  description: string
}

export type CoreLawSet = readonly CoreLawRule[]

const descriptions: Record<CoreLaw, string> = {
  PEOPLE_ARE_THE_GAME: 'Le persone e le loro interazioni sono il centro dell’esperienza.',
  TRUST_BEFORE_DOUBT: 'La fiducia precede il dubbio.',
  NO_FORCED_EXPOSURE: 'Nessuna dinamica forza un’esposizione non compatibile con il profilo.',
  NO_ACTING_REQUIRED: 'Nessuna azione richiede recitazione o performance.',
  SOCIAL_MISSIONS_FIRST: 'Le missioni servono prima di tutto una dinamica sociale.',
  PHONE_DOWN: 'La tecnologia rimanda all’interazione dal vivo.',
  DINNER_REMAINS_DINNER: 'La cena resta un contesto naturale, non una schermata di gioco continua.',
  INFORMATION_MUST_BE_RESOLVABLE: 'Le informazioni devono poter essere ricomposte dai giocatori.',
  NO_ONE_KNOWS_EVERYTHING: 'Nessun partecipante riceve una visione totale non prevista.',
  MEANINGFUL_DECISIONS: 'Le scelte devono poter cambiare una teoria o una relazione.',
  REVEAL_MUST_EXPLAIN: 'La rivelazione deve spiegare il percorso svolto.',
  SOCIAL_SAFETY: 'La dinamica non deve richiedere rivelazioni personali o umilianti.',
  MINIMUM_PERSONAL_DATA: 'Il Brain usa solo i dati funzionali al gioco.',
  ACTION_HAS_CONSEQUENCE: 'Un’azione suggerita deve avere una conseguenza nel gioco.',
  IMMUTABLE_TRUTH: 'La verità dello scenario è separata e immutabile.',
}

export const CORE_LAWS: CoreLawSet = (Object.keys(descriptions) as CoreLaw[]).map((id) => ({
  id,
  enabled: true,
  description: descriptions[id],
}))

export const DEFAULT_BRAIN_CONTROL: BrainControlLevel = 'SUGGEST'

export function isCoreLawEnabled(laws: CoreLawSet, law: CoreLaw): boolean {
  return laws.some((rule) => rule.id === law && rule.enabled)
}

