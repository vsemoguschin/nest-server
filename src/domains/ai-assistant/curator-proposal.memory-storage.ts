import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
      priority: payload.priority ?? undefined,
      status: 'draft',
      reviewNote: null,
      reviewedAt: null,
      reviewedBy: null,
      createdAt: new Date().toISOString(),
      createdBy: payload.createdBy,
      sourceAnalysisId: payload.sourceAnalysisId ?? null,
      sourceLearningRunId: payload.sourceLearningRunId ?? null,
      sourceFindingId: payload.sourceFindingId ?? null,
      applyStatus: 'not_applied',
      applySummary: null,
      appliedAt: null,
      appliedBy: null,
      applyTargetPath: null,
      applyStrategy: null,
      metadataUpdated: false,
      metadataCreated: false,
      applyValidationErrors: [],
    };

    this.records.set(record.id, record);
    return record;
  }

  async list(filters?: {
    conversationId?: string;
    status?: CuratorProposalRecord['status'];
  }): Promise<CuratorProposalRecord[]> {
    let items = [...this.records.values()].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    );

    if (filters?.conversationId) {
      items = items.filter(
        (item) => item.conversationId === filters.conversationId,
      );
    }

    if (filters?.status) {
      items = items.filter((item) => item.status === filters.status);
    }

    return items;
  }

  async getById(id: string): Promise<CuratorProposalRecord | null> {
    return this.records.get(id) ?? null;
  }

  async review(
    id: string,
    payload: {
      status: 'approved' | 'rejected';
      reviewNote?: string | null;
      reviewedBy: { id: string | number | null; fullName: string | null };
    },
  ): Promise<CuratorProposalRecord> {
    const existing = this.records.get(id);
    if (!existing) {
      throw new NotFoundException({
        message: 'Curator proposal draft not found',
        proposalId: id,
      });
    }

    if (existing.status === 'approved' || existing.status === 'rejected') {
      throw new ConflictException({
        message: 'Curator proposal draft is already reviewed',
        proposalId: id,
        status: existing.status,
      });
    }

    const reviewedRecord: CuratorProposalRecord = {
      ...existing,
      status: payload.status,
      reviewNote: payload.reviewNote?.trim() || null,
      reviewedAt: new Date().toISOString(),
      reviewedBy: payload.reviewedBy,
    };

    this.records.set(id, reviewedRecord);
    return reviewedRecord;
  }

  async recordApplyResult(
    id: string,
    payload: {
      applyStatus: CuratorProposalRecord['applyStatus'];
      applySummary: string | null;
      appliedBy: { id: string | number | null; fullName: string | null };
      appliedAt: string;
      applyTargetPath: string | null;
      applyStrategy: string | null;
      metadataUpdated: boolean;
      metadataCreated: boolean;
      applyValidationErrors: string[];
    },
  ): Promise<CuratorProposalRecord> {
    const existing = this.records.get(id);
    if (!existing) {
      throw new NotFoundException({
        message: 'Curator proposal draft not found',
        proposalId: id,
      });
    }

    const updatedRecord: CuratorProposalRecord = {
      ...existing,
      applyStatus: payload.applyStatus,
      applySummary: payload.applySummary,
      appliedAt: payload.appliedAt,
      appliedBy: payload.appliedBy,
      applyTargetPath: payload.applyTargetPath,
      applyStrategy: payload.applyStrategy,
      metadataUpdated: payload.metadataUpdated,
      metadataCreated: payload.metadataCreated,
      applyValidationErrors: payload.applyValidationErrors,
    };

    this.records.set(id, updatedRecord);
    return updatedRecord;
  }
}
