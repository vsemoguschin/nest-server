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
import { SuppliesCreateDto } from './dto/supplies-create.dto';
import { Roles } from 'src/common/decorators/roles.decorator';

@UseGuards(RolesGuard)
@Controller('supplies')
export class SuppliesController {
  constructor(private readonly suppliesService: SuppliesService) {}

  @Post()
  @Roles('ADMIN', 'G', 'LOGIST')
  async create(
    @Body() suppliesCreateDto: SuppliesCreateDto,
  ): Promise<SuppliesCreateDto> {
    return this.suppliesService.create(suppliesCreateDto);
  }

  @Get()
  @Roles('ADMIN', 'G', 'LOGIST')
  async getSupplies(
    @Query('period') period: string,
  ): Promise<SuppliesCreateDto[]> {
    if (
      !period ||
      (!/^\d{4}-\d{2}-\d{2}$/.test(period) && !/^\d{4}-\d{2}$/.test(period))
    ) {
      throw new BadRequestException(
        'Параметры period обязательны и должны быть в формате YYYY-MM-DD',
      );
    }
    return this.suppliesService.getSupplies(period);
  }

  // Delete
  @Delete(':id')
  @Roles('ADMIN', 'G', 'LOGIST')
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.suppliesService.delete(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'G', 'LOGIST')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() suppliesCreateDto: SuppliesCreateDto,
  ) {
    return this.suppliesService.update(id, suppliesCreateDto);
  }

  @Get('suppliers')
  async getSources() {
    return this.suppliesService.getSuppliers();
  }
}
