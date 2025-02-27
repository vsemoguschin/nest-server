import { Module } from '@nestjs/common';
import { WorkspaceGroupsController } from './workspace-groups.controller';
import { GroupsService } from '../../domains/groups/groups.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WorkspaceGroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class WorkspaceGroupsModule {}
