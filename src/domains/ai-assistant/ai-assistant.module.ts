import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CrmCustomersModule } from '../crm-customers/crm-customers.module';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { AssistantServiceCodexRuntime } from './assistant-service-codex-runtime';
import { BrainWorkspaceController } from './brain-workspace.controller';
import { BrainWorkspaceService } from './brain-workspace.service';
import { CodexStreamController } from './codex-stream.controller';
import { CodexEventMapper } from './codex-event.mapper';
import { CliSpawnCodexRuntime } from './cli-spawn-codex-runtime';
import { CODEX_RUNTIME } from './codex-runtime';
import { CuratorAssistantController } from './curator-assistant.controller';
import { EvaluationController } from './evaluation.controller';
import { EvaluationService } from './evaluation.service';
import { CuratorDecisionMemoryStorage } from './curator-decision.memory-storage';
import { CURATOR_DECISION_STORAGE } from './curator-decision.storage';
import { CuratorAssistantService } from './curator-assistant.service';
import { CuratorProposalMemoryStorage } from './curator-proposal.memory-storage';
import { CURATOR_PROPOSAL_STORAGE } from './curator-proposal.storage';
import { CuratorSessionMemoryStorage } from './curator-session.memory-storage';
import { CURATOR_SESSION_STORAGE } from './curator-session.storage';
import { LearningAnalysisController } from './learning-analysis.controller';
import { LearningAnalysisMemoryStorage } from './learning-analysis.memory-storage';
import { LearningAnalysisService } from './learning-analysis.service';
import { LEARNING_ANALYSIS_STORAGE } from './learning-analysis.storage';

@Module({
  imports: [CrmCustomersModule],
  controllers: [
    AiAssistantController,
    BrainWorkspaceController,
    CodexStreamController,
    CuratorAssistantController,
    EvaluationController,
    LearningAnalysisController,
  ],
  providers: [
    AiAssistantService,
    BrainWorkspaceService,
    CuratorAssistantService,
    EvaluationService,
    LearningAnalysisService,
    CodexEventMapper,
    CliSpawnCodexRuntime,
    AssistantServiceCodexRuntime,
    CuratorDecisionMemoryStorage,
    CuratorProposalMemoryStorage,
    CuratorSessionMemoryStorage,
    LearningAnalysisMemoryStorage,
    {
      provide: CODEX_RUNTIME,
      inject: [ConfigService, CliSpawnCodexRuntime, AssistantServiceCodexRuntime],
      useFactory: (
        config: ConfigService,
        cliRuntime: CliSpawnCodexRuntime,
        assistantServiceRuntime: AssistantServiceCodexRuntime,
      ) => {
        const transport =
          config.get<string>('CODEX_RUNTIME_TRANSPORT') || 'local_cli';

        return transport === 'assistant_service'
          ? assistantServiceRuntime
          : cliRuntime;
      },
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
    {
      provide: LEARNING_ANALYSIS_STORAGE,
      useExisting: LearningAnalysisMemoryStorage,
    },
  ],
})
export class AiAssistantModule {}
