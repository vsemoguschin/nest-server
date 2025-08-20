import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiResponse, ApiOperation } from '@nestjs/swagger';
import { DashboardsService } from './dashboards.service';
import { WorkSpaceDto } from '../workspaces/dto/workspace.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDto } from '../users/dto/user.dto';

@ApiTags('dashboards')
@Controller('dashboards')
@UseGuards(RolesGuard)
export class DashboardsController {
  constructor(private readonly dashboardsService: DashboardsService) {}

  @Get('/workspaces')
  @ApiResponse({ status: 200, type: [WorkSpaceDto] })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'RP', 'ROV')
  async getWorkspaces(@CurrentUser() user: UserDto) {
    return this.dashboardsService.getWorkspaces(user);
  }

  @Get('/deals')
  @ApiResponse({ status: 200, type: [WorkSpaceDto] })
  @Roles(
    'ADMIN',
    'G',
    'KD',
    'DO',
    'ROP',
    'MOP',
    'ROV',
    'MOV',
    'MTZ',
    'LOGIST',
    'MARKETER',
  )
  async getDeals(@CurrentUser() user: UserDto) {
    return this.dashboardsService.getDeals(user);
  }

  @Get('/comercial')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV')
  async getComercialData(
    @CurrentUser() user: UserDto,
    @Query('period') period: string,
  ): Promise<any> {
    console.log(period);
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.dashboardsService.getComercialData(user, period);
  }

  // @Get('/managers')
  // @ApiOperation({
  //   summary: 'Получить данные менеджеров',
  //   description:
  //     'Endpoint: GET /dashboards?period=YYYY-MM. Получить данные менеджеров за указанный период.',
  // })
  // @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV')
  // @ApiResponse({
  //   status: 200,
  //   description: 'Данные менеджеров успешно получены.',
  // })
  // @ApiResponse({ status: 400, description: 'Неверный формат периода.' })
  // async getList(
  //   @CurrentUser() user: UserDto,
  //   @Query('period') period: string,
  // ): Promise<any> {
  //   console.log(period);
  //   if (!period || !/^\d{4}-\d{2}$/.test(period)) {
  //     throw new BadRequestException(
  //       'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
  //     );
  //   }
  //   return this.dashboardsService.getManagersData(user, period);
  // }

  @Get('/reports/managers')
  @ApiOperation({
    summary: 'Получить данные менеджеров',
    description:
      'Endpoint: GET /dashboards?period=YYYY-MM. Получить данные менеджеров за указанный период.',
  })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP')
  @ApiResponse({
    status: 200,
    description: 'Данные менеджеров успешно получены.',
  })
  @ApiResponse({ status: 400, description: 'Неверный формат периода.' })
  async getReports(
    @CurrentUser() user: UserDto,
    @Query('period') period: string,
  ): Promise<any> {
    // console.log(period);
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.dashboardsService.getManagersReports(user, period);
  }

  //Получить статистику за указанный период
  @Get('/statistics')
  @ApiOperation({ summary: 'Получить статистику за указанный период' })
  @Roles('ADMIN', 'G', 'KD', 'DO')
  @ApiResponse({
    status: 200,
    description: 'Статистика успешно получена.',
  })
  @ApiResponse({ status: 400, description: 'Неверный формат периода.' })
  async getStatistics(
    @CurrentUser() user: UserDto,
    @Query('period') period: string,
  ): Promise<any> {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.dashboardsService.getStatisticsByGroups(user, period);
    // return this.dashboardsService.getStatistics(user, period);
  }

  //Получить данные по выплатам за указанный период
  @Get('/pays')
  @ApiOperation({ summary: 'Получить данные по выплатам за указанный период' })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'BUKH', 'DP', 'ROD', 'ROV')
  @ApiResponse({
    status: 200,
    description: 'Данные по выплатам успешно получены.',
  })
  @ApiResponse({ status: 400, description: 'Неверный формат периода.' })
  async getPays(
    @CurrentUser() user: UserDto,
    @Query('period') period: string,
  ): Promise<any> {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new BadRequestException(
        'Параметр period обязателен и должен быть в формате YYYY-MM (например, 2025-01).',
      );
    }
    return this.dashboardsService.getPays(user, period);
  }

  //Получить всю базу
  @Get('/datas')
  async getDatas(): Promise<any> {
    return this.dashboardsService.getDatas();
  }
}
