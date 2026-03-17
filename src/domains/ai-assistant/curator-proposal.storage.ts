import {
  CuratorProposalCreateDto,
  CuratorProposalRecord,
  CuratorProposalStatus,
} from './dto/curator-proposal.dto';

export const CURATOR_PROPOSAL_STORAGE = 'CURATOR_PROPOSAL_STORAGE';

export interface CuratorProposalStorage {
  create(
    payload: CuratorProposalCreateDto & {
      createdBy: { id: string | number | null; fullName: string | null };
    },
  ): Promise<CuratorProposalRecord>;
  list(filters?: {
    conversationId?: string;
    status?: CuratorProposalStatus;
  }): Promise<CuratorProposalRecord[]>;
  getById(id: string): Promise<CuratorProposalRecord | null>;
  review(
    id: string,
    payload: {
      status: Extract<CuratorProposalStatus, 'approved' | 'rejected'>;
      reviewNote?: string | null;
      reviewedBy: { id: string | number | null; fullName: string | null };
    },
  ): Promise<CuratorProposalRecord>;
  recordApplyResult(
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
  ): Promise<CuratorProposalRecord>;
}
