import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseArrayPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PlanfactService } from './planfact.service';
import { ApiTags } from '@nestjs/swagger';
import { PlanFactAccountCreateDto } from './dto/planfact-account-create.dto';
import { CreateOperationDto } from './dto/create-operation.dto';
import { UpdateOperationDto } from './dto/update-operation.dto';
import { CreateExpenseCategoryDto } from './dto/expense-category-create.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { CreateCounterPartyDto } from './dto/counterparty-create.dto';
import type { Response } from 'express';

const normalizeQueryValue = (
  value?: string | string[],
): string | undefined => {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.join(',');
  return value;
};

const parseOptionalAccountId = (value?: string): number | undefined => {
  if (!value || value === 'all') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException(
      'Параметр accountId должен быть положительным целым числом или all',
    );
  }
  return parsed;
};

const parseOptionalProjectId = (value?: string): number | undefined => {
  if (!value || value === 'all') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException(
      'Параметр projectId должен быть положительным целым числом или all',
    );
  }
  return parsed;
};

const parseIdList = (
  value: string | string[] | undefined,
  options: { field: string; allowZero: boolean },
): number[] | undefined => {
  if (value === undefined) return undefined;
  if (Array.isArray(value) && value.includes('all')) return undefined;
  const raw = normalizeQueryValue(value);
  if (!raw || raw === 'all') return undefined;

  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;

  const ids = parts.map((part) => Number(part));
  const minAllowed = options.allowZero ? 0 : 1;
  if (ids.some((id) => !Number.isInteger(id) || id < minAllowed)) {
    throw new BadRequestException(
      `Параметр ${options.field} должен содержать только ${
        options.allowZero ? 'неотрицательные' : 'положительные'
      } целые числа или all`,
    );
  }

  return ids;
};

@UseGuards(RolesGuard)
@ApiTags('planfact')
@Controller('planfact')
export class PlanfactController {
  constructor(private readonly planfactService: PlanfactService) { }


  @Get('accounts')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getBankAccounts() {
    return this.planfactService.getBankAccounts();
  }

  @Get('statement-balances')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getStatementBalances(@Query('period') period: string) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.planfactService.fetchStatementBalancesByPeriod(period);
  }

  @Get('original-operations')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getOriginalOperations(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('accountId') accountId?: string,
    @Query('projectId') projectId?: string,
    @Query('distributionFilter') distributionFilter?: string,
    @Query(
      'counterPartyId',
      new ParseArrayPipe({ items: Number, optional: true, separator: ',' }),
    )
    counterPartyId?: number[],
    @Query(
      'expenseCategoryId',
      new ParseArrayPipe({ items: Number, optional: true, separator: ',' }),
    )
    expenseCategoryId?: number[],
    @Query('typeOfOperation') typeOfOperation?: string,
    @Query('searchText') searchText?: string,
  ) {
    // Убрана обязательность accountId
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      throw new BadRequestException(
        'Параметр from обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new BadRequestException(
        'Параметр to обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    if (page < 1) {
      throw new BadRequestException('Параметр page должен быть больше 0');
    }
    if (limit < 1 || limit > 1000) {
      throw new BadRequestException('Параметр limit должен быть от 1 до 1000');
    }
    if (
      distributionFilter &&
      !['all', 'hasCat', 'hasntCat'].includes(distributionFilter)
    ) {
      throw new BadRequestException(
        'Параметр distributionFilter должен быть одним из: all, hasCat, hasntCat',
      );
    }
    if (
      counterPartyId &&
      counterPartyId.some((id) => !Number.isInteger(id) || id < 1)
    ) {
      throw new BadRequestException(
        'Параметр counterPartyId должен содержать только положительные целые числа',
      );
    }
    if (
      expenseCategoryId &&
      expenseCategoryId.some((id) => !Number.isInteger(id) || id < 0)
    ) {
      throw new BadRequestException(
        'Параметр expenseCategoryId должен содержать только неотрицательные целые числа',
      );
    }
    if (
      typeOfOperation &&
      !['Debit', 'Credit', 'Transfer'].includes(typeOfOperation)
    ) {
      throw new BadRequestException(
        'Параметр typeOfOperation должен быть одним из: Debit, Credit, Transfer',
      );
    }

    const parsedAccountId = parseOptionalAccountId(accountId);
    const parsedProjectId = parseOptionalProjectId(projectId);

    return this.planfactService.getOriginalOperations({
      from,
      to,
      page,
      limit,
      accountId: parsedAccountId,
      projectId: parsedProjectId,
      distributionFilter,
      counterPartyId,
      expenseCategoryId,
      typeOfOperation,
      searchText,
    });
  }

  @Get('original-operations-export')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async exportOriginalOperations(
    @Query('from') from: string,
    @Query('to') to: string,
    @Res({ passthrough: true }) res: Response,
    @Query('accountId') accountId?: string,
    @Query('projectId') projectId?: string,
    @Query('distributionFilter') distributionFilter?: string,
    @Query('counterPartyId') counterPartyId?: string | string[],
    @Query('expenseCategoryId') expenseCategoryId?: string | string[],
    @Query('typeOfOperation') typeOfOperation?: string,
    @Query('searchText') searchText?: string,
  ) {
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      throw new BadRequestException(
        'Параметр from обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new BadRequestException(
        'Параметр to обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    if (
      distributionFilter &&
      !['all', 'hasCat', 'hasntCat'].includes(distributionFilter)
    ) {
      throw new BadRequestException(
        'Параметр distributionFilter должен быть одним из: all, hasCat, hasntCat',
      );
    }
    if (
      typeOfOperation &&
      !['Debit', 'Credit', 'Transfer', 'all'].includes(typeOfOperation)
    ) {
      throw new BadRequestException(
        'Параметр typeOfOperation должен быть одним из: Debit, Credit, Transfer, all',
      );
    }

    const parsedAccountId = parseOptionalAccountId(accountId);
    const parsedProjectId = parseOptionalProjectId(projectId);
    const parsedCounterPartyId = parseIdList(counterPartyId, {
      field: 'counterPartyId',
      allowZero: false,
    });
    const parsedExpenseCategoryId = parseIdList(expenseCategoryId, {
      field: 'expenseCategoryId',
      allowZero: true,
    });
    const normalizedTypeOfOperation =
      typeOfOperation === 'all' ? undefined : typeOfOperation;

    const buffer = await this.planfactService.exportOriginalOperations({
      from,
      to,
      accountId: parsedAccountId,
      projectId: parsedProjectId,
      distributionFilter,
      counterPartyId: parsedCounterPartyId,
      expenseCategoryId: parsedExpenseCategoryId,
      typeOfOperation: normalizedTypeOfOperation,
      searchText,
    });

    const filename = `operations_${from}_${to}.xlsx`;
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    return new StreamableFile(buffer);
  }

  @Get('original-operations-totals')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getOriginalOperationsTotals(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('accountId') accountId?: number,
    @Query('projectId') projectId?: string,
    @Query(
      'counterPartyId',
      new ParseArrayPipe({ items: Number, optional: true, separator: ',' }),
    )
    counterPartyId?: number[],
    @Query(
      'expenseCategoryId',
      new ParseArrayPipe({ items: Number, optional: true, separator: ',' }),
    )
    expenseCategoryId?: number[],
    @Query('typeOfOperation') typeOfOperation?: string,
  ) {
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      throw new BadRequestException(
        'Параметр from обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new BadRequestException(
        'Параметр to обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    if (
      counterPartyId &&
      counterPartyId.some((id) => !Number.isInteger(id) || id < 1)
    ) {
      throw new BadRequestException(
        'Параметр counterPartyId должен содержать только положительные целые числа',
      );
    }
    if (
      expenseCategoryId &&
      expenseCategoryId.some((id) => !Number.isInteger(id) || id < 0)
    ) {
      throw new BadRequestException(
        'Параметр expenseCategoryId должен содержать только неотрицательные целые числа',
      );
    }
    if (
      typeOfOperation &&
      !['Debit', 'Credit', 'Transfer'].includes(typeOfOperation)
    ) {
      throw new BadRequestException(
        'Параметр typeOfOperation должен быть одним из: Debit, Credit, Transfer',
      );
    }

    const parsedProjectId = parseOptionalProjectId(projectId);

    return this.planfactService.getOriginalOperationsTotals({
      from,
      to,
      accountId,
      projectId: parsedProjectId,
      // counterPartyId,
      // expenseCategoryId,
      // typeOfOperation,
    });
  }

  @Post('operation')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async createOperation(@Body() createOperationDto: CreateOperationDto) {
    return this.planfactService.createOperation(createOperationDto);
  }

  @Patch('operation/:operationId')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async updateOperation(
    @Param('operationId') operationId: string,
    @Body() updateOperationDto: UpdateOperationDto,
  ) {
    return this.planfactService.updateOperation(
      operationId,
      updateOperationDto,
    );
  }

  @Delete('operation/:operationId')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async deleteOperation(@Param('operationId') operationId: string) {
    return this.planfactService.deleteOperation(operationId);
  }

  @Patch('original-operation/:operationId/positions')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async updateOriginalOperationPositions(
    @Param('operationId') operationId: string,
    @Body()
    positionsData: Array<{
      id?: number;
      counterPartyId?: number;
      expenseCategoryId?: number;
      projectId?: number | null;
      amount: number;
      period?: string;
    }>,
  ) {
    return this.planfactService.updateOriginalOperationPositions(
      operationId,
      positionsData,
    );
  }

  @Patch('position/:positionId/project')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async updateProjectForPosition(
    @Param('positionId') positionId: number,
    @Body() body: { projectId: number | null },
  ) {
    return this.planfactService.updateProjectForPosition(
      positionId,
      body.projectId,
    );
  }

  @Patch('position/:positionId/remove-category')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async removeExpenseCategoryFromPosition(
    @Param('positionId') positionId: number,
  ) {
    return this.planfactService.removeExpenseCategoryFromPosition(positionId);
  }

  @Get('counter-parties-filters')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getCounterPartiesFilters(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 50,
    @Query('title') title?: string,
  ) {
    if (page < 1) {
      throw new BadRequestException('Параметр page должен быть больше 0');
    }
    if (limit < 1 || limit > 1000) {
      throw new BadRequestException('Параметр limit должен быть от 1 до 1000');
    }
    return this.planfactService.getCounterPartiesFilters({
      page,
      limit,
      title,
    });
  }

  @Post('counter-parties')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async createCounterParty(
    @Body() createCounterPartyDto: CreateCounterPartyDto,
  ) {
    return this.planfactService.createCounterParty(createCounterPartyDto);
  }

  @Post('accounts')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async createAccount(@Body() dto: PlanFactAccountCreateDto) {
    return this.planfactService.createAccount(dto);
  }



  //присвоить статью расходов контрагенту
  @Patch('counter-parties/expense-categories')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async assignExpenseCategoriesToCounterParty(
    @Body()
    categoriesData: {
      counterPartyAccount: string;
      incomeExpenseCategoryId?: number | null;
      outcomeExpenseCategoryId?: number | null;
    },
  ) {
    if (!categoriesData.counterPartyAccount) {
      throw new BadRequestException('Параметр counterPartyAccount обязателен');
    }
    const hasIncome = Object.prototype.hasOwnProperty.call(
      categoriesData,
      'incomeExpenseCategoryId',
    );
    const hasOutcome = Object.prototype.hasOwnProperty.call(
      categoriesData,
      'outcomeExpenseCategoryId',
    );
    if (!hasIncome && !hasOutcome) {
      throw new BadRequestException(
        'Необходимо указать хотя бы одну категорию (incomeExpenseCategoryId или outcomeExpenseCategoryId)',
      );
    }

    return this.planfactService.assignExpenseCategoriesToCounterPartyByAccount(
      categoriesData.counterPartyAccount,
      categoriesData,
    );
  }

  //присвоить проект контрагенту
  @Patch('counter-parties/projects')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async assignProjectsToCounterParty(
    @Body()
    projectsData: {
      counterPartyAccount: string;
      incomeProjectId?: number | null;
      outcomeProjectId?: number | null;
    },
  ) {
    if (!projectsData.counterPartyAccount) {
      throw new BadRequestException('Параметр counterPartyAccount обязателен');
    }
    const hasIncome = Object.prototype.hasOwnProperty.call(
      projectsData,
      'incomeProjectId',
    );
    const hasOutcome = Object.prototype.hasOwnProperty.call(
      projectsData,
      'outcomeProjectId',
    );
    if (!hasIncome && !hasOutcome) {
      throw new BadRequestException(
        'Необходимо указать хотя бы один проект (incomeProjectId или outcomeProjectId)',
      );
    }

    return this.planfactService.assignProjectsToCounterPartyByAccount(
      projectsData.counterPartyAccount,
      projectsData,
    );
  }

  @Post('expense-categories')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async createExpenseCategory(
    @Body() createExpenseCategoryDto: CreateExpenseCategoryDto,
  ) {
    return this.planfactService.createExpenseCategory(createExpenseCategoryDto);
  }

  @Patch('expense-categories/:id')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async updateExpenseCategory(
    @Param('id') id: string,
    @Body() updateExpenseCategoryDto: UpdateExpenseCategoryDto,
  ) {
    const categoryId = parseInt(id, 10);
    if (isNaN(categoryId)) {
      throw new BadRequestException('ID категории должен быть числом');
    }
    return this.planfactService.updateExpenseCategory(
      categoryId,
      updateExpenseCategoryDto,
    );
  }

  @Delete('expense-categories/:id')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async deleteExpenseCategory(@Param('id') id: string) {
    const categoryId = parseInt(id, 10);
    if (isNaN(categoryId)) {
      throw new BadRequestException('ID категории должен быть числом');
    }
    return this.planfactService.deleteExpenseCategory(categoryId);
  }

  @Get('expense-categories-mini')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getExpenseCategoriesByType(@Query('type') type: string) {
    return this.planfactService.getExpenseCategoriesByType(type);
  }

  @Get('projects')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getProjects() {
    return this.planfactService.getProjects();
  }

  //получить список статей расходов
  @Get('expense-categories-list')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getExpenseCategoriesList() {
    return this.planfactService.getExpenseCategoriesList();
  }
}
