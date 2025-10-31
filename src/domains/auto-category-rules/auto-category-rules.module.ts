import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AutoCategoryRulesService, AutoCategoryRulesController } from '.';

@Module({
  imports: [PrismaModule],
  controllers: [AutoCategoryRulesController],
  providers: [AutoCategoryRulesService],
  exports: [AutoCategoryRulesService],
})
export class AutoCategoryRulesModule {}
