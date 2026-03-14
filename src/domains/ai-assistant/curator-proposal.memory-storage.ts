import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CuratorProposalStorage } from './curator-proposal.storage';
import {
  CuratorProposalCreateDto,
  CuratorProposalRecord,
} from './dto/curator-proposal.dto';

@Injectable()
export class CuratorProposalMemoryStorage implements CuratorProposalStorage {
  private readonly records = new Map<string, CuratorProposalRecord>();

  async create(
    payload: CuratorProposalCreateDto & {
      createdBy: { id: string | number | null; fullName: string | null };
    },
  ): Promise<CuratorProposalRecord> {
    const record: CuratorProposalRecord = {
      id: randomUUID(),
      conversationId: payload.conversationId,
      sourceReference: payload.sourceReference ?? null,
      targetWorkspace: 'assistant-dev',
      artifactType: payload.artifactType,
      targetKey: payload.targetKey ?? null,
      targetPath: payload.targetPath ?? null,
      changeType: payload.changeType,
      reason: payload.reason,
      proposedContent: payload.proposedContent,
      status: 'draft',
      createdAt: new Date().toISOString(),
      createdBy: payload.createdBy,
      sourceAnalysisId: payload.sourceAnalysisId ?? null,
    };

    this.records.set(record.id, record);
    return record;
  }

  async list(filters?: {
    conversationId?: string;
  }): Promise<CuratorProposalRecord[]> {
    const items = [...this.records.values()].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    );

    if (!filters?.conversationId) {
      return items;
    }

    return items.filter(
      (item) => item.conversationId === filters.conversationId,
    );
  }
}
