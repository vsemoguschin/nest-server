import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CuratorAssistantService } from './curator-assistant.service';
import { CuratorAnalyzeDto } from './dto/curator-analyze.dto';
import { CuratorDecisionCreateDto } from './dto/curator-decision.dto';
import {
  CuratorProposalCreateDto,
  CuratorProposalListQueryDto,
  CuratorProposalReviewDto,
} from './dto/curator-proposal.dto';
import {
  CuratorSessionMessageDto,
  CuratorSessionReanalyzeDto,
  CuratorSessionStartDto,
} from './dto/curator-session.dto';

@ApiTags('crm-curator-assistant')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('crm/ai-assistant/curator')
export class CuratorAssistantController {
  constructor(
    private readonly curatorAssistantService: CuratorAssistantService,
  ) {}

  @Post('analyze')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary:
      'Analyze conversation context and return structured improvement proposals for assistant-dev',
  })
  async analyze(
    @Body() body: CuratorAnalyzeDto,
    @Req()
    req: Request & { user?: { id?: string | number; fullName?: string } },
  ) {
    return this.curatorAssistantService.analyzeConversation(body, {
      id: req.user?.id ?? null,
      fullName: req.user?.fullName ?? null,
    });
  }

  @Post('session/start')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Start a curator analysis session for an assistant conversation',
  })
  async startSession(
    @Body() body: CuratorSessionStartDto,
    @Req()
    req: Request & { user?: { id?: string | number; fullName?: string } },
  ) {
    return this.curatorAssistantService.startSession(body, {
      id: req.user?.id ?? null,
      fullName: req.user?.fullName ?? null,
    });
  }

  @Post('session/:id/message')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Send a follow-up question into an existing curator session',
  })
  async sendSessionMessage(
    @Param('id') id: string,
    @Body() body: CuratorSessionMessageDto,
    @Req()
    req: Request & { user?: { id?: string | number; fullName?: string } },
  ) {
    return this.curatorAssistantService.sendSessionMessage(id, body, {
      id: req.user?.id ?? null,
      fullName: req.user?.fullName ?? null,
    });
  }

  @Get('session/:id')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Get compact curator session state',
  })
  async getSession(@Param('id') id: string) {
    return this.curatorAssistantService.getSession(id);
  }

  @Post('session/:id/reanalyze')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Re-run curator analysis for an existing session',
  })
  async reanalyzeSession(
    @Param('id') id: string,
    @Body() body: CuratorSessionReanalyzeDto,
    @Req()
    req: Request & { user?: { id?: string | number; fullName?: string } },
  ) {
    return this.curatorAssistantService.reanalyzeSession(id, body, {
      id: req.user?.id ?? null,
      fullName: req.user?.fullName ?? null,
    });
  }

  @Post('session/:id/decision')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Store a curator decision for the current session',
  })
  async createSessionDecision(
    @Param('id') id: string,
    @Body() body: CuratorDecisionCreateDto,
    @Req()
    req: Request & { user?: { id?: string | number; fullName?: string } },
  ) {
    return this.curatorAssistantService.createSessionDecision(id, body, {
      id: req.user?.id ?? null,
      fullName: req.user?.fullName ?? null,
    });
  }

  @Get('session/:id/decisions')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'List decisions for the current curator session',
  })
  async listSessionDecisions(@Param('id') id: string) {
    return this.curatorAssistantService.listSessionDecisions(id);
  }

  @Post('proposals')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary:
      'Create a structured curator proposal draft for assistant-dev without editing files directly',
  })
  async createProposalDraft(
    @Body() body: CuratorProposalCreateDto,
    @Req()
    req: Request & { user?: { id?: string | number; fullName?: string } },
  ) {
    return this.curatorAssistantService.createProposalDraft(body, {
      id: req.user?.id ?? null,
      fullName: req.user?.fullName ?? null,
    });
  }

  @Get('proposals')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'List curator proposal drafts',
  })
  async listProposalDrafts(@Query() query: CuratorProposalListQueryDto) {
    return this.curatorAssistantService.listProposalDrafts(query);
  }

  @Get('proposals/:id')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Get curator proposal draft details',
  })
  async getProposalDraft(@Param('id') id: string) {
    return this.curatorAssistantService.getProposalDraft(id);
  }

  @Post('proposals/:id/approve')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Approve curator proposal draft without publishing it',
  })
  async approveProposalDraft(
    @Param('id') id: string,
    @Body() body: CuratorProposalReviewDto,
    @Req()
    req: Request & { user?: { id?: string | number; fullName?: string } },
  ) {
    return this.curatorAssistantService.approveProposalDraft(id, body, {
      id: req.user?.id ?? null,
      fullName: req.user?.fullName ?? null,
    });
  }

  @Post('proposals/:id/reject')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Reject curator proposal draft without publishing it',
  })
  async rejectProposalDraft(
    @Param('id') id: string,
    @Body() body: CuratorProposalReviewDto,
    @Req()
    req: Request & { user?: { id?: string | number; fullName?: string } },
  ) {
    return this.curatorAssistantService.rejectProposalDraft(id, body, {
      id: req.user?.id ?? null,
      fullName: req.user?.fullName ?? null,
    });
  }

  @Post('proposals/:id/apply')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Apply one approved proposal into assistant-dev without publishing it',
  })
  async applyProposalDraft(
    @Param('id') id: string,
    @Req()
    req: Request & { user?: { id?: string | number; fullName?: string } },
  ) {
    return this.curatorAssistantService.applyProposalDraft(id, {
      id: req.user?.id ?? null,
      fullName: req.user?.fullName ?? null,
    });
  }
}
