import { Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { BrainWorkspaceService } from './brain-workspace.service';
import {
  BrainPublishCandidateArtifactDetailsRecord,
  BrainPublishCandidateArtifactQueryDto,
  BrainPublishCandidateRecord,
} from './dto/brain-publish-candidate.dto';
import { BrainPublishResultRecord } from './dto/brain-publish.dto';
import {
  BrainWorkspaceArtifactQueryDto,
  BrainWorkspaceArtifactRecord,
  BrainWorkspaceSectionDetailsRecord,
  BrainWorkspaceSectionRecord,
  BrainWorkspaceSectionRouteParamDto,
} from './dto/brain-workspace.dto';

@ApiTags('crm-brain-workspace')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('crm/ai-assistant/brain')
export class BrainWorkspaceController {
  constructor(private readonly brainWorkspaceService: BrainWorkspaceService) {}

  @Get('sections')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'List read-only sections of assistant-dev brain workspace',
  })
  async listSections(): Promise<BrainWorkspaceSectionRecord[]> {
    return this.brainWorkspaceService.listSections();
  }

  @Get('section/:sectionKey')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'List artifacts in one assistant-dev brain section',
  })
  async getSection(
    @Param() params: BrainWorkspaceSectionRouteParamDto,
  ): Promise<BrainWorkspaceSectionDetailsRecord> {
    return this.brainWorkspaceService.getSection(params.sectionKey);
  }

  @Get('artifact')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Read one assistant-dev brain artifact in read-only mode',
  })
  async getArtifact(
    @Query() query: BrainWorkspaceArtifactQueryDto,
  ): Promise<BrainWorkspaceArtifactRecord> {
    return this.brainWorkspaceService.getArtifact(
      query.sectionKey,
      query.artifactKey,
    );
  }

  @Get('publish-candidate')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'List assistant-dev vs assistant-live publish candidate changes',
  })
  async getPublishCandidate(): Promise<BrainPublishCandidateRecord> {
    return this.brainWorkspaceService.getPublishCandidate();
  }

  @Get('publish-candidate/artifact')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Inspect one changed publish candidate artifact in dev-vs-live context',
  })
  async getPublishCandidateArtifact(
    @Query() query: BrainPublishCandidateArtifactQueryDto,
  ): Promise<BrainPublishCandidateArtifactDetailsRecord> {
    return this.brainWorkspaceService.getPublishCandidateArtifact(query);
  }

  @Post('publish')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Explicitly publish current assistant-dev deployed state into assistant-live',
  })
  async publish(
    @Req()
    req: Request & { user?: { id?: string | number; fullName?: string } },
  ): Promise<BrainPublishResultRecord> {
    return this.brainWorkspaceService.publish({
      id: req.user?.id ?? null,
      fullName: req.user?.fullName ?? null,
    });
  }
}
