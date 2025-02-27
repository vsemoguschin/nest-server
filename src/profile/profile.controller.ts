import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { UserProfileDto } from './dto/user-profile.dto';
import { ProfileService } from './profile.service';

@ApiTags('profile')
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiOperation({
    summary: 'Получить профиль пользователя',
    description:
      'Возвращает информацию о текущем пользователе, который совершает запрос.',
  })
  async getProfile(@CurrentUser() user: User): Promise<UserProfileDto> {
    return this.profileService.getProfile(user.id); // Используем сервис для получения профиля
  }
}
