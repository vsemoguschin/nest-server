import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import {
  LearningBatchRunRequestDto,
  LearningReportRouteParamDto,
  LearningRunReportDto,
} from './dto/learning-analysis.dto';
import {
  LearningFindingCreateProposalDto,
  LearningFindingRouteParamDto,
} from './dto/learning-finding-proposal.dto';
import { CuratorProposalRecord } from './dto/curator-proposal.dto';
import { LearningAnalysisService } from './learning-analysis.service';

@ApiTags('crm-ai-assistant-learning')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('crm/ai-assistant/learning')
export class LearningAnalysisController {
  constructor(
    private readonly learningAnalysisService: LearningAnalysisService,
  ) {}

  @Post('run')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary:
      'Run conversation batch analysis over real CRM dialogs and return grouped recurring findings',
  })
  async run(
    @Body() body: LearningBatchRunRequestDto,
    @Req()
    req: Request & { user?: { id?: string | number; fullName?: string } },
  ): Promise<LearningRunReportDto> {
    return this.learningAnalysisService.runBatch(body, {
      id: req.user?.id ?? null,
      fullName: req.user?.fullName ?? null,
    });
  }

  @Get('report/:runId')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Get one conversation batch learning report by runId',
  })
  async getReport(
    @Param() params: LearningReportRouteParamDto,
  ): Promise<LearningRunReportDto> {
    return this.learningAnalysisService.getReport(params.runId);
  }

  @Post('findings/:findingId/create-proposal')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary:
      'Convert one learning finding into a curator proposal draft without applying it',
  })
  async createProposal(
    @Param() params: LearningFindingRouteParamDto,
    @Body() body: LearningFindingCreateProposalDto,
    @Req()
    req: Request & { user?: { id?: string | number; fullName?: string } },
  ): Promise<CuratorProposalRecord> {
    return this.learningAnalysisService.createProposalFromFinding(
      params.findingId,
      body,
      {
        id: req.user?.id ?? null,
        fullName: req.user?.fullName ?? null,
      },
    );
  }
}
