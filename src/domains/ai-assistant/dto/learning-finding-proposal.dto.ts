import { IsIn, IsOptional, IsString } from 'class-validator';
import {
  CURATOR_CHANGE_TYPES,
  CURATOR_PROPOSAL_STATUSES,
  type CuratorChangeType,
} from './curator-proposal.dto';

export class LearningFindingCreateProposalDto {
  @IsString()
  sourceLearningRunId!: string;

  @IsOptional()
  @IsString()
  targetArtifactOverride?: string;

  @IsOptional()
  @IsString()
  @IsIn(CURATOR_CHANGE_TYPES)
  changeType?: CuratorChangeType;
}

export class LearningFindingRouteParamDto {
  @IsString()
  findingId!: string;
}
