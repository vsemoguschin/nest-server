import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CuratorSourceReferenceDto } from './curator-analyze.dto';

export const CURATOR_ARTIFACT_TYPES = [
  'instruction',
  'script',
  'faq',
  'pricing',
  'rule',
  'template',
] as const;

export const CURATOR_CHANGE_TYPES = [
  'add',
  'update',
  'clarify',
  'remove',
] as const;

export const CURATOR_PROPOSAL_STATUSES = [
  'draft',
  'ready_for_review',
  'approved',
  'rejected',
] as const;

export type CuratorArtifactType = (typeof CURATOR_ARTIFACT_TYPES)[number];
export type CuratorChangeType = (typeof CURATOR_CHANGE_TYPES)[number];
export type CuratorProposalStatus = (typeof CURATOR_PROPOSAL_STATUSES)[number];

export class CuratorProposalCreateDto {
  @IsString()
  @IsNotEmpty()
  conversationId!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CuratorSourceReferenceDto)
  sourceReference?: CuratorSourceReferenceDto;

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

  @IsOptional()
  @IsString()
  @IsIn(['primary', 'secondary'])
  priority?: 'primary' | 'secondary';

  @IsOptional()
  @IsString()
  sourceAnalysisId?: string;

  @IsOptional()
  @IsString()
  sourceLearningRunId?: string;

  @IsOptional()
  @IsString()
  sourceFindingId?: string;
}

export type CuratorProposalRecord = {
  id: string;
  conversationId: string;
  sourceReference: CuratorSourceReferenceDto | null;
  targetWorkspace: 'assistant-dev';
  artifactType: CuratorArtifactType;
  targetKey: string | null;
  targetPath: string | null;
  changeType: CuratorChangeType;
  reason: string;
  proposedContent: string;
  priority?: 'primary' | 'secondary';
  status: CuratorProposalStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedBy: {
    id: string | number | null;
    fullName: string | null;
  } | null;
  createdAt: string;
  createdBy: {
    id: string | number | null;
    fullName: string | null;
  };
  sourceAnalysisId: string | null;
  sourceLearningRunId: string | null;
  sourceFindingId: string | null;
  applyStatus: 'not_applied' | 'applied' | 'failed' | 'unsupported';
  applySummary: string | null;
  appliedAt: string | null;
  appliedBy: {
    id: string | number | null;
    fullName: string | null;
  } | null;
  applyTargetPath: string | null;
  applyStrategy: string | null;
  metadataUpdated: boolean;
  metadataCreated: boolean;
  applyValidationErrors: string[];
};

export class CuratorProposalListQueryDto {
  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  @IsIn(CURATOR_PROPOSAL_STATUSES)
  status?: CuratorProposalStatus;
}

export class CuratorProposalReviewDto {
  @IsOptional()
  @IsString()
  reviewNote?: string;
}

export type CuratorStructuredProposalDraft = {
  targetWorkspace: 'assistant-dev';
  artifactType: CuratorArtifactType;
  targetKey: string | null;
  targetPath: string | null;
  changeType: CuratorChangeType;
  reason: string;
  proposedContent: string;
  priority?: 'primary' | 'secondary';
};

export type CuratorStructuredRecommendation = {
  summary: string;
  whyAssistantAnsweredThisWay: string;
  improvementFocus: string[];
  guardrails: string[];
  proposalDrafts: CuratorStructuredProposalDraft[];
};
