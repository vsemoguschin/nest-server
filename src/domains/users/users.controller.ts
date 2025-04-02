import {
  Body,
  Controller,
  Post,
  Get,
  Param,
  ParseIntPipe,
  Delete,
  UseGuards,
  Patch,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiNoContentResponse,
  ApiBody,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserProfileDto } from 'src/profile/dto/user-profile.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UpdatePasswordDto } from './dto/user-update-pass.dto';

@UseGuards(RolesGuard)
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Создать нового пользователя' })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'ROV')
  async createUser(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get(':id/profile')
  @ApiResponse({ status: 200, type: UserProfileDto })
  async getProfile(
    @Param('id', ParseIntPipe) userId: string,
  ): Promise<UserProfileDto> {
    return this.usersService.getProfile(+userId); // Преобразуем строку в число
  }

  @Get()
  @ApiOperation({
    summary: 'Получить список пользователей',
    description:
      'Endpoint: GET /users. Возвращает список всех активных пользователей.',
  })
  async findAll() {
    return this.usersService.findAll();
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить пользователя по ID' })
  @ApiParam({ name: 'id', type: 'integer', description: 'ID пользователя' })
  @ApiNoContentResponse({ description: 'Пользователь успешно удален' })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROV', 'ROD')
  async deleteUser(@Param('id', ParseIntPipe) userId: number): Promise<void> {
    await this.usersService.deleteUser(userId);
  }

  @Patch(':id/new-pass')
  @Roles('ADMIN', 'G', 'KD', 'DO')
  @ApiOperation({ summary: 'Обновить пароль пользователя' })
  @ApiParam({ name: 'id', type: 'integer', description: 'ID пользователя' })
  @ApiBody({
    description: 'Новый пароль',
    schema: {
      type: 'object',
      properties: {
        newPass: { type: 'string', example: 'newPassword123' },
      },
    },
  })
  @ApiNoContentResponse({ description: 'Пароль успешно обновлен' })
  async updatePassword(
    @Param('id', ParseIntPipe) userId: number,
    @Body() updatePasswordDto: UpdatePasswordDto,
  ): Promise<void> {
    await this.usersService.updatePassword(userId, updatePasswordDto.newPass);
  }
}
