export type ScenarioStatus = 'draft' | 'published' | 'retired'
export type ScenarioVersion = { id: string; scenarioId: string; status: ScenarioStatus }
