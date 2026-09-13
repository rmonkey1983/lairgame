export type GamePhase =
  | 'LOBBY'
  | 'SOCIAL_WARMUP'
  | 'ROLE_REVEAL'
  | 'TRUST'
  | 'INVESTIGATION'
  | 'DOUBT'
  | 'FINAL_THEORY'
  | 'VOTING'
  | 'LOCKED'
  | 'REVEAL'
  | 'RESULTS'

export type SocialStyle = 'observer' | 'balanced' | 'expressive'
export type ExposureLevel = 'low' | 'medium' | 'high'
export type ParticipationLevel = 'low' | 'medium' | 'high'
export type StrategyPreference = 'social' | 'analytical' | 'mixed'
export type ProfileValueSource = 'derived' | 'defaulted'

export type PlayerProfileSources = {
  socialStyle: ProfileValueSource
  exposureLevel: ProfileValueSource
  participationLevel: ProfileValueSource
  strategyPreference: ProfileValueSource
}

export type PlayerGameProfile = {
  playerId: string
  socialStyle: SocialStyle
  exposureLevel: ExposureLevel
  participationLevel: ParticipationLevel
  arrivedWithPlayerIds: string[]
  strategyPreference: StrategyPreference
  sources: PlayerProfileSources
}

export type BrainPlayer = PlayerGameProfile & {
  nickname?: string
  tableId?: string
  activityCount?: number
}

export type BrainTable = {
  tableId: string
  tableNumber?: number
  playerIds: string[]
}

export type SocialEdgeType =
  | 'TRUST'
  | 'SUSPICION'
  | 'ALLIANCE'
  | 'INFORMATION_SHARE'
  | 'INFLUENCE'
  | 'BETRAYAL'

export type SocialEdge = {
  sourcePlayerId: string
  targetPlayerId: string
  type: SocialEdgeType
  phase: GamePhase
  strength?: number
  active: boolean
}

export type MissionType =
  | 'OBSERVE_PLAYER'
  | 'VERIFY_STATEMENT'
  | 'GAIN_TRUST'
  | 'SHARE_INFORMATION'
  | 'WITHHOLD_INFORMATION'
  | 'QUESTION_PLAYER'
  | 'PROTECT_PLAYER'
  | 'INFLUENCE_PLAYER'
  | 'FORM_ALLIANCE'
  | 'CHANGE_THEORY'

export type MissionTemplate = {
  type: MissionType
  allowedPhases: GamePhase[]
  compatibleProfiles: SocialStyle[]
  exposureLevel: ExposureLevel
  requiresTarget: boolean
  requiresPublicExposure?: boolean
}

export type Mission = MissionTemplate & {
  id: string
  assignedPlayerId: string
  targetPlayerId?: string
}

export type Information = {
  id: string
  sourcePlayerId?: string
  phase: GamePhase
  resolved: boolean
}

export type ScenarioFact = { id: string; statement: string }
export type ScenarioLie = { id: string; statement: string }

export type ScenarioTruth = {
  liarPlayerId: string
  accomplicePlayerId?: string
  scapegoatPlayerId?: string
  facts: ScenarioFact[]
  lies: ScenarioLie[]
}

export type BrainMetrics = {
  liarExposure: number | null
  roleExposure: {
    liar: number | null
    accomplice: number | null
    scapegoat: number | null
  }
  theoryDiversity: number | null
  participationBalance: number | null
  trustCoverage: number | null
  trustConcentration: number | null
  suspicionCoverage: number | null
  theoryShiftRate: number | null
  averageTheoryChanges: number | null
  liarConfidence: number | null
  playerActivity: PlayerActivityMetric[]
  tableMetrics: TableBrainMetrics[]
}

export type PlayerActivityMetric = {
  playerId: string
  eventCount: number
  normalizedActivity: number
}

export type TableBrainMetrics = {
  tableId: string
  suspicionCoverage: number | null
  theoryDiversity: number | null
  participationBalance: number | null
}

export type BrainState = {
  sessionId: string
  phase: GamePhase
  players: BrainPlayer[]
  tables: BrainTable[]
  socialEdges: SocialEdge[]
  activeMissions: Mission[]
  revealedInformation: Information[]
  metrics: BrainMetrics
}

export type BrainActionType =
  | 'ASSIGN_SOCIAL_MISSION'
  | 'REQUEST_TRUST_SELECTION'
  | 'REQUEST_SUSPICION'
  | 'SUGGEST_DOUBT_EVENT'
  | 'SUGGEST_INFORMATION_EVENT'
  | 'SUGGEST_MC_ACTION'

export type BrainControlLevel = 'AUTO' | 'SUGGEST' | 'MANUAL'

export type BrainAction = {
  type: BrainActionType | string
  playerId?: string
  targetPlayerId?: string
  mission?: MissionTemplate
  publicExposure?: boolean
  requiresActing?: boolean
  requiresPersonalDisclosure?: boolean
  requiresPhone?: boolean
  informationResolvable?: boolean
  givesCompleteScenarioKnowledge?: boolean
  meaningfulConsequence?: boolean
  changesScenarioTruth?: boolean
}

export type BrainDecisionType =
  | 'NO_ACTION'
  | 'LOW_ENGAGEMENT'
  | 'HIGH_LIAR_EXPOSURE'
  | 'LOW_LIAR_EXPOSURE'
  | 'THEORY_COLLAPSE'
  | 'TRUST_OPPORTUNITY'
  | 'INACTIVE_PLAYER'
  | 'TABLE_IMBALANCE'

export type BrainDecisionSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH'
export type BrainDecisionScope =
  | { type: 'SESSION' }
  | { type: 'TABLE'; tableId: string }
  | { type: 'PLAYER'; playerId: string }

export type BrainDecisionEvidence = {
  phase: GamePhase
  metrics: Partial<Pick<BrainMetrics, 'liarExposure' | 'suspicionCoverage' | 'theoryDiversity' | 'participationBalance' | 'trustCoverage' | 'trustConcentration' | 'theoryShiftRate' | 'averageTheoryChanges' | 'liarConfidence'>>
  thresholds?: Partial<Record<DecisionThresholdKey, number>>
  mostSuspectedPlayerId?: string
  playerActivity?: PlayerActivityMetric[]
  tableMetrics?: TableBrainMetrics
}

export type BrainRecommendationType = 'REDUCE_DIRECT_PRESSURE' | 'INCREASE_THEORY_DIVERSITY' | 'INVITE_BROADER_PARTICIPATION' | 'CREATE_TRUST_OPPORTUNITY'
export type BrainRecommendation = { type: BrainRecommendationType }

export type BrainDecision = {
  type: BrainDecisionType
  mode: 'SUGGEST'
  severity: BrainDecisionSeverity
  scope: BrainDecisionScope
  evidence: BrainDecisionEvidence
  recommendation?: BrainRecommendation
  priority: 'low' | 'medium' | 'high'
  reason: string
  playerId?: string
  tableId?: string
  recommendedAction?: BrainActionType
  requiresMcApproval: boolean
}

export type DecisionThresholdKey =
  | 'minimumSuspicionCoverage'
  | 'highLiarExposure'
  | 'lowLiarExposure'
  | 'theoryCollapse'
  | 'minimumTrustCoverage'
  | 'highTrustConcentration'
  | 'lowParticipationBalance'
  | 'inactivePlayerActivity'
  | 'minimumEvidencePlayers'

export type BrainInput = {
  sessionId: string
  phase: GamePhase
  players: BrainPlayer[]
  tables: BrainTable[]
  socialEdges?: SocialEdge[]
  activeMissions?: Mission[]
  revealedInformation?: Information[]
}

export type BrainEvaluation = {
  state: BrainState
  decisions: BrainDecision[]
}
