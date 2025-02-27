import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';
import { RefreshDto } from './dto/refresh.dto';

@ApiTags('auth')
@Controller('/') // Если хотите, чтобы URL был /api/login (при глобальном префиксе "api")
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Public()
  @Post('login')
  @ApiOperation({
    summary: 'Логин пользователя',
    description:
      'Принимает email и пароль, возвращает JWT-токен при успешной аутентификации.',
  })
  async login(@Body() loginDto: LoginDto) {
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );
    if (!user) {
      throw new UnauthorizedException('Неверные учетные данные');
    }
    return this.authService.login(user);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({
    summary: 'Обновление access-токена',
    description: 'Принимает refresh-токен и возвращает новый access-токен.',
  })
  async refresh(@Body() refreshDto: RefreshDto) {
    return this.authService.refresh(refreshDto.refreshToken);
  }
}
