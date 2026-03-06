import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ListCrmCustomersQueryDto } from './dto/list-crm-customers.query.dto';

type CursorPayload = {
  updatedAt: string;
  id: number;
};

@Injectable()
export class CrmCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeBase64Input(input: string): string {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padLength = (4 - (normalized.length % 4)) % 4;
    return normalized + '='.repeat(padLength);
  }

  private decodeCursor(cursor?: string): CursorPayload | null {
    if (!cursor) return null;
    try {
      const json = Buffer.from(this.normalizeBase64Input(cursor), 'base64')
        .toString('utf-8')
        .trim();
      const parsed = JSON.parse(json) as CursorPayload;
      const date = new Date(parsed.updatedAt);
      if (!Number.isFinite(date.getTime()) || !Number.isInteger(parsed.id)) {
        throw new Error('Invalid cursor payload');
      }
      return { updatedAt: date.toISOString(), id: parsed.id };
    } catch {
      throw new BadRequestException('Некорректный параметр cursor');
    }
  }

  private encodeCursor(payload: CursorPayload): string {
    return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  }

  private buildWhere(
    query: ListCrmCustomersQueryDto,
    cursor: CursorPayload | null,
  ): Prisma.CrmCustomerWhereInput {
    const andWhere: Prisma.CrmCustomerWhereInput[] = [];

    if (query.accountId) {
      andWhere.push({
        accountId: query.accountId,
      });
    }

    if (query.q) {
      andWhere.push({
        fullName: { contains: query.q, mode: 'insensitive' },
      });
    }

    if (Array.isArray(query.statusIds) && query.statusIds.length > 0) {
      andWhere.push({
        crmStatusId: {
          in: query.statusIds,
        },
      });
    }

    if (Array.isArray(query.tagIds) && query.tagIds.length > 0) {
      andWhere.push({
        tags: {
          some: {
            tagId: {
              in: query.tagIds,
            },
          },
        },
      });
    }

    if (Array.isArray(query.managerIds) && query.managerIds.length > 0) {
      andWhere.push({
        managerId: {
          in: query.managerIds,
        },
      });
    }

    if (cursor) {
      andWhere.push({
        OR: [
          { updatedAt: { lt: new Date(cursor.updatedAt) } },
          {
            AND: [{ updatedAt: new Date(cursor.updatedAt) }, { id: { lt: cursor.id } }],
          },
        ],
      });
    }

    if (!andWhere.length) return {};
    if (andWhere.length === 1) return andWhere[0];
    return { AND: andWhere };
  }

  private mapCrmTags(
    tags: Array<{
      tag: {
        id: number;
        name: string | null;
        color: string | null;
        textColor: string | null;
      } | null;
    }> = [],
  ) {
    return tags
      .map((item) => item.tag)
      .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag))
      .map((tag) => ({
        id: tag.id,
        name: tag.name ?? '',
        color: tag.color ?? '',
        textColor: tag.textColor ?? '',
      }));
  }

  private mapListItem(row: {
    id: number;
    externalId: string | null;
    fullName: string | null;
    photoUrl: string | null;
    firstContactDate: string | null;
    lastContactDate: string | null;
    nextContactDate: string | null;
    vk: { externalId: string } | null;
    city: { name: string } | null;
    source: { name: string } | null;
    salesChannel: { name: string } | null;
    manager: { fullName: string } | null;
    crmStatus: { name: string; color: string } | null;
    tags: Array<{
      tag: {
        id: number;
        name: string | null;
        color: string | null;
        textColor: string | null;
      } | null;
    }>;
  }) {
    const { city, source, salesChannel, manager, crmStatus, tags, vk } = row;

    return {
      id: row.id,
      externalId: row.externalId ?? '',
      fullName: row.fullName ?? '',
      photoUrl: row.photoUrl ?? '',
      firstContactDate: row.firstContactDate ?? '',
      lastContactDate: row.lastContactDate ?? '',
      nextContactDate: row.nextContactDate ?? '',
      vkExternalId: vk?.externalId ?? '',
      cityName: city?.name ?? '',
      sourceName: source?.name ?? '',
      salesChannelName: salesChannel?.name ?? '',
      managerName: manager?.fullName ?? '',
      crmStatusName: crmStatus?.name ?? '',
      crmStatusColor: crmStatus?.color ?? '',
      crmTags: this.mapCrmTags(tags),
    };
  }

  async list(query: ListCrmCustomersQueryDto) {
    const take = query.limit ?? 30;
    const decodedCursor = this.decodeCursor(query.cursor);
    const whereWithCursor = this.buildWhere(query, decodedCursor);
    const whereWithoutCursor = this.buildWhere(query, null);

    const [rows, total] = await Promise.all([
      this.prisma.crmCustomer.findMany({
        where: whereWithCursor,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
        select: {
          id: true,
          externalId: true,
          fullName: true,
          photoUrl: true,
          firstContactDate: true,
          lastContactDate: true,
          nextContactDate: true,
          vk: {
            select: {
              externalId: true,
            },
          },
          city: {
            select: {
              name: true,
            },
          },
          source: {
            select: {
              name: true,
            },
          },
          salesChannel: {
            select: {
              name: true,
            },
          },
          manager: {
            select: {
              fullName: true,
            },
          },
          crmStatus: {
            select: {
              name: true,
              color: true,
            },
          },
          tags: {
            select: {
              tag: {
                select: {
                  id: true,
                  name: true,
                  color: true,
                  textColor: true,
                },
              },
            },
          },
          updatedAt: true,
        },
      }),
      this.prisma.crmCustomer.count({
        where: whereWithoutCursor,
      }),
    ]);

    const hasMore = rows.length > take;
    const pageRows = hasMore ? rows.slice(0, take) : rows;
    const items = pageRows.map((row) => this.mapListItem(row));

    const lastRow = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && lastRow
        ? this.encodeCursor({
            updatedAt: lastRow.updatedAt.toISOString(),
            id: lastRow.id,
          })
        : null;

    return {
      items,
      nextCursor,
      hasMore,
      meta: {
        limit: take,
        total,
      },
    };
  }

  async getOne(id: number) {
    const row = await this.prisma.crmCustomer.findFirst({
      where: {
        id,
      },
      select: {
        id: true,
        externalId: true,
        fullName: true,
        photoUrl: true,
        birthday: true,
        sex: true,
        phone: true,
        email: true,
        address: true,
        otherContacts: true,
        firstContactDate: true,
        lastContactDate: true,
        nextContactDate: true,
        shortNotes: true,
        comments: true,
        account: {
          select: {
            name: true,
            code: true,
          },
        },
        country: {
          select: {
            name: true,
          },
        },
        city: {
          select: {
            name: true,
          },
        },
        source: {
          select: {
            name: true,
          },
        },
        salesChannel: {
          select: {
            name: true,
          },
        },
        manager: {
          select: {
            fullName: true,
          },
        },
        crmStatus: {
          select: {
            name: true,
            color: true,
          },
        },
        vk: {
          select: {
            externalId: true,
            name: true,
            messagesGroupId: true,
          },
        },
        avito: {
          select: {
            externalId: true,
            name: true,
            chatId: true,
          },
        },
        tags: {
          select: {
            tag: {
              select: {
                id: true,
                name: true,
                color: true,
                textColor: true,
              },
            },
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException('CRM-клиент не найден');
    }

    return {
      ...this.mapListItem(row),
      birthday: row.birthday ?? '',
      sex: row.sex ?? '',
      phone: row.phone ?? '',
      email: row.email ?? '',
      address: row.address ?? '',
      otherContacts: row.otherContacts ?? '',
      shortNotes: row.shortNotes ?? '',
      comments: row.comments ?? '',
      accountName: row.account?.name ?? '',
      accountCode: row.account?.code ?? '',
      countryName: row.country?.name ?? '',
      vkName: row.vk?.name ?? '',
      vkMessagesGroupId: row.vk?.messagesGroupId ?? '',
      avitoExternalId: row.avito?.externalId ?? '',
      avitoName: row.avito?.name ?? '',
      avitoChatId: row.avito?.chatId ?? '',
    };
  }

  async listFilters(accountId?: number) {
    const accounts = await this.prisma.crmAccount.findMany({
      where: {
        customers: {
          some: {},
        },
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
      orderBy: [{ id: 'asc' }],
    });

    const statusesWhere = accountId
      ? ({ accountId } satisfies Prisma.CrmStatusWhereInput)
      : ({} satisfies Prisma.CrmStatusWhereInput);
    const tagsWhere = accountId
      ? ({ accountId } satisfies Prisma.CrmTagWhereInput)
      : ({} satisfies Prisma.CrmTagWhereInput);
    const managersWhere = {
      ...(accountId ? { accountId } : {}),
      customers: {
        some: accountId ? { accountId } : {},
      },
    } satisfies Prisma.CrmManagerWhereInput;

    const [statuses, tags, managers] = await Promise.all([
      this.prisma.crmStatus.findMany({
        where: statusesWhere,
        select: {
          id: true,
          name: true,
          color: true,
          type: true,
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.crmTag.findMany({
        where: tagsWhere,
        select: {
          id: true,
          name: true,
          color: true,
          textColor: true,
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.crmManager.findMany({
        where: managersWhere,
        select: {
          id: true,
          fullName: true,
        },
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return {
      accounts,
      statuses,
      tags,
      managers,
    };
  }
}
