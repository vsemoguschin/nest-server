import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { CreateCounterPartyDto } from './dto/counterparty-create.dto';

@UseGuards(RolesGuard)
@ApiTags('planfact')
@Controller('planfact')
export class PlanfactController {
  constructor(private readonly planfactService: PlanfactService) {}

  @Get('accounts')
  @Roles('ADMIN', 'G', 'KD')
  async getBankAccounts() {
    return this.planfactService.getBankAccounts();
  }

  @Get('operations')
  @Roles('ADMIN', 'G', 'KD')
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
  @Roles('ADMIN', 'G', 'KD')
  async getOriginalOperations(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 50,
    @Query('accountId') accountId: number,
    @Query('distributionFilter') distributionFilter?: string,
    @Query('counterPartyId') counterPartyId?: number,
  ) {
    if (!accountId) {
      throw new BadRequestException('Параметр accountId обязателен');
    }
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

    return this.planfactService.getOriginalOperations({
      from,
      to,
      page,
      limit,
      accountId,
      distributionFilter,
      counterPartyId,
    });
  }

  @Post('operation')
  @Roles('ADMIN', 'G', 'KD')
  async createOperation(@Body() createOperationDto: CreateOperationDto) {
    return this.planfactService.createOperation(createOperationDto);
  }

  @Patch('operation/:operationId')
  @Roles('ADMIN', 'G', 'KD')
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
  @Roles('ADMIN', 'G', 'KD')
  async deleteOperation(@Param('operationId') operationId: string) {
    return this.planfactService.deleteOperation(operationId);
  }

  @Patch('original-operation/:operationId/positions')
  @Roles('ADMIN', 'G', 'KD')
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

  @Post('expense-categories')
  @Roles('ADMIN', 'G', 'KD')
  async createExpenseCategory(
    @Body() createExpenseCategoryDto: CreateExpenseCategoryDto,
  ) {
    return this.planfactService.createExpenseCategory(createExpenseCategoryDto);
  }

  @Get('expense-categories')
  @Roles('ADMIN', 'G', 'KD')
  async getExpenseCategories(@Query('operationType') operationType?: string) {
    return this.planfactService.getExpenseCategories(operationType);
  }

  @Get('expense-categories-by-type')
  @Roles('ADMIN', 'G', 'KD')
  async getExpenseCategoriesByType(@Query('type') type: string) {
    return this.planfactService.getExpenseCategoriesByType(type);
  }

  @Get('counter-parties')
  @Roles('ADMIN', 'G', 'KD')
  async getCounterParties() {
    return this.planfactService.getCounterParties();
  }

  @Post('counter-parties')
  @Roles('ADMIN', 'G', 'KD')
  async createCounterParty(
    @Body() createCounterPartyDto: CreateCounterPartyDto,
  ) {
    return this.planfactService.createCounterParty(createCounterPartyDto);
  }

  @Get('categories')
  @Roles('ADMIN', 'G', 'KD')
  async getCategories() {
    return this.planfactService.getCategories();
  }

  @Post('accounts')
  @Roles('ADMIN', 'G', 'KD')
  async createAccount(@Body() dto: PlanFactAccountCreateDto) {
    return this.planfactService.createAccount(dto);
  }

  @Get('pl')
  @Roles('ADMIN', 'G', 'KD')
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
  @Roles('ADMIN', 'G', 'KD')
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
