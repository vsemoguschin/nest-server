import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { SuppliesService } from './supplies.service';
import { SupplieCreateDto } from './dto/supplie-create.dto';
import { Roles } from 'src/common/decorators/roles.decorator';

@UseGuards(RolesGuard)
@Controller('supplies')
export class SuppliesController {
  constructor(private readonly supplieService: SuppliesService) {}

  @Post()
  @Roles('ADMIN', 'G', 'LOGIST', 'DP')
  async create(@Body() supplieCreateDto: SupplieCreateDto) {
    return this.supplieService.create(supplieCreateDto);
  }

  @Get()
  @Roles('ADMIN', 'G', 'LOGIST', 'DP', 'FINANCIER')
  async getSupplies(
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<{ supplies: SupplieCreateDto[] }> {
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
    return this.supplieService.getSupplies(from, to);
  }

  // Delete
  @Delete(':id')
  @Roles('ADMIN', 'G', 'LOGIST', 'DP')
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.supplieService.delete(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'G', 'LOGIST', 'DP')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() supplieCreateDto: SupplieCreateDto,
  ) {
    return this.supplieService.update(id, supplieCreateDto);
  }

  @Get('suppliers')
  async getSuppliers() {
    return this.supplieService.getSuppliers();
  }

  @Get('positions')
  async getPositions() {
    return this.supplieService.getPositions();
  }
}
