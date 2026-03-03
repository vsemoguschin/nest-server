import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ListCrmCustomersQueryDto } from './dto/list-crm-customers.query.dto';

type CursorPayload = {
  updatedAt: string;
  id: number;
};

@Injectable()
export class CrmCustomersService {
  private readonly accountCode =
    process.env.CRM_ACCOUNT_CODE || process.env.BLUESALES_ACCOUNT_CODE || 'main';
  private readonly accountName =
    process.env.CRM_ACCOUNT_NAME || `BlueSales ${this.accountCode}`;
  private accountIdCache: number | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async getAccountId(): Promise<number> {
    if (Number.isInteger(this.accountIdCache) && this.accountIdCache! > 0) {
      return this.accountIdCache!;
    }

    const account = await this.prisma.crmAccount.upsert({
      where: { code: this.accountCode },
      update: {
        name: this.accountName,
        isActive: true,
      },
      create: {
        code: this.accountCode,
        name: this.accountName,
        isActive: true,
      },
      select: { id: true },
    });

    this.accountIdCache = account.id;
    return account.id;
  }

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
    accountId: number,
  ): Prisma.CrmCustomerWhereInput {
    const andWhere: Prisma.CrmCustomerWhereInput[] = [{ accountId }];

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

  async list(query: ListCrmCustomersQueryDto) {
    const take = query.limit ?? 30;
    const accountId = await this.getAccountId();
    const decodedCursor = this.decodeCursor(query.cursor);
    const whereWithCursor = this.buildWhere(query, decodedCursor, accountId);
    const whereWithoutCursor = this.buildWhere(query, null, accountId);

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
    const items = pageRows.map((row) => {
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
        crmTags: (tags || [])
          .map((item) => item.tag)
          .filter((tag): tag is NonNullable<typeof tag> => Boolean(tag))
          .map((tag) => ({
            id: tag.id,
            name: tag.name ?? '',
            color: tag.color ?? '',
            textColor: tag.textColor ?? '',
          })),
      };
    });

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

  async listFilters() {
    const accountId = await this.getAccountId();

    const [
      statuses,
      tags,
      managers,
      cityRows,
      countriesTotal,
      sourcesTotal,
      salesChannelsTotal,
      vkTotal,
      avitoTotal,
    ] = await Promise.all([
      this.prisma.crmStatus.findMany({
        where: {
          accountId,
        },
        select: {
          id: true,
          name: true,
          color: true,
          type: true,
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.crmTag.findMany({
        where: {
          accountId,
        },
        select: {
          id: true,
          name: true,
          color: true,
          textColor: true,
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.crmManager.findMany({
        where: {
          accountId,
          customers: {
            some: {},
          },
        },
        select: {
          id: true,
          fullName: true,
        },
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.crmCity.findMany({
        where: {
          accountId,
        },
        select: {
          id: true,
          name: true,
          customers: {
            where: {
              accountId,
              countryId: { not: null },
            },
            select: {
              country: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.crmCountry.count({ where: { accountId } }),
      this.prisma.crmSource.count({ where: { accountId } }),
      this.prisma.crmSalesChannel.count({ where: { accountId } }),
      this.prisma.crmVk.count({ where: { accountId } }),
      this.prisma.crmAvito.count({ where: { accountId } }),
    ]);

    const cities = cityRows.map((city) => {
      const countriesMap = new Map<number, { id: number; name: string }>();

      for (const customer of city.customers) {
        const country = customer.country;
        if (!country) continue;
        countriesMap.set(country.id, {
          id: country.id,
          name: country.name ?? '',
        });
      }

      const countries = Array.from(countriesMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name, 'ru'),
      );

      return {
        id: city.id,
        name: city.name,
        countries,
      };
    });

    return {
      statuses,
      tags,
      managers,
      cities,
      totals: {
        statuses: statuses.length,
        tags: tags.length,
        countries: countriesTotal,
        cities: cities.length,
        sources: sourcesTotal,
        salesChannels: salesChannelsTotal,
        managers: managers.length,
        vk: vkTotal,
        avito: avitoTotal,
      },
    };
  }
}
