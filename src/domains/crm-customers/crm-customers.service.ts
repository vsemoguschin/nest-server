import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCrmStatusDto } from './dto/create-crm-status.dto';
import { CreateCrmTagDto } from './dto/create-crm-tag.dto';
import { ListCrmCustomersQueryDto } from './dto/list-crm-customers.query.dto';
import { UpdateCrmStatusDto } from './dto/update-crm-status.dto';
import { UpdateCrmTagDto } from './dto/update-crm-tag.dto';
import { UpdateCrmCustomerDto } from './dto/update-crm-customer.dto';

type CursorPayload = {
  updatedAt: string;
  id: number;
};

@Injectable()
export class CrmCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeOptionalAccountId(accountId?: number): number | null {
    return Number.isInteger(accountId) && Number(accountId) > 0
      ? Number(accountId)
      : null;
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
        accountId: true,
        countryId: true,
        cityId: true,
        crmStatusId: true,
        sourceId: true,
        salesChannelId: true,
        managerId: true,
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
      accountId: row.accountId ?? null,
      countryId: row.countryId ?? null,
      cityId: row.cityId ?? null,
      crmStatusId: row.crmStatusId ?? null,
      sourceId: row.sourceId ?? null,
      salesChannelId: row.salesChannelId ?? null,
      managerId: row.managerId ?? null,
      tagIds: this.mapCrmTags(row.tags).map((tag) => tag.id),
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

  async updateCustomer(id: number, dto: UpdateCrmCustomerDto) {
    const customer = await this.prisma.crmCustomer.findUnique({
      where: { id },
      select: {
        id: true,
        accountId: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('CRM-клиент не найден');
    }

    if (!customer.accountId) {
      throw new BadRequestException('У CRM-клиента не указан аккаунт');
    }

    const accountId = customer.accountId;

    const relationChecks: Promise<unknown>[] = [];

    const ensureBelongsToAccount = async (
      loader: () => Promise<{ id: number; accountId: number | null } | null>,
      entityLabel: string,
    ) => {
      const entity = await loader();

      if (!entity) {
        throw new NotFoundException(`${entityLabel} не найден`);
      }

      if (entity.accountId !== accountId) {
        throw new BadRequestException(
          `${entityLabel} не принадлежит аккаунту клиента`,
        );
      }
    };

    if (typeof dto.countryId === 'number') {
      relationChecks.push(
        ensureBelongsToAccount(
          () =>
            this.prisma.crmCountry.findUnique({
              where: { id: dto.countryId },
              select: { id: true, accountId: true },
            }),
          'Страна',
        ),
      );
    }

    if (typeof dto.cityId === 'number') {
      relationChecks.push(
        ensureBelongsToAccount(
          () =>
            this.prisma.crmCity.findUnique({
              where: { id: dto.cityId },
              select: { id: true, accountId: true },
            }),
          'Город',
        ),
      );
    }

    if (typeof dto.crmStatusId === 'number') {
      relationChecks.push(
        ensureBelongsToAccount(
          () =>
            this.prisma.crmStatus.findUnique({
              where: { id: dto.crmStatusId },
              select: { id: true, accountId: true },
            }),
          'CRM-статус',
        ),
      );
    }

    if (typeof dto.sourceId === 'number') {
      relationChecks.push(
        ensureBelongsToAccount(
          () =>
            this.prisma.crmSource.findUnique({
              where: { id: dto.sourceId },
              select: { id: true, accountId: true },
            }),
          'Источник',
        ),
      );
    }

    if (typeof dto.salesChannelId === 'number') {
      relationChecks.push(
        ensureBelongsToAccount(
          () =>
            this.prisma.crmSalesChannel.findUnique({
              where: { id: dto.salesChannelId },
              select: { id: true, accountId: true },
            }),
          'Канал продаж',
        ),
      );
    }

    if (typeof dto.managerId === 'number') {
      relationChecks.push(
        ensureBelongsToAccount(
          () =>
            this.prisma.crmManager.findUnique({
              where: { id: dto.managerId },
              select: { id: true, accountId: true },
            }),
          'Менеджер',
        ),
      );
    }

    let normalizedTagIds: number[] | undefined;
    if (Array.isArray(dto.tagIds)) {
      normalizedTagIds = Array.from(
        new Set(dto.tagIds.filter((tagId) => Number.isInteger(tagId) && tagId > 0)),
      );

      relationChecks.push(
        (async () => {
          if (!normalizedTagIds) {
            return;
          }

          const tags = await this.prisma.crmTag.findMany({
            where: {
              id: {
                in: normalizedTagIds,
              },
            },
            select: {
              id: true,
              accountId: true,
            },
          });

          if (tags.length !== normalizedTagIds.length) {
            throw new NotFoundException('Один или несколько CRM-тегов не найдены');
          }

          if (tags.some((tag) => tag.accountId !== accountId)) {
            throw new BadRequestException(
              'Один или несколько CRM-тегов не принадлежат аккаунту клиента',
            );
          }
        })(),
      );
    }

    await Promise.all(relationChecks);

    const data: Prisma.CrmCustomerUpdateInput = {};

    if (typeof dto.fullName === 'string') data.fullName = dto.fullName;
    if (typeof dto.birthday === 'string') data.birthday = dto.birthday;
    if (typeof dto.sex === 'string') data.sex = dto.sex;
    if (typeof dto.phone === 'string') data.phone = dto.phone;
    if (typeof dto.email === 'string') data.email = dto.email;
    if (typeof dto.address === 'string') data.address = dto.address;
    if (typeof dto.otherContacts === 'string') data.otherContacts = dto.otherContacts;
    if (typeof dto.firstContactDate === 'string') {
      data.firstContactDate = dto.firstContactDate;
    }
    if (typeof dto.lastContactDate === 'string') {
      data.lastContactDate = dto.lastContactDate;
    }
    if (typeof dto.nextContactDate === 'string') {
      data.nextContactDate = dto.nextContactDate;
    }
    if (typeof dto.shortNotes === 'string') data.shortNotes = dto.shortNotes;
    if (typeof dto.comments === 'string') data.comments = dto.comments;
    if (typeof dto.countryId === 'number') data.country = { connect: { id: dto.countryId } };
    if (typeof dto.cityId === 'number') data.city = { connect: { id: dto.cityId } };
    if (typeof dto.crmStatusId === 'number') {
      data.crmStatus = { connect: { id: dto.crmStatusId } };
    }
    if (typeof dto.sourceId === 'number') data.source = { connect: { id: dto.sourceId } };
    if (typeof dto.salesChannelId === 'number') {
      data.salesChannel = { connect: { id: dto.salesChannelId } };
    }
    if (typeof dto.managerId === 'number') data.manager = { connect: { id: dto.managerId } };
    await this.prisma.$transaction(async (tx) => {
      await tx.crmCustomer.update({
        where: { id },
        data,
      });

      if (normalizedTagIds) {
        await tx.crmCustomerTag.deleteMany({
          where: { customerId: id },
        });

        if (normalizedTagIds.length > 0) {
          await tx.crmCustomerTag.createMany({
            data: normalizedTagIds.map((tagId) => ({
              accountId,
              customerId: id,
              tagId,
            })),
          });
        }
      }
    });

    return this.getOne(id);
  }

  async listFilterAccounts() {
    const accounts = await this.prisma.crmAccount.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        code: true,
        name: true,
      },
      orderBy: [{ id: 'asc' }],
    });

    return accounts;
  }

  async listDictionaryStatuses(accountId?: number) {
    const normalizedAccountId = this.normalizeOptionalAccountId(accountId);
    const statusesWhere = normalizedAccountId
      ? ({ accountId: normalizedAccountId } satisfies Prisma.CrmStatusWhereInput)
      : ({} satisfies Prisma.CrmStatusWhereInput);

    return this.prisma.crmStatus.findMany({
      where: statusesWhere,
      select: {
        id: true,
        name: true,
        color: true,
        type: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async createDictionaryStatus(dto: CreateCrmStatusDto) {
    const account = await this.prisma.crmAccount.findUnique({
      where: { id: dto.accountId },
      select: { id: true },
    });

    if (!account) {
      throw new NotFoundException('CRM-аккаунт не найден');
    }

    return this.prisma.crmStatus.create({
      data: {
        accountId: dto.accountId,
        name: dto.name,
        color: dto.color,
        type: dto.type,
      },
      select: {
        id: true,
        name: true,
        color: true,
        type: true,
      },
    });
  }

  async updateDictionaryStatus(id: number, dto: UpdateCrmStatusDto) {
    const current = await this.prisma.crmStatus.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!current) {
      throw new NotFoundException('CRM-статус не найден');
    }

    const data: Prisma.CrmStatusUpdateInput = {};

    if (typeof dto.name === 'string') {
      data.name = dto.name;
    }

    if (typeof dto.color === 'string') {
      data.color = dto.color;
    }

    if (typeof dto.type === 'number') {
      data.type = dto.type;
    }

    if (typeof dto.accountId === 'number') {
      const account = await this.prisma.crmAccount.findUnique({
        where: { id: dto.accountId },
        select: { id: true },
      });

      if (!account) {
        throw new NotFoundException('CRM-аккаунт не найден');
      }

      data.account = {
        connect: {
          id: dto.accountId,
        },
      };
    }

    return this.prisma.crmStatus.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        color: true,
        type: true,
      },
    });
  }

  async deleteDictionaryStatus(id: number) {
    const current = await this.prisma.crmStatus.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!current) {
      throw new NotFoundException('CRM-статус не найден');
    }

    const linkedCustomersCount = await this.prisma.crmCustomer.count({
      where: { crmStatusId: id },
    });

    if (linkedCustomersCount > 0) {
      throw new BadRequestException(
        'Нельзя удалить CRM-статус, который используется в клиентах',
      );
    }

    await this.prisma.crmStatus.delete({
      where: { id },
    });

    return { success: true };
  }

  async listDictionaryTags(accountId?: number) {
    const normalizedAccountId = this.normalizeOptionalAccountId(accountId);
    const tagsWhere = normalizedAccountId
      ? ({ accountId: normalizedAccountId } satisfies Prisma.CrmTagWhereInput)
      : ({} satisfies Prisma.CrmTagWhereInput);

    return this.prisma.crmTag.findMany({
      where: tagsWhere,
      select: {
        id: true,
        name: true,
        color: true,
        textColor: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async createDictionaryTag(dto: CreateCrmTagDto) {
    const account = await this.prisma.crmAccount.findUnique({
      where: { id: dto.accountId },
      select: { id: true },
    });

    if (!account) {
      throw new NotFoundException('CRM-аккаунт не найден');
    }

    return this.prisma.crmTag.create({
      data: {
        accountId: dto.accountId,
        name: dto.name,
        color: dto.color,
        textColor: dto.textColor,
      },
      select: {
        id: true,
        name: true,
        color: true,
        textColor: true,
      },
    });
  }

  async updateDictionaryTag(id: number, dto: UpdateCrmTagDto) {
    const current = await this.prisma.crmTag.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!current) {
      throw new NotFoundException('CRM-тег не найден');
    }

    const data: Prisma.CrmTagUpdateInput = {};

    if (typeof dto.name === 'string') {
      data.name = dto.name;
    }

    if (typeof dto.color === 'string') {
      data.color = dto.color;
    }

    if (typeof dto.textColor === 'string') {
      data.textColor = dto.textColor;
    }

    if (typeof dto.accountId === 'number') {
      const account = await this.prisma.crmAccount.findUnique({
        where: { id: dto.accountId },
        select: { id: true },
      });

      if (!account) {
        throw new NotFoundException('CRM-аккаунт не найден');
      }

      data.account = {
        connect: {
          id: dto.accountId,
        },
      };
    }

    return this.prisma.crmTag.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        color: true,
        textColor: true,
      },
    });
  }

  async deleteDictionaryTag(id: number) {
    const current = await this.prisma.crmTag.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!current) {
      throw new NotFoundException('CRM-тег не найден');
    }

    const linkedCustomersCount = await this.prisma.crmCustomerTag.count({
      where: { tagId: id },
    });

    if (linkedCustomersCount > 0) {
      throw new BadRequestException(
        'Нельзя удалить CRM-тег, который используется в клиентах',
      );
    }

    await this.prisma.crmTag.delete({
      where: { id },
    });

    return { success: true };
  }

  async listDictionaryCountries(accountId?: number) {
    const normalizedAccountId = this.normalizeOptionalAccountId(accountId);
    const countriesWhere = normalizedAccountId
      ? ({ accountId: normalizedAccountId } satisfies Prisma.CrmCountryWhereInput)
      : ({} satisfies Prisma.CrmCountryWhereInput);

    return this.prisma.crmCountry.findMany({
      where: countriesWhere,
      select: {
        id: true,
        name: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async listDictionaryCities(accountId?: number) {
    const normalizedAccountId = this.normalizeOptionalAccountId(accountId);
    const citiesWhere = normalizedAccountId
      ? ({ accountId: normalizedAccountId } satisfies Prisma.CrmCityWhereInput)
      : ({} satisfies Prisma.CrmCityWhereInput);

    const cities = await this.prisma.crmCity.findMany({
      where: citiesWhere,
      select: {
        id: true,
        name: true,
        customers: {
          where: normalizedAccountId
            ? { accountId: normalizedAccountId }
            : undefined,
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
    });

    return cities.map((city) => {
      const countries = Array.from(
        new Map(
          city.customers
            .map((customer) => customer.country)
            .filter(
              (
                country,
              ): country is { id: number; name: string } => Boolean(country?.id)
            )
            .map((country) => [country.id, country])
        ).values()
      );

      return {
        id: city.id,
        name: city.name,
        countries: countries.sort((a, b) =>
          a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' })
        ),
      };
    });
  }

  async getDictionaryTotals(accountId?: number) {
    const normalizedAccountId = this.normalizeOptionalAccountId(accountId);
    const accountWhere = normalizedAccountId
      ? { accountId: normalizedAccountId }
      : {};

    const [statuses, tags, countries, cities] = await Promise.all([
      this.prisma.crmStatus.count({ where: accountWhere }),
      this.prisma.crmTag.count({ where: accountWhere }),
      this.prisma.crmCountry.count({ where: accountWhere }),
      this.prisma.crmCity.count({ where: accountWhere }),
    ]);

    return {
      statuses,
      tags,
      countries,
      cities,
      sources: 0,
      salesChannels: 0,
      managers: 0,
      vk: 0,
      avito: 0,
    };
  }

  async listFilters(accountId?: number) {
    const accounts = await this.listFilterAccounts();
    const normalizedAccountId = this.normalizeOptionalAccountId(accountId);
    const managersWhere = {
      ...(normalizedAccountId ? { accountId: normalizedAccountId } : {}),
      customers: {
        some: normalizedAccountId ? { accountId: normalizedAccountId } : {},
      },
    } satisfies Prisma.CrmManagerWhereInput;

    const [statuses, tags, managers] = await Promise.all([
      this.listDictionaryStatuses(normalizedAccountId ?? undefined),
      this.listDictionaryTags(normalizedAccountId ?? undefined),
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
