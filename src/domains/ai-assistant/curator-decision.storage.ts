import { CuratorDecisionRecord, CuratorDecisionType } from './dto/curator-decision.dto';

export const CURATOR_DECISION_STORAGE = 'CURATOR_DECISION_STORAGE';

export interface CuratorDecisionStorage {
  create(payload: {
    sessionId: string;
    conversationId: string;
    decisionType: CuratorDecisionType;
    targetDraftKey: string | null;
    reason: string;
    createdProposalId: string | null;
    createdBy: { id: string | number | null; fullName: string | null };
  }): Promise<CuratorDecisionRecord>;
  listBySession(sessionId: string): Promise<CuratorDecisionRecord[]>;
  findCreateDraftDecision(
    sessionId: string,
    targetDraftKey: string | null,
  ): Promise<CuratorDecisionRecord | null>;
}
