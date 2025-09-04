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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
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
import { UpdateUserDto } from './dto/update-user.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { TaskFilesService } from 'src/services/boards/task-files.service';

@UseGuards(RolesGuard)
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly filesService: TaskFilesService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Создать нового пользователя' })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'ROV', 'DP', 'RP')
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
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROV', 'ROD', 'DP', 'RP')
  async deleteUser(@Param('id', ParseIntPipe) userId: number): Promise<void> {
    await this.usersService.deleteUser(userId);
  }

  @Patch(':id')
  // @UseGuards(AuthGuard) // при необходимости
  @Roles('ADMIN', 'G', 'KD', 'DO', 'DP', 'RP', 'ROD')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/new-pass')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'DP', 'RP')
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

  @Post(':id/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    }),
  )
  async uploadAvatar(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Файл не передан');

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException('Неверный формат (разрешены JPG/PNG/WebP)');
    }

    const chatId = 317401874;
    if (!chatId)
      throw new BadRequestException('TELEGRAM_UPLOAD_CHAT_ID not set');

    const avatarPath = await this.filesService.uploadAvatar(file);
    return await this.usersService.updateAvatar(id, avatarPath);
  }
}
