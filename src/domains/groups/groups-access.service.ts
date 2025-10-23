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
    'DO',
  ];

  buildGroupsScope(user: UserDto): Prisma.GroupWhereInput {
    const scope: Prisma.GroupWhereInput = {
      deletedAt: null,
      id: { gt: 0 },
    };
    if (!this.privilegedShortNames.includes(user.role.shortName)) {
      scope.id = user.groupId ?? scope.id;
    }

    if (
      user.groupId === 18 ||
      user.groupId === 3
    ) {
      scope.id = { in: [18, 3] };
    }

    if (user.groupId === 3 && user.role.shortName === 'DO') {
      scope.id = { in: [18, 3, 17, 19, 24] };
    }
    if (user.groupId !== 3 && user.role.shortName === 'DO') {
      scope.id = { in: [2, 16, user.groupId] };
    }

    if (user.id === 84 || user.id === 87) {
      scope.id = { in: [2, user.groupId] };
    }

    if (user.id === 88) {
      scope.id = { in: [3, 18, user.groupId] };
    }
    console.log(user.id, user.role.shortName, user.groupId, scope);

    return scope;
  }
}
