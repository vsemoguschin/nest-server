import { Module } from '@nestjs/common';
import { WorkspaceGroupsController } from './workspace-groups.controller';
import { GroupsService } from '../../domains/groups/groups.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { GroupsAccessService } from '../groups/groups-access.service';

@Module({
  imports: [PrismaModule],
  controllers: [WorkspaceGroupsController],
  providers: [GroupsService, GroupsAccessService],
  exports: [GroupsService, GroupsAccessService],
})
export class WorkspaceGroupsModule {}
