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

  // @Patch('operations/:operationId/expense-category')
  // @Roles('ADMIN', 'G', 'KD')
  // async assignExpenseCategory(
  //   @Param('operationId') operationId: string,
  //   @Body('expenseCategoryId') expenseCategoryId: number,
  // ) {
  //   return this.planfactService.assignExpenseCategory(
  //     operationId,
  //     expenseCategoryId,
  //   );
  // }

  @Post('operation')
  @Roles('ADMIN', 'G', 'KD')
  async createOperation(@Body() createOperationDto: CreateOperationDto) {
    return this.planfactService.createOperation(createOperationDto);
  }

  @Patch('operation/:operationId')
  @Roles('ADMIN', 'G', 'KD')
  async updateOperation(@Param('operationId') operationId: string, @Body() updateOperationDto: UpdateOperationDto) {
    return this.planfactService.updateOperation(operationId, updateOperationDto);
  }

  @Delete('operation/:operationId')
  @Roles('ADMIN', 'G', 'KD')
  async deleteOperation(@Param('operationId') operationId: string) {
    return this.planfactService.deleteOperation(operationId);
  }

  @Post('expense-categories')
  @Roles('ADMIN', 'G', 'KD')
  async createExpenseCategory(@Body() createExpenseCategoryDto: CreateExpenseCategoryDto) {
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
  async createCounterParty(@Body() createCounterPartyDto: CreateCounterPartyDto) {
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
}
