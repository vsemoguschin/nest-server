import { Module } from '@nestjs/common';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { CodexStreamController } from './codex-stream.controller';
import { CodexEventMapper } from './codex-event.mapper';
import { CliSpawnCodexRuntime } from './cli-spawn-codex-runtime';
import { CODEX_RUNTIME } from './codex-runtime';
import { CuratorAssistantController } from './curator-assistant.controller';
import { CuratorAssistantService } from './curator-assistant.service';
import { CuratorProposalMemoryStorage } from './curator-proposal.memory-storage';
import { CURATOR_PROPOSAL_STORAGE } from './curator-proposal.storage';

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
    CuratorProposalMemoryStorage,
    {
      provide: CODEX_RUNTIME,
      useExisting: CliSpawnCodexRuntime,
    },
    {
      provide: CURATOR_PROPOSAL_STORAGE,
      useExisting: CuratorProposalMemoryStorage,
    },
  ],
})
export class AiAssistantModule {}
