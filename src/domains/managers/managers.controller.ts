import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ManagersService } from './managers.service';
import { UserDto } from '../users/dto/user.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UpdatePlanDto } from './dto/plan-update.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';

@ApiTags('managers')
@Controller('managers')
@UseGuards(RolesGuard)
export class ManagersController {
  constructor(private readonly managersService: ManagersService) {}

  @Get()
  @ApiOperation({
    summary: 'Получить список менеджеров',
    description: 'Возвращает список менеджеров текущего рабочего пространства.',
  })
  @ApiResponse({
    status: 200,
    description: 'Список менеджеров успешно получен.',
  })
  async getManagers(@CurrentUser() user: UserDto) {
    return this.managersService.getManagers(user);
  }

  @Post(':managerId/plan')
  @ApiOperation({
    summary: 'Установить или обновить план менеджера',
    description:
      'Создает новый план или обновляет существующий для указанного менеджера за период.',
  })
  @ApiResponse({
    status: 201,
    description: 'План успешно создан или обновлен.',
  })
  @ApiResponse({ status: 400, description: 'Неверные данные.' })
  async setPlan(
    @Param('managerId', ParseIntPipe) managerId: number,
    @Body() updatePlanDto: UpdatePlanDto,
  ) {
    return this.managersService.setPlan(managerId, updatePlanDto);
  }

  @Patch(':managerId/change-intern-status')
  @Roles('ADMIN', 'G', 'DO', 'KD')
  async changeInternStatus(
    @Param('managerId', ParseIntPipe) managerId: number,
    @Body() update: {isIntern: boolean},
  ) {
    return this.managersService.changeInternStatus(managerId, update);
  }
}
