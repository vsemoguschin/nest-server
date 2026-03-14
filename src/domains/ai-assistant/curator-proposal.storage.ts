import {
  CuratorProposalCreateDto,
  CuratorProposalRecord,
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
  }): Promise<CuratorProposalRecord[]>;
}
