import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Cron } from '@nestjs/schedule';
// Импортируйте UsersService или репозиторий для поиска пользователя
// Здесь предполагается, что у вас есть метод validateUser, который проверяет логин/пароль
import { UsersService } from '../domains/users/users.service';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import { add } from 'date-fns';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // Установите время жизни refresh-токена, например, 7 дней.
  private readonly refreshTokenExpiresInDays = 7;

  constructor(
    private readonly userService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}
  // Метод для проверки пользователя (например, по email и паролю)
  async validateUser(
    email: string,
    password: string,
  ): Promise<Omit<User, 'password'> | null> {
    const user = await this.userService.findByEmail(email);
    if (
      user &&
      (await this.userService.comparePasswords(password, user.password))
    ) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password: _, ...result } = user;
      return result;
    }
    return null;
  }

  // Метод для генерации JWT-токена
  async login(user: Omit<User, 'password'>) {
    const payload = { email: user.email, sub: user.id };
    const accessToken = this.jwtService.sign(payload);
    // Создаем новый refresh-токен
    const refreshToken = await this.createRefreshToken(user.id);
    return { accessToken, refreshToken };
  }

  // Метод для создания refresh-токена
  async createRefreshToken(userId: number): Promise<string> {
    // Удаляем истекшие и отозванные токены пользователя
    await this.prisma.refreshToken.deleteMany({
      where: {
        userId,
        OR: [
          { expiresAt: { lt: new Date() } }, // Истекшие
          { revoked: true }, // Отозванные
        ],
      },
    });

    // Ограничиваем количество активных токенов (максимум 5 на пользователя)
    const activeTokens = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Удаляем старые активные токены, оставляя только последние 4
    if (activeTokens.length >= 5) {
      const tokensToDelete = activeTokens.slice(4);
      await this.prisma.refreshToken.deleteMany({
        where: {
          id: { in: tokensToDelete.map((t) => t.id) },
        },
      });
    }

    // Генерируем случайный токен (например, 64-байтовый в hex)
    const token = crypto.randomBytes(64).toString('hex');
    // Определяем дату истечения: сейчас + refreshTokenExpiresInDays
    const expiresAt = add(new Date(), { days: this.refreshTokenExpiresInDays });
    // Сохраняем токен в базе данных
    await this.prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt,
      },
    });
    return token;
  }

  // Метод для обновления access-токена по refresh-токену
  async refresh(refreshToken: string) {
    // Ищем refresh-токен в базе
    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!tokenRecord || tokenRecord.revoked) {
      throw new UnauthorizedException('Refresh token не найден или отозван');
    }

    // Проверяем срок действия
    if (new Date() > tokenRecord.expiresAt) {
      throw new UnauthorizedException('Refresh token истек');
    }

    // Получаем пользователя
    const user = await this.userService.findById(tokenRecord.userId);
    if (!user) {
      throw new UnauthorizedException('Пользователь не найден');
    }

    // Генерируем новый access-токен
    const payload = { email: user.email, sub: user.id };
    const accessToken = this.jwtService.sign(payload);

    // Удаляем использованный токен вместо пометки как revoked
    // Используем deleteMany вместо delete, чтобы избежать ошибки при параллельных запросах
    await this.prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });
    const new_refresh_token = await this.createRefreshToken(user.id);

    return { accessToken, refreshToken: new_refresh_token };
  }

  async createBookEditorBridgeToken(user: Pick<User, 'id'>, returnTo?: string) {
    const secret = (process.env.BOOK_EDITOR_BRIDGE_SECRET || '').trim();
    if (!secret) {
      throw new UnauthorizedException('BOOK_EDITOR_BRIDGE_SECRET не настроен');
    }

    const issuer = (process.env.BOOK_EDITOR_BRIDGE_ISSUER || 'crm-core').trim() || 'crm-core';
    const audience =
      (process.env.BOOK_EDITOR_BRIDGE_AUDIENCE || 'book-editor-backend').trim() ||
      'book-editor-backend';
    const expiresIn = (process.env.BOOK_EDITOR_BRIDGE_TTL || '60s').trim() || '60s';

    const safeReturnTo =
      typeof returnTo === 'string' && returnTo.trim().startsWith('/')
        ? returnTo.trim()
        : '/';

    const token = await this.jwtService.signAsync(
      {
        userId: String(user.id),
        rt: safeReturnTo,
      },
      {
        secret,
        algorithm: 'HS256',
        issuer,
        audience,
        subject: String(user.id),
        expiresIn,
        jwtid: crypto.randomUUID(),
      },
    );

    return {
      token,
      tokenType: 'Bearer',
      expiresIn,
      userId: String(user.id),
      returnTo: safeReturnTo,
    };
  }

  async logoutExternalServiceSessions(user: Pick<User, 'id'>) {
    const baseUrl = (this.configService.get<string>('AUTH_SERVICE_BASE_URL') ?? '').trim();
    const apiKey = (this.configService.get<string>('AUTH_INTERNAL_API_KEY') ?? '').trim();
    const enabled = (this.configService.get<string>('AUTH_SERVICE_SYNC_ENABLED') ?? 'true')
      .trim()
      .toLowerCase();

    if (enabled === 'false') {
      return {
        ok: true,
        skipped: true,
        reason: 'auth_sync_disabled',
      };
    }

    if (!baseUrl || !apiKey) {
      this.logger.warn(
        'logoutExternalServiceSessions skipped: AUTH_SERVICE_BASE_URL or AUTH_INTERNAL_API_KEY is not configured',
      );
      return {
        ok: true,
        skipped: true,
        reason: 'auth_service_not_configured',
      };
    }

    const timeoutMs = Number(
      this.configService.get<string>('AUTH_SERVICE_SYNC_TIMEOUT_MS') ?? '3000',
    );
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Number.isFinite(timeoutMs) ? timeoutMs : 3000,
    );

    try {
      const response = await fetch(new URL('/auth/internal/users/revoke-sessions', baseUrl).toString(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-auth-internal-key': apiKey,
        },
        body: JSON.stringify({
          userId: String(user.id),
          reason: 'logout_all',
          initiatorId: String(user.id),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        this.logger.warn(
          `logoutExternalServiceSessions failed ${response.status}: ${text || '<empty response>'}`,
        );
        return {
          ok: false,
          status: response.status,
          error: 'auth_service_revoke_failed',
        };
      }

      const data = await response.json().catch(() => null);
      return {
        ok: true,
        revoked: true,
        userId: String(user.id),
        authService: data,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`logoutExternalServiceSessions request error: ${message}`);
      return {
        ok: false,
        error: 'auth_service_revoke_request_error',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  // Метод для периодической очистки истекших и отозванных токенов
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } }, // Истекшие
          { revoked: true }, // Отозванные
        ],
      },
    });
    this.logger.log(
      `Очищено ${result.count} истекших/отозванных refresh токенов`,
    );
    return result.count;
  }

  // Периодическая очистка токенов каждый день в 3:00 по UTC
  @Cron('0 0 3 * * *', { timeZone: 'UTC' })
  async scheduledCleanup() {
    if (process.env.NODE_ENV === 'development') {
      this.logger.debug(`[dev] skip scheduledCleanup`);
      return;
    }
    this.logger.log('Запуск периодической очистки refresh токенов...');
    try {
      const deletedCount = await this.cleanupExpiredTokens();
      this.logger.log(
        `Периодическая очистка завершена. Удалено токенов: ${deletedCount}`,
      );
    } catch (error) {
      this.logger.error(
        `Ошибка при очистке токенов: ${error.message}`,
        error.stack,
      );
    }
  }
}
