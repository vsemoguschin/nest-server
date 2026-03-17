import { IsNotEmpty, IsString } from 'class-validator';

export type BrainWorkspaceSectionRecord = {
  key: string;
  title: string;
  description: string;
  workspace: 'assistant-dev';
  artifactCount: number;
};

export type BrainWorkspaceArtifactSummaryRecord = {
  key: string;
  title: string;
  summary: string | null;
  purpose: string | null;
  usedWhen: string[] | null;
  operatorHint: string | null;
  hasMetadata: boolean;
  section: string;
  relativePath: string;
  format: 'md' | 'json' | 'text';
  workspace: 'assistant-dev';
};

export type BrainWorkspaceSectionDetailsRecord = BrainWorkspaceSectionRecord & {
  artifacts: BrainWorkspaceArtifactSummaryRecord[];
};

export type BrainWorkspaceArtifactRecord = {
  workspace: 'assistant-dev';
  section: string;
  key: string;
  title: string;
  summary: string | null;
  purpose: string | null;
  usedWhen: string[] | null;
  operatorHint: string | null;
  hasMetadata: boolean;
  relativePath: string;
  format: 'md' | 'json' | 'text';
  fileName: string;
  byteSize: number;
  updatedAt: string;
  rawContent: string;
  textContent: string | null;
  parsedJson: unknown | null;
  parseError: string | null;
};

export class BrainWorkspaceSectionRouteParamDto {
  @IsString()
  @IsNotEmpty()
  sectionKey!: string;
}

export class BrainWorkspaceArtifactQueryDto {
  @IsString()
  @IsNotEmpty()
  sectionKey!: string;

  @IsString()
  @IsNotEmpty()
  artifactKey!: string;
}
