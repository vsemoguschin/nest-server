import { Module } from '@nestjs/common';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { GroupsAccessService } from './groups-access.service';

@Module({
  controllers: [GroupsController],
  providers: [GroupsService, GroupsAccessService],
  exports: [GroupsAccessService],
})
export class GroupsModule {}
