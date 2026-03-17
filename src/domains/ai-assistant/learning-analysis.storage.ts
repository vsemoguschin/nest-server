import { LearningRunReportRecord } from './dto/learning-analysis.dto';

export const LEARNING_ANALYSIS_STORAGE = Symbol('LEARNING_ANALYSIS_STORAGE');

export interface LearningAnalysisStorage {
  save(report: LearningRunReportRecord): Promise<LearningRunReportRecord>;
  getById(runId: string): Promise<LearningRunReportRecord | null>;
}
