import { Module } from '@nestjs/common';
import { MembersController } from './members.controller';
import { TaskMembersService } from './members.service';

@Module({
  controllers: [MembersController],
  providers: [TaskMembersService],
})
export class MembersModule {}
