export type BrainPublishRequestRecord = {
  explicit: true;
  publishedBy: {
    id: string | null;
    fullName: string | null;
  };
};

export type BrainPublishResultRecord = {
  publishId: string;
  status: 'published' | 'failed';
  sourceWorkspace: 'assistant-dev';
  targetWorkspace: 'assistant-live';
  publishedAt: string;
  publishedBy: {
    id: string | null;
    fullName: string | null;
  };
  snapshotPath: string | null;
  changedArtifactsCount: number;
  publishedArtifacts: Array<{
    relativePath: string;
    section: string;
    title: string;
    hasMetadata: boolean;
    changeType:
      | 'added'
      | 'modified'
      | 'removed'
      | 'metadata_changed'
      | 'content_and_metadata_changed';
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
  }>;
  metadataIncluded: boolean;
  notes: string;
  validationErrors: string[];
  candidateSummary: string | null;
};
