import {
  Body,
  Controller,
  Post,
  Get,
  Param,
  ParseIntPipe,
  Delete,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UserProfileDto } from 'src/profile/dto/user-profile.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Создать нового пользователя' })
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
  async deleteUser(@Param('id', ParseIntPipe) userId: number): Promise<void> {
    await this.usersService.deleteUser(userId);
  }
}
