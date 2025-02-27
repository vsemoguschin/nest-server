import {
  Body,
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@ApiTags('roles')
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @ApiOperation({
    summary: 'Создать новую роль',
    description:
      'Endpoint: POST /roles. Создает новую роль, проверяя корректность данных и уникальность shortName.',
  })
  async createRole(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Получить список ролей',
    description: 'Endpoint: GET /roles. Возвращает список всех активных ролей.',
  })
  async getRoles() {
    return this.rolesService.findAll();
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Обновить роль',
    description:
      'Endpoint: PATCH /roles/:id. Обновляет данные роли по её id. Можно обновлять отдельные поля.',
  })
  async updateRole(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRoleDto: UpdateRoleDto,
  ) {
    return this.rolesService.update(id, updateRoleDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Удалить роль',
    description:
      'Endpoint: DELETE /roles/:id. Выполняет мягкое удаление роли, устанавливая значение deletedAt, чтобы роль не удалялась полностью из базы.',
  })
  async deleteRole(@Param('id', ParseIntPipe) id: number) {
    return this.rolesService.softDelete(id);
  }
}
