import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { EvaluationService } from './evaluation.service';
import {
  EvaluationReportRecord,
  EvaluationRunRequestRecord,
} from './dto/evaluation.dto';

@ApiTags('crm-ai-assistant-eval')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('crm/ai-assistant/eval')
export class EvaluationController {
  constructor(private readonly evaluationService: EvaluationService) {}

  @Post('run')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Run evaluation scenarios against assistant-dev through assistant-service',
  })
  async run(
    @Body() body: EvaluationRunRequestRecord,
  ): Promise<EvaluationReportRecord> {
    return this.evaluationService.run(body);
  }

  @Get('report/:runId')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Get one evaluation report by runId',
  })
  async getReport(@Param('runId') runId: string): Promise<EvaluationReportRecord> {
    return this.evaluationService.getReport(runId);
  }
}
