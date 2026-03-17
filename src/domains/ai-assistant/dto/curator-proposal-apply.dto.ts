export type CuratorProposalApplyResult = {
  proposalId: string;
  applyStatus: 'applied' | 'failed' | 'unsupported';
  workspace: 'assistant-dev';
  section: string | null;
  targetPath: string | null;
  artifactKey: string | null;
  strategyUsed: string | null;
  summary: string;
  validationErrors: string[];
  updatedArtifact: {
    key: string;
    title: string;
    summary: string | null;
    purpose: string | null;
    usedWhen: string[] | null;
    operatorHint: string | null;
  } | null;
  metadataUpdated: boolean;
  metadataCreated: boolean;
  appliedAt: string;
  appliedBy: {
    id: string | null;
    fullName: string | null;
  };
};
