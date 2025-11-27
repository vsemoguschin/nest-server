import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserDto } from '../users/dto/user.dto';
import { PnlService } from './pnl.service';
import { RolesGuard } from 'src/common/guards/roles.guard';

@UseGuards(RolesGuard)
@Controller('pnl')
export class PnlController {
  constructor(private readonly pnlService: PnlService) {}

  @Get('')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getPLDatas(
    @Query('period') period: string,
    @Query('project') project: string = 'neon',
    @CurrentUser() user: UserDto,
  ) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.pnlService.getPLDatas(period, project, user);
  }

  @Get('neon')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getNeonPLDatas(
    @Query('period') period: string,
    // @CurrentUser() user: UserDto,
  ) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }

    return this.pnlService.getNeonPLDatas(period);
  }

  @Get('book')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getBookPLDatas(
    @Query('period') period: string,
    // @CurrentUser() user: UserDto,
  ) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
      
    return this.pnlService.getBookPLDatas(period);
  }
}
