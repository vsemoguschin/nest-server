import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CuratorSourceReferenceDto } from './curator-analyze.dto';
import {
  CURATOR_ARTIFACT_TYPES,
  CURATOR_CHANGE_TYPES,
  CuratorArtifactType,
  CuratorChangeType,
  CuratorProposalRecord,
} from './curator-proposal.dto';

export const CURATOR_DECISION_TYPES = [
  'CREATE_DRAFT',
  'PRIORITIZE_DRAFT',
  'REJECT_DRAFT',
  'DUPLICATE_DRAFT',
  'NEEDS_MORE_EVIDENCE',
] as const;

export type CuratorDecisionType = (typeof CURATOR_DECISION_TYPES)[number];

export class CuratorDecisionDraftPayloadDto {
  @IsString()
  @IsIn(['assistant-dev'])
  targetWorkspace!: 'assistant-dev';

  @IsString()
  @IsIn(CURATOR_ARTIFACT_TYPES)
  artifactType!: CuratorArtifactType;

  @IsOptional()
  @IsString()
  targetKey?: string;

  @IsOptional()
  @IsString()
  targetPath?: string;

  @IsString()
  @IsIn(CURATOR_CHANGE_TYPES)
  changeType!: CuratorChangeType;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsString()
  @IsNotEmpty()
  proposedContent!: string;
}

export class CuratorDecisionCreateDto {
  @IsString()
  @IsIn(CURATOR_DECISION_TYPES)
  decisionType!: CuratorDecisionType;

  @IsOptional()
  @IsString()
  targetDraftKey?: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CuratorDecisionDraftPayloadDto)
  proposalDraft?: CuratorDecisionDraftPayloadDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CuratorSourceReferenceDto)
  sourceReference?: CuratorSourceReferenceDto;

  @IsOptional()
  @IsString()
  sourceAnalysisId?: string;
}

export type CuratorDecisionRecord = {
  id: string;
  sessionId: string;
  conversationId: string;
  decisionType: CuratorDecisionType;
  targetDraftKey: string | null;
  reason: string;
  createdBy: {
    id: string | number | null;
    fullName: string | null;
  };
  createdAt: string;
  createdProposalId: string | null;
};

export type CuratorDecisionExecutionResponse = {
  decision: CuratorDecisionRecord;
  createdProposal: CuratorProposalRecord | null;
};
