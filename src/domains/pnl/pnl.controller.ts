import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { PrismaService } from 'src/prisma/prisma.service';
import { PnlService } from './pnl.service';

@UseGuards(RolesGuard)
@Controller('pnl')
export class PnlController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pnlService: PnlService,
  ) {}

  private async getSnapshotOrThrow(type: 'neon' | 'book', period: string) {
    await this.pnlService.getDatasV2(period);
    const rows = await this.prisma.$queryRaw<Array<{ payload: unknown }>>`
      SELECT "payload"
      FROM "PnlSnapshot"
      WHERE "type" = ${type} AND "anchorPeriod" = ${period}
      LIMIT 1
    `;
    const row = rows?.[0];
    if (!row) {
      throw new NotFoundException(
        `PNL snapshot not found for type=${type} period=${period}. Run seed/cron to generate it.`,
      );
    }
    return row.payload;
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

    return this.getSnapshotOrThrow('neon', period);
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

    return this.getSnapshotOrThrow('book', period);
  }

  @Get('v2')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getDatasV2(
    @Query('period') period: string,
    // @CurrentUser() user: UserDto,
  ) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return await this.pnlService.getDatasV2(period);
  }

  @Get('new')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getDatasNew(
    @Query('period') period: string,
    // @CurrentUser() user: UserDto,
  ) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return await this.pnlService.getNewDatas(period);
  }

  // @Get('new-my')
  // @Roles('ADMIN', 'G', 'KD', 'BUKH')
  // async getDatasNewMy(
  //   @Query('period') period: string,
  //   // @CurrentUser() user: UserDto,
  // ) {
  //   if (!period || !/^\d{4}-\d{2}$/.test(period)) {
  //     throw new BadRequestException(
  //       'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
  //     );
  //   }
  //   return await this.pnlService.getMyNewDatas(period);
  // }

  @Get('dds')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getDdsData(@Query('period') period: string) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return await this.pnlService.getDdsData(period);
  }

  @Get('dds-detail')
  @Roles('ADMIN', 'G', 'KD', 'BUKH')
  async getDdsDetail(
    @Query('period') period: string,
    @Query('expenseCategoryId') expenseCategoryId: string,
    @Query('projectId') projectId?: string,
    @Query('typeOfOperation') typeOfOperation?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '200',
  ) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }

    const parsedExpenseCategoryId = Number(expenseCategoryId);
    if (!Number.isInteger(parsedExpenseCategoryId) || parsedExpenseCategoryId <= 0) {
      throw new BadRequestException(
        'Параметр expenseCategoryId обязателен и должен быть положительным числом.',
      );
    }

    let parsedProjectId: number | undefined;
    if (projectId !== undefined) {
      parsedProjectId = Number(projectId);
      if (!Number.isInteger(parsedProjectId) || parsedProjectId <= 0) {
        throw new BadRequestException(
          'Параметр projectId должен быть положительным числом.',
        );
      }
    }

    if (typeOfOperation && !['Debit', 'Credit'].includes(typeOfOperation)) {
      throw new BadRequestException(
        'Параметр typeOfOperation должен быть одним из: Debit, Credit.',
      );
    }

    const parsedPage = Number(page);
    const parsedLimit = Number(limit);
    if (!Number.isInteger(parsedPage) || parsedPage <= 0) {
      throw new BadRequestException(
        'Параметр page должен быть положительным целым числом.',
      );
    }
    if (!Number.isInteger(parsedLimit) || parsedLimit <= 0 || parsedLimit > 500) {
      throw new BadRequestException(
        'Параметр limit должен быть положительным целым числом не больше 500.',
      );
    }

    return this.pnlService.getDdsDetail({
      period,
      expenseCategoryId: parsedExpenseCategoryId,
      projectId: parsedProjectId,
      typeOfOperation,
      page: parsedPage,
      limit: parsedLimit,
    });
  }
}
