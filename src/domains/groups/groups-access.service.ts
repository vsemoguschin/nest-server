import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserDto } from '../users/dto/user.dto';

@Injectable()
export class GroupsAccessService {
  private readonly privilegedShortNames = [
    'ADMIN',
    'G',
    'KD',
    'ROV',
    'MOV',
    'MARKETER',
    'LOGIST',
  ];

  buildGroupsScope(user: UserDto): Prisma.GroupWhereInput {
    const scope: Prisma.GroupWhereInput = {
      deletedAt: null,
      id: { gt: 0 },
    };

    if (!this.privilegedShortNames.includes(user.role.shortName)) {
      scope.id = user.groupId ?? scope.id;
    }

    if (user.groupId === 18 || user.groupId === 3) {
      scope.id = { in: [2, 3] };
    }

    if (user.id === 84 || user.id === 87) {
      scope.id = 2;
    }

    if (user.id === 88) {
      scope.id = { in: [3, 18] };
    }

    return scope;
  }
}
