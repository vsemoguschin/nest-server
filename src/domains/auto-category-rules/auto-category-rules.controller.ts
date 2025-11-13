import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AutoCategoryRulesService } from './auto-category-rules.service';

@Controller('auto-category-rules')
export class AutoCategoryRulesController {
  constructor(private readonly service: AutoCategoryRulesService) {}

  @Post()
  create(
    @Body()
    body: {
      enabled?: boolean;
      priority?: number;
      name: string;
      description?: string;
      keywords: string[];
      operationType: 'Debit' | 'Credit' | 'Any';
      accountIds?: number[];
      counterPartyIds?: number[];
      expenseCategoryId: number;
    },
  ) {
    return this.service.create(body);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(Number(id));
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      enabled?: boolean;
      priority?: number;
      name?: string;
      description?: string;
      keywords?: string[];
      operationType?: 'Debit' | 'Credit' | 'Any';
      accountIds?: number[];
      counterPartyIds?: number[];
      expenseCategoryId?: number;
    },
  ) {
    return this.service.update(Number(id), body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(Number(id));
  }

  @Post(':id/test')
  test(
    @Param('id') id: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.service.testRule(
      Number(id),
      Number(take) || 50,
      Number(skip) || 0,
    );
  }

  @Post('test')
  testByParams(
    @Body()
    body: {
      operationType: 'Debit' | 'Credit' | 'Any';
      keywords: string[];
      accountIds?: number[];
      counterPartyIds?: number[];
    },
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.service.testRuleByParams(
      body,
      Number(take) || 50,
      Number(skip) || 0,
    );
  }
}
