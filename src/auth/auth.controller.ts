import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Public } from './public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '@prisma/client';

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

  @Post('auth/book-editor-bridge-token')
  @ApiOperation({
    summary: 'Выдать bridge token для входа в book-editor',
    description:
      'Выдает краткоживущий токен для безопасного callback-обмена между CRM login и book-editor backend.',
  })
  async issueBookEditorBridgeToken(
    @CurrentUser() user: User,
    @Body() body?: { returnTo?: string },
  ) {
    return this.authService.createBookEditorBridgeToken(user, body?.returnTo);
  }

  @Post('auth/logout-services')
  @ApiOperation({
    summary: 'Синхронный logout во внешних сервисах (book-editor)',
    description:
      'Отзывает сессии пользователя в auth-service для подключенных сервисов. Не влияет на статус пользователя.',
  })
  async logoutServices(@CurrentUser() user: User) {
    return this.authService.logoutExternalServiceSessions(user);
  }
}
