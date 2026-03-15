import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { CuratorAnalyzeDto } from './curator-analyze.dto';
import {
  CuratorStructuredRecommendation,
} from './curator-proposal.dto';

export const CURATOR_SESSION_CLASSIFICATIONS = [
  'behavior',
  'knowledge',
  'mixed',
] as const;

export type CuratorSessionClassification =
  (typeof CURATOR_SESSION_CLASSIFICATIONS)[number];

export type CuratorSessionRecord = {
  id: string;
  assistantThreadId: string | null;
  conversationId: string;
  analysisSummary: string;
  classification: CuratorSessionClassification;
  recommendedDraftsSnapshot: string[];
  discussionState: string | null;
  lastProcessedAssistantMessageId: string | null;
  lastProcessedCustomerMessageId: string | null;
  createdBy: {
    id: string | number | null;
    fullName: string | null;
  };
  createdAt: string;
  updatedAt: string;
};

export type CuratorSessionAnalysisPayload = {
  analysisId: string;
  requestId: string;
  question: string;
  structuredRecommendation: CuratorStructuredRecommendation;
  rawText: string;
  createdAt: string;
};

export type CuratorSessionExecutionResponse = {
  analysisMode: boolean;
  mode: 'initial' | 'follow_up' | 'reanalysis';
  workspace: 'assistant-dev';
  conversationId: string;
  session: CuratorSessionRecord;
  analysis: CuratorSessionAnalysisPayload;
  deferred: string[];
};

export class CuratorSessionStartDto extends CuratorAnalyzeDto {}

export class CuratorSessionMessageDto extends CuratorAnalyzeDto {}

export class CuratorSessionReanalyzeDto extends CuratorAnalyzeDto {}

export class CuratorSessionRouteParamDto {
  @IsString()
  @IsNotEmpty()
  id!: string;
}

export class CuratorSessionResponseDto {
  @ValidateNested()
  @Type(() => Object)
  session!: CuratorSessionRecord;
}
