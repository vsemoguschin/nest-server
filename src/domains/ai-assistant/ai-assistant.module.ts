import { Module } from '@nestjs/common';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { CodexStreamController } from './codex-stream.controller';
import { CodexEventMapper } from './codex-event.mapper';
import { CliSpawnCodexRuntime } from './cli-spawn-codex-runtime';
import { CODEX_RUNTIME } from './codex-runtime';
import { CuratorAssistantController } from './curator-assistant.controller';
import { CuratorDecisionMemoryStorage } from './curator-decision.memory-storage';
import { CURATOR_DECISION_STORAGE } from './curator-decision.storage';
import { CuratorAssistantService } from './curator-assistant.service';
import { CuratorProposalMemoryStorage } from './curator-proposal.memory-storage';
import { CURATOR_PROPOSAL_STORAGE } from './curator-proposal.storage';
import { CuratorSessionMemoryStorage } from './curator-session.memory-storage';
import { CURATOR_SESSION_STORAGE } from './curator-session.storage';

@Module({
  controllers: [
    AiAssistantController,
    CodexStreamController,
    CuratorAssistantController,
  ],
  providers: [
    AiAssistantService,
    CuratorAssistantService,
    CodexEventMapper,
    CliSpawnCodexRuntime,
    CuratorDecisionMemoryStorage,
    CuratorProposalMemoryStorage,
    CuratorSessionMemoryStorage,
    {
      provide: CODEX_RUNTIME,
      useExisting: CliSpawnCodexRuntime,
    },
    {
      provide: CURATOR_DECISION_STORAGE,
      useExisting: CuratorDecisionMemoryStorage,
    },
    {
      provide: CURATOR_PROPOSAL_STORAGE,
      useExisting: CuratorProposalMemoryStorage,
    },
    {
      provide: CURATOR_SESSION_STORAGE,
      useExisting: CuratorSessionMemoryStorage,
    },
  ],
})
export class AiAssistantModule {}
