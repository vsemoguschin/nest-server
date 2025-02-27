import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './jwt-payload.interface';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'SECRET_KEY',
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub }, // payload.sub обычно содержит ID пользователя
      include: {
        role: true, // Включаем роль
      },
    });

    if (!user) {
      throw new UnauthorizedException('Пользователь не найден');
    }
    // console.log(user);
    return user;
  }
}
