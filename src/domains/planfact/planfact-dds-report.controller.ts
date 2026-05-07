import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PlanfactService } from './planfact.service';

@UseGuards(RolesGuard)
@ApiTags('planfact')
@Controller('planfact/dds-report')
export class PlanfactDdsReportController {
  constructor(private readonly planfactService: PlanfactService) {}

  @Get('statement-balances')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getStatementBalances(@Query('period') period: string) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }

    return this.planfactService.fetchDdsReportStatementBalancesByPeriod(period);
  }

  @Get('project-category-totals')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getProjectCategoryTotals(@Query('period') period: string) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }

    return this.planfactService.fetchDdsReportProjectCategoryTotalsByPeriod(
      period,
    );
  }

  @Get('details')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getDetails(
    @Query('period') period: string,
    @Query('sectionType') sectionType: string,
    @Query('projectId') projectId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('typeOfOperation') typeOfOperation?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 200,
  ) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }

    if (
      ![
        'project',
        'project-income',
        'project-expense',
        'unassigned',
        'transfers',
      ].includes(sectionType)
    ) {
      throw new BadRequestException(
        'Параметр sectionType должен быть одним из: project, project-income, project-expense, unassigned, transfers',
      );
    }

    if (
      typeOfOperation &&
      !['Credit', 'Debit'].includes(typeOfOperation)
    ) {
      throw new BadRequestException(
        'Параметр typeOfOperation должен быть одним из: Credit, Debit',
      );
    }

    if (page < 1) {
      throw new BadRequestException('Параметр page должен быть больше 0');
    }

    if (limit < 1 || limit > 1000) {
      throw new BadRequestException('Параметр limit должен быть от 1 до 1000');
    }

    return this.planfactService.fetchDdsReportDetails({
      period,
      sectionType: sectionType as
        | 'project'
        | 'project-income'
        | 'project-expense'
        | 'unassigned'
        | 'transfers',
      projectId,
      categoryId,
      typeOfOperation: typeOfOperation as 'Credit' | 'Debit' | undefined,
      page: Number(page),
      limit: Number(limit),
    });
  }
}
