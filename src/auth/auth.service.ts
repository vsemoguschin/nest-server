import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
// Импортируйте UsersService или репозиторий для поиска пользователя
// Здесь предполагается, что у вас есть метод validateUser, который проверяет логин/пароль
import { UsersService } from '../domains/users/users.service';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import { add } from 'date-fns';

@Injectable()
export class AuthService {
  // Установите время жизни refresh-токена, например, 7 дней.
  private readonly refreshTokenExpiresInDays = 7;

  constructor(
    private readonly userService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
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
      const { password, ...result } = user;
      // console.log(password);
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
    return { accessToken, refreshToken};
  }

  // Метод для создания refresh-токена
  async createRefreshToken(userId: number): Promise<string> {
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

    // Опционально: можно отозвать использованный refresh-токен и выдать новый
    await this.prisma.refreshToken.update({
      where: { token: refreshToken },
      data: { revoked: true },
    });
    const new_refresh_token = await this.createRefreshToken(user.id);

    return { accessToken, refreshToken: new_refresh_token };
  }
}
