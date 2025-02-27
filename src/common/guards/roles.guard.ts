import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true; // Если роли не указаны, доступ разрешён
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      throw new UnauthorizedException('Пользователь не авторизован');
    }

    // Проверяем, есть ли у пользователя необходимая роль
    const hasRole = requiredRoles.some((role) => user.role.shortName === role);

    if (!hasRole) {
      throw new UnauthorizedException('Недостаточно прав для доступа');
    }

    return true;
  }
}
