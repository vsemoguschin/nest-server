import { IsNotEmpty, IsString } from 'class-validator';

export type BrainPublishCandidateChangeType =
  | 'added'
  | 'modified'
  | 'removed'
  | 'metadata_changed'
  | 'content_and_metadata_changed';

export type BrainPublishCandidateArtifactSummaryRecord = {
  relativePath: string;
  section: string;
  title: string;
  hasMetadata: boolean;
  changeType: BrainPublishCandidateChangeType;
  contentChanged: boolean;
  metadataChanged: boolean;
  existsInDev: boolean;
  existsInLive: boolean;
  summary: string;
  devByteSize: number | null;
  liveByteSize: number | null;
  devUpdatedAt: string | null;
  liveUpdatedAt: string | null;
  devTitle: string | null;
  liveTitle: string | null;
  devSummary: string | null;
  liveSummary: string | null;
};

export type BrainPublishCandidateRecord = {
  devWorkspace: 'assistant-dev';
  liveWorkspace: 'assistant-live';
  totalChanged: number;
  addedCount: number;
  modifiedCount: number;
  removedCount: number;
  metadataOnlyCount: number;
  contentAndMetadataCount: number;
  missingMetadataInDevCount: number;
  summary: string;
  artifacts: BrainPublishCandidateArtifactSummaryRecord[];
};

export type BrainPublishCandidateArtifactSnapshotRecord = {
  workspace: 'assistant-dev' | 'assistant-live';
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

export type BrainPublishCandidateArtifactDetailsRecord = {
  relativePath: string;
  section: string;
  changeType: BrainPublishCandidateChangeType;
  contentChanged: boolean;
  metadataChanged: boolean;
  existsInDev: boolean;
  existsInLive: boolean;
  summary: string;
  devArtifact: BrainPublishCandidateArtifactSnapshotRecord | null;
  liveArtifact: BrainPublishCandidateArtifactSnapshotRecord | null;
};

export class BrainPublishCandidateArtifactQueryDto {
  @IsString()
  @IsNotEmpty()
  path!: string;
}
