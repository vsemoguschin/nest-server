import { Injectable } from '@nestjs/common';
import {
  LearningAnalysisStorage,
} from './learning-analysis.storage';
import { LearningRunReportRecord } from './dto/learning-analysis.dto';

@Injectable()
export class LearningAnalysisMemoryStorage implements LearningAnalysisStorage {
  private readonly reports = new Map<string, LearningRunReportRecord>();

  async save(
    report: LearningRunReportRecord,
  ): Promise<LearningRunReportRecord> {
    this.reports.set(report.runId, report);
    return report;
  }

  async getById(runId: string): Promise<LearningRunReportRecord | null> {
    return this.reports.get(runId) ?? null;
  }
}
