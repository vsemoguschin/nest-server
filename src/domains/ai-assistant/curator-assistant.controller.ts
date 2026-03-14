import {
  Body,
  Controller,
  Get,
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
import {
  CuratorProposalCreateDto,
  CuratorProposalListQueryDto,
} from './dto/curator-proposal.dto';

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
}
