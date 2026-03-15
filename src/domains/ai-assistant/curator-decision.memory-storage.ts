import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CuratorDecisionStorage } from './curator-decision.storage';
import { CuratorDecisionRecord } from './dto/curator-decision.dto';

@Injectable()
export class CuratorDecisionMemoryStorage implements CuratorDecisionStorage {
  private readonly records = new Map<string, CuratorDecisionRecord>();

  async create(payload: {
    sessionId: string;
    conversationId: string;
    decisionType: CuratorDecisionRecord['decisionType'];
    targetDraftKey: string | null;
    reason: string;
    createdProposalId: string | null;
    createdBy: { id: string | number | null; fullName: string | null };
  }): Promise<CuratorDecisionRecord> {
    const record: CuratorDecisionRecord = {
      id: randomUUID(),
      sessionId: payload.sessionId,
      conversationId: payload.conversationId,
      decisionType: payload.decisionType,
      targetDraftKey: payload.targetDraftKey,
      reason: payload.reason,
      createdBy: payload.createdBy,
      createdAt: new Date().toISOString(),
      createdProposalId: payload.createdProposalId,
    };

    this.records.set(record.id, record);
    return record;
  }

  async listBySession(sessionId: string): Promise<CuratorDecisionRecord[]> {
    return [...this.records.values()]
      .filter((record) => record.sessionId === sessionId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
}
