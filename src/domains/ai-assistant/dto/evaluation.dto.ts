export type EvaluationRunRequestRecord = {
  scenarioIds?: string[];
};

export type EvaluationScenarioResultRecord = {
  scenarioId: string;
  description: string;
  assistantResponse: string;
  detectedSignals: string[];
  status: 'PASS' | 'WARN' | 'FAIL';
  notes: string[];
};

export type EvaluationReportRecord = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  workspace: 'assistant-dev';
  scenarioCount: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  scenarioResults: EvaluationScenarioResultRecord[];
};
