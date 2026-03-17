import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class LearningReportRouteParamDto {
  @IsString()
  @IsNotEmpty()
  runId!: string;
}

export class LearningBatchRunRequestDto {
  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Type(() => Number)
  customerIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Type(() => Number)
  statusIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  @Type(() => Number)
  managerIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  @Type(() => Number)
  tagIds?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  maxConversations?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(200)
  historyCount?: number;
}

export type LearningRunFiltersRecord = {
  source: string;
  customerIds: number[];
  statusIds: number[];
  managerIds: number[];
  tagIds: number[];
  maxConversations: number;
  historyCount: number;
};

export type LearningCoverageStatus =
  | 'covered'
  | 'partially_covered'
  | 'missing'
  | 'uncertain';

export type LearningImprovementType =
  | 'knowledge_gap'
  | 'script_gap'
  | 'process_gap'
  | 'followup_gap'
  | 'successful_pattern';

export type LearningOutcomeStatus =
  | 'unknown'
  | 'lead_only'
  | 'qualified'
  | 'price_discussed'
  | 'deposit_paid'
  | 'fully_paid'
  | 'completed'
  | 'lost'
  | 'stalled';

export type LearningPaymentStage =
  | 'none'
  | 'deposit_paid'
  | 'fully_paid';

export type LearningPhaseType =
  | 'lead_intake'
  | 'qualification'
  | 'pricing'
  | 'payment_conversion'
  | 'photo_collection'
  | 'design_approval'
  | 'production_delivery'
  | 'post_delivery_feedback'
  | 'post_purchase_marketing';

export type LearningManagerPatternCandidateType =
  | 'script_candidate'
  | 'process_candidate'
  | 'followup_candidate'
  | 'objection_candidate'
  | 'operational_knowledge_candidate';

export type LearningSuggestedArtifactType =
  | 'knowledge_script'
  | 'knowledge_faq'
  | 'instruction_rule'
  | 'followup_rule';

export type LearningManagerCandidateRecord = {
  candidateId: string;
  category: string;
  summary: string;
  exampleManagerMessage: string;
  suspectedArtifacts: string[];
  coverageStatus: LearningCoverageStatus;
  notes: string[];
};

export type LearningSuccessfulPatternRecord = {
  patternId: string;
  title: string;
  summary: string;
  exampleManagerMessage: string;
  suggestedArtifacts: string[];
  coverageStatus: LearningCoverageStatus;
  notes: string[];
};

export type LearningPhaseAnalysisRecord = {
  phaseType: LearningPhaseType;
  startMessageIndex: number;
  endMessageIndex: number;
  phaseOutcome: 'successful' | 'mixed' | 'neutral' | 'risky';
  positivePatterns: string[];
  issues: string[];
  notes: string[];
};

export type LearningManagerPatternCandidateRecord = {
  candidateId: string;
  candidateType: LearningManagerPatternCandidateType;
  title: string;
  triggerSituation: string;
  summary: string;
  exampleManagerMessages: string[];
  whyItWorked: string;
  suggestedArtifactPath: string;
  suggestedArtifactType: LearningSuggestedArtifactType;
  confidence: 'low' | 'medium' | 'high';
  evidenceCount: number;
  sourceConversationIds: string[];
  coverageStatus: LearningCoverageStatus;
  phaseType: LearningPhaseType;
  operationalImportance: string | null;
};

export type LearningConversationAnalysisRecord = {
  conversationId: string;
  customerId: number;
  customerName: string;
  sourceAnalysisId: string;
  outcomeStatus: LearningOutcomeStatus;
  isSuccessful: boolean;
  isCompleted: boolean;
  paymentStage: LearningPaymentStage;
  shortSummary: string;
  extractedIssues: string[];
  successfulPatterns: LearningSuccessfulPatternRecord[];
  phaseAnalyses: LearningPhaseAnalysisRecord[];
  managerPatternCandidates: LearningManagerPatternCandidateRecord[];
  notes: string[];
  suspectedArtifacts: string[];
  managerKnowledgeCandidates: LearningManagerCandidateRecord[];
  managerProcessCandidates: LearningManagerCandidateRecord[];
  managerFollowUpCandidates: LearningManagerCandidateRecord[];
};

export type LearningFindingRecord = {
  findingId: string;
  category: string;
  improvementType: LearningImprovementType;
  title: string;
  summary: string;
  evidenceCount: number;
  successEvidenceCount: number;
  failureEvidenceCount: number;
  exampleConversationIds: string[];
  exampleManagerMessages: string[];
  suspectedArtifacts: string[];
  suggestedArtifacts: string[];
  coverageStatus: LearningCoverageStatus;
  whyNotCovered: string | null;
  recommendation: string;
  recommendedAction: string;
  phaseTypes: LearningPhaseType[];
  status: 'open';
};

export type LearningRunReportRecord = {
  runId: string;
  status: 'completed' | 'failed';
  startedAt: string;
  finishedAt: string;
  filters: LearningRunFiltersRecord;
  conversationCount: number;
  analyzedCount: number;
  successfulConversationCount: number;
  completedConversationCount: number;
  failedConversationCount: number;
  findingsCount: number;
  findings: LearningFindingRecord[];
  conversationAnalyses: LearningConversationAnalysisRecord[];
  managerPatternCandidates: LearningManagerPatternCandidateRecord[];
  limitations: string[];
};

export class LearningFindingDto {
  findingId!: string;
  category!: string;
  improvementType!: LearningImprovementType;
  title!: string;
  summary!: string;
  evidenceCount!: number;
  successEvidenceCount!: number;
  failureEvidenceCount!: number;
  exampleConversationIds!: string[];
  exampleManagerMessages!: string[];
  suspectedArtifacts!: string[];
  suggestedArtifacts!: string[];
  coverageStatus!: LearningCoverageStatus;
  whyNotCovered!: string | null;
  recommendation!: string;
  recommendedAction!: string;
  phaseTypes!: LearningPhaseType[];
  status!: 'open';
}

export class LearningManagerCandidateDto {
  candidateId!: string;
  category!: string;
  summary!: string;
  exampleManagerMessage!: string;
  suspectedArtifacts!: string[];
  coverageStatus!: LearningCoverageStatus;
  notes!: string[];
}

export class LearningConversationAnalysisDto {
  conversationId!: string;
  customerId!: number;
  customerName!: string;
  sourceAnalysisId!: string;
  outcomeStatus!: LearningOutcomeStatus;
  isSuccessful!: boolean;
  isCompleted!: boolean;
  paymentStage!: LearningPaymentStage;
  shortSummary!: string;
  extractedIssues!: string[];
  notes!: string[];
  suspectedArtifacts!: string[];

  @ValidateNested({ each: true })
  @Type(() => LearningSuccessfulPatternDto)
  successfulPatterns!: LearningSuccessfulPatternDto[];

  @ValidateNested({ each: true })
  @Type(() => LearningPhaseAnalysisDto)
  phaseAnalyses!: LearningPhaseAnalysisDto[];

  @ValidateNested({ each: true })
  @Type(() => LearningManagerPatternCandidateDto)
  managerPatternCandidates!: LearningManagerPatternCandidateDto[];

  @ValidateNested({ each: true })
  @Type(() => LearningManagerCandidateDto)
  managerKnowledgeCandidates!: LearningManagerCandidateDto[];

  @ValidateNested({ each: true })
  @Type(() => LearningManagerCandidateDto)
  managerProcessCandidates!: LearningManagerCandidateDto[];

  @ValidateNested({ each: true })
  @Type(() => LearningManagerCandidateDto)
  managerFollowUpCandidates!: LearningManagerCandidateDto[];
}

export class LearningSuccessfulPatternDto {
  patternId!: string;
  title!: string;
  summary!: string;
  exampleManagerMessage!: string;
  suggestedArtifacts!: string[];
  coverageStatus!: LearningCoverageStatus;
  notes!: string[];
}

export class LearningPhaseAnalysisDto {
  phaseType!: LearningPhaseType;
  startMessageIndex!: number;
  endMessageIndex!: number;
  phaseOutcome!: 'successful' | 'mixed' | 'neutral' | 'risky';
  positivePatterns!: string[];
  issues!: string[];
  notes!: string[];
}

export class LearningManagerPatternCandidateDto {
  candidateId!: string;
  candidateType!: LearningManagerPatternCandidateType;
  title!: string;
  triggerSituation!: string;
  summary!: string;
  exampleManagerMessages!: string[];
  whyItWorked!: string;
  suggestedArtifactPath!: string;
  suggestedArtifactType!: LearningSuggestedArtifactType;
  confidence!: 'low' | 'medium' | 'high';
  evidenceCount!: number;
  sourceConversationIds!: string[];
  coverageStatus!: LearningCoverageStatus;
  phaseType!: LearningPhaseType;
  operationalImportance!: string | null;
}

export class LearningRunReportDto {
  runId!: string;
  status!: 'completed' | 'failed';
  startedAt!: string;
  finishedAt!: string;
  filters!: LearningRunFiltersRecord;
  conversationCount!: number;
  analyzedCount!: number;
  successfulConversationCount!: number;
  completedConversationCount!: number;
  failedConversationCount!: number;
  findingsCount!: number;

  @ValidateNested({ each: true })
  @Type(() => LearningFindingDto)
  findings!: LearningFindingDto[];

  @ValidateNested({ each: true })
  @Type(() => LearningConversationAnalysisDto)
  conversationAnalyses!: LearningConversationAnalysisDto[];

  @ValidateNested({ each: true })
  @Type(() => LearningManagerPatternCandidateDto)
  managerPatternCandidates!: LearningManagerPatternCandidateDto[];

  limitations!: string[];
}
