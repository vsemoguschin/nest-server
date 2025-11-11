import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseArrayPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PlanfactService } from './planfact.service';
import { ApiTags } from '@nestjs/swagger';
import { PlanFactAccountCreateDto } from './dto/planfact-account-create.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDto } from '../users/dto/user.dto';
import { CreateOperationDto } from './dto/create-operation.dto';
import { UpdateOperationDto } from './dto/update-operation.dto';
import { CreateExpenseCategoryDto } from './dto/expense-category-create.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { CreateCounterPartyDto } from './dto/counterparty-create.dto';

@UseGuards(RolesGuard)
@ApiTags('planfact')
@Controller('planfact')
export class PlanfactController {
  constructor(private readonly planfactService: PlanfactService) {}

  @Get('accounts')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getBankAccounts() {
    return this.planfactService.getBankAccounts();
  }

  @Get('operations')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getOperationsFromRange(
    @Query('start') start: string,
    @Query('end') end: string,
    @Query('limit') limit: number,
    @Query('accountId') accountId: number,
  ) {
    if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      throw new BadRequestException(
        'Параметр start обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    if (!end || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      throw new BadRequestException(
        'Параметр end обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    return this.planfactService.getOperationsFromRange(
      { from: start, to: end },
      limit,
      accountId,
    );
  }

  @Get('original-operations')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getOriginalOperations(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('accountId') accountId?: number,
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

    return this.planfactService.getOriginalOperations({
      from,
      to,
      page,
      limit,
      accountId,
      distributionFilter,
      counterPartyId,
      expenseCategoryId,
      typeOfOperation,
      searchText,
    });
  }

  @Get('original-operations-totals')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getOriginalOperationsTotals(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('accountId') accountId?: number,
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

    return this.planfactService.getOriginalOperationsTotals({
      from,
      to,
      accountId,
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
      amount: number;
    }>,
  ) {
    return this.planfactService.updateOriginalOperationPositions(
      operationId,
      positionsData,
    );
  }

  @Patch('position/:positionId/remove-category')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async removeExpenseCategoryFromPosition(
    @Param('positionId') positionId: number,
  ) {
    return this.planfactService.removeExpenseCategoryFromPosition(positionId);
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

  @Get('expense-categories')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getExpenseCategories(@Query('operationType') operationType?: string) {
    return this.planfactService.getExpenseCategories(operationType);
  }

  @Get('expense-categories-by-type')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getExpenseCategoriesByType(@Query('type') type: string) {
    return this.planfactService.getExpenseCategoriesByType(type);
  }

  @Get('expense-categories-list')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getExpenseCategoriesList() {
    return this.planfactService.getExpenseCategoriesList();
  }

  @Get('counter-parties')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getCounterParties() {
    return this.planfactService.getCounterParties();
  }

  @Get('counter-parties-filters')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getCounterPartiesFilters(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('accountId') accountId?: number,
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

    return this.planfactService.getCounterPartiesFilters({
      from,
      to,
      accountId,
    });
  }

  @Get('expense-category-filters')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getExpenseCategoriesFilters(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('accountId') accountId?: number,
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

    return this.planfactService.getExpenseCategoriesFilters({
      from,
      to,
      accountId,
    });
  }

  @Post('counter-parties')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async createCounterParty(
    @Body() createCounterPartyDto: CreateCounterPartyDto,
  ) {
    return this.planfactService.createCounterParty(createCounterPartyDto);
  }

  @Get('categories')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getCategories() {
    return this.planfactService.getCategories();
  }

  @Post('accounts')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async createAccount(@Body() dto: PlanFactAccountCreateDto) {
    return this.planfactService.createAccount(dto);
  }

  @Get('pl')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getPLDatas(
    @Query('period') period: string,
    @CurrentUser() user: UserDto,
  ) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.planfactService.getPLDatas(period, user);
  }

  @Patch('counter-parties/expense-categories')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async assignExpenseCategoriesToCounterParty(
    @Body()
    categoriesData: {
      counterPartyAccount: string;
      incomeExpenseCategoryId?: number;
      outcomeExpenseCategoryId?: number;
    },
  ) {
    if (!categoriesData.counterPartyAccount) {
      throw new BadRequestException('Параметр counterPartyAccount обязателен');
    }
    if (
      !categoriesData.incomeExpenseCategoryId &&
      !categoriesData.outcomeExpenseCategoryId
    ) {
      throw new BadRequestException(
        'Необходимо указать хотя бы одну категорию (incomeExpenseCategoryId или outcomeExpenseCategoryId)',
      );
    }

    return this.planfactService.assignExpenseCategoriesToCounterPartyByAccount(
      categoriesData.counterPartyAccount,
      categoriesData,
    );
  }
}
