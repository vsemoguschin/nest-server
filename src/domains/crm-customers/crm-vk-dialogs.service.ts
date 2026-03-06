import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { VkMessagesProxyService } from '../vk-messages/vk-messages.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ListCrmVkDialogsQueryDto } from './dto/list-crm-vk-dialogs.query.dto';

type VkConversationResponse = {
  response?: {
    count?: number;
    unread_count?: number;
    items?: Array<Record<string, unknown>>;
    profiles?: Array<Record<string, unknown>>;
  };
};

type DialogListItemDto = {
  peer_id: number;
  last_message_text: string;
  unread_count?: number;
  unanswered: boolean;
  last_message_date: number;
  profile_photo_50: string;
  full_name: string;
};

const VK_DIALOGS_DEFAULT_COUNT = 20;
const VK_CONVERSATIONS_BY_ID_BATCH_SIZE = 100;
const VK_FILTERED_DIALOGS_DEFAULT_PAGE = 1;
const VK_FILTERED_DIALOGS_DEFAULT_LIMIT = 20;
const VK_FILTERED_DIALOGS_MAX_LIMIT = 100;

@Injectable()
export class CrmVkDialogsService {
  private readonly logger = new Logger(CrmVkDialogsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vk: VkMessagesProxyService,
  ) {}

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private asNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private logInfo(payload: Record<string, unknown>) {
    this.logger.log(
      JSON.stringify({
        scope: 'crm-vk-dialogs',
        level: 'info',
        ...payload,
      }),
    );
  }

  private logWarn(payload: Record<string, unknown>) {
    this.logger.warn(
      JSON.stringify({
        scope: 'crm-vk-dialogs',
        level: 'warn',
        ...payload,
      }),
    );
  }

  private normalizeSource(value: string): string {
    return value.trim().toLowerCase();
  }

  private resolvePage(query: ListCrmVkDialogsQueryDto) {
    return Number.isInteger(query.page) && Number(query.page) > 0
      ? Number(query.page)
      : VK_FILTERED_DIALOGS_DEFAULT_PAGE;
  }

  private resolveLimit(query: ListCrmVkDialogsQueryDto) {
    const rawLimit =
      Number.isInteger(query.limit) && Number(query.limit) > 0
        ? Number(query.limit)
        : VK_FILTERED_DIALOGS_DEFAULT_LIMIT;

    return Math.min(rawLimit, VK_FILTERED_DIALOGS_MAX_LIMIT);
  }

  private hasActiveCrmFilters(query: ListCrmVkDialogsQueryDto): boolean {
    return (
      (Array.isArray(query.statusIds) && query.statusIds.length > 0) ||
      (Array.isArray(query.tagIds) && query.tagIds.length > 0) ||
      (Array.isArray(query.managerIds) && query.managerIds.length > 0)
    );
  }

  private extractPeerIds(items: Array<Record<string, unknown>>): number[] {
    const peerIds = items
      .map((item) => {
        const conversation = this.isRecord(item.conversation)
          ? item.conversation
          : null;
        const peer = conversation && this.isRecord(conversation.peer)
          ? conversation.peer
          : null;
        return this.asNumber(peer?.id);
      })
      .filter((peerId) => Number.isFinite(peerId) && peerId > 0);

    return Array.from(new Set(peerIds));
  }

  private buildCustomerWhere(
    source: string,
    query: ListCrmVkDialogsQueryDto,
  ): Prisma.CrmCustomerWhereInput {
    const andWhere: Prisma.CrmCustomerWhereInput[] = [
      {
        account: {
          is: {
            code: source,
          },
        },
      },
      {
        vk: {
          is: {
            externalId: {
              not: '',
            },
          },
        },
      },
    ];

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

    return { AND: andWhere };
  }

  private chunkPeerIds(peerIds: number[]): number[][] {
    const chunks: number[][] = [];
    for (
      let index = 0;
      index < peerIds.length;
      index += VK_CONVERSATIONS_BY_ID_BATCH_SIZE
    ) {
      chunks.push(peerIds.slice(index, index + VK_CONVERSATIONS_BY_ID_BATCH_SIZE));
    }
    return chunks;
  }

  private dedupeRecordsById(items: Array<Record<string, unknown>>) {
    const seen = new Set<string>();

    return items.filter((item) => {
      const id = this.asNumber(item.id);
      const key = String(id);
      if (!id || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private normalizeConversationItem(item: Record<string, unknown>) {
    if (this.isRecord(item.conversation)) {
      return item;
    }

    if (this.isRecord(item.peer)) {
      return {
        conversation: item,
        last_message: this.isRecord(item.last_message) ? item.last_message : {},
      };
    }

    return item;
  }

  private dedupeConversationItemsByPeerId(items: Array<Record<string, unknown>>) {
    const seen = new Set<number>();

    return items.filter((item) => {
      const peerId = this.getPeerIdFromConversationItem(item);

      if (!peerId || seen.has(peerId)) {
        return false;
      }

      seen.add(peerId);
      return true;
    });
  }

  private sortConversationItems(items: Array<Record<string, unknown>>) {
    return [...items].sort((left, right) => {
      const leftLastMessage = this.isRecord(left.last_message) ? left.last_message : null;
      const rightLastMessage = this.isRecord(right.last_message)
        ? right.last_message
        : null;

      return this.asNumber(rightLastMessage?.date) - this.asNumber(leftLastMessage?.date);
    });
  }

  private countUnread(items: Array<Record<string, unknown>>) {
    return items.filter((item) => {
      const conversation = this.isRecord(item.conversation) ? item.conversation : null;
      return Boolean(conversation?.unanswered);
    }).length;
  }

  private applyConversationFilter(
    items: Array<Record<string, unknown>>,
    filter: string,
  ) {
    if (filter === 'all') {
      return items;
    }

    return items.filter((item) => {
      const conversation = this.isRecord(item.conversation) ? item.conversation : null;
      return Boolean(conversation?.unanswered);
    });
  }

  private getPeerIdFromConversationItem(item: Record<string, unknown>) {
    const conversation = this.isRecord(item.conversation) ? item.conversation : null;
    const peer = conversation && this.isRecord(conversation.peer)
      ? conversation.peer
      : null;
    if (peer) {
      return this.asNumber(peer.id);
    }

    const directPeer = this.isRecord(item.peer) ? item.peer : null;
    return this.asNumber(directPeer?.id);
  }

  private filterProfilesByConversationItems(
    profiles: Array<Record<string, unknown>>,
    items: Array<Record<string, unknown>>,
  ) {
    const peerIds = new Set(
      items
        .map((item) => this.getPeerIdFromConversationItem(item))
        .filter((peerId) => peerId > 0),
    );

    return profiles.filter((profile) => {
      const profileId = this.asNumber(profile.id);
      return profileId > 0 && peerIds.has(profileId);
    });
  }

  private mapConversationItemsToDto(
    items: Array<Record<string, unknown>>,
    profiles: Array<Record<string, unknown>>,
  ): DialogListItemDto[] {
    const profileById = new Map<number, Record<string, unknown>>(
      profiles
        .map((profile) => [this.asNumber(profile.id), profile] as const)
        .filter(([id]) => id > 0),
    );

    return items
      .map((item) => {
        const peerId = this.getPeerIdFromConversationItem(item);
        if (!peerId) {
          return null;
        }

        const conversation = this.isRecord(item.conversation) ? item.conversation : null;
        const lastMessage = this.isRecord(item.last_message) ? item.last_message : null;
        const profile = profileById.get(peerId);
        const firstName =
          profile && typeof profile.first_name === 'string' ? profile.first_name : '';
        const lastName =
          profile && typeof profile.last_name === 'string' ? profile.last_name : '';
        const fullName = [firstName, lastName].join(' ').trim();

        return {
          peer_id: peerId,
          last_message_text:
            lastMessage && typeof lastMessage.text === 'string' ? lastMessage.text : '',
          unanswered: Boolean(conversation?.unanswered),
          last_message_date: this.asNumber(lastMessage?.date),
          profile_photo_50:
            profile && typeof profile.photo_50 === 'string' ? profile.photo_50 : '',
          full_name: fullName,
        } satisfies DialogListItemDto;
      })
      .filter((item): item is DialogListItemDto => item !== null);
  }

  private async getFilteredDialogsByCustomers(
    source: string,
    filter: string,
    query: ListCrmVkDialogsQueryDto,
  ) {
    const page = this.resolvePage(query);
    const limit = this.resolveLimit(query);
    const offset = (page - 1) * limit;
    const customerWhere = this.buildCustomerWhere(source, query);
    const customerBatchSize = Math.max(limit * 2, VK_CONVERSATIONS_BY_ID_BATCH_SIZE);
    const targetItemsCount = offset + limit;
    const requestedPeerIds = new Set<number>();
    const allItems: Array<Record<string, unknown>> = [];
    const allProfiles: Array<Record<string, unknown>> = [];
    let scannedCustomersCount = 0;
    let skippedWithoutVkExternalIdCount = 0;
    let dbOffset = 0;
    let customersBatchIndex = 0;
    let hasMoreCustomers = true;

    this.logInfo({
      event: 'dialogs.by-id.started',
      source,
      filter,
      batchSize: VK_CONVERSATIONS_BY_ID_BATCH_SIZE,
      customerBatchSize,
      targetItemsCount,
      page,
      limit,
      statusIds: query.statusIds ?? [],
      tagIds: query.tagIds ?? [],
      managerIds: query.managerIds ?? [],
    });

    while (hasMoreCustomers) {
      const customers = await this.prisma.crmCustomer.findMany({
        where: customerWhere,
        select: {
          id: true,
          fullName: true,
          vk: {
            select: {
              externalId: true,
            },
          },
        },
        orderBy: {
          id: 'desc',
        },
        skip: dbOffset,
        take: customerBatchSize,
      });

      customersBatchIndex += 1;
      scannedCustomersCount += customers.length;
      dbOffset += customers.length;
      hasMoreCustomers = customers.length === customerBatchSize;

      const invalidVkCustomersSample = customers
        .filter((customer) => {
          const peerId = Number(customer.vk?.externalId || '');
          return !Number.isFinite(peerId) || peerId <= 0;
        })
        .slice(0, 10)
        .map((customer) => ({
          id: customer.id,
          fullName: customer.fullName,
          vkExternalId: customer.vk?.externalId || null,
        }));

      const batchPeerIds = Array.from(
        new Set(
          customers
            .map((customer) => Number(customer.vk?.externalId || ''))
            .filter((peerId) => Number.isFinite(peerId) && peerId > 0)
            .filter((peerId) => !requestedPeerIds.has(peerId)),
        ),
      );

      skippedWithoutVkExternalIdCount += customers.length - batchPeerIds.length;
      batchPeerIds.forEach((peerId) => requestedPeerIds.add(peerId));

      this.logInfo({
        event: 'customers.batch',
        source,
        filter,
        batchIndex: customersBatchIndex,
        fetchedCustomersCount: customers.length,
        scannedCustomersCount,
        validPeerIdsCount: batchPeerIds.length,
        skippedWithoutVkExternalIdCount: skippedWithoutVkExternalIdCount,
        sampleCustomerIds: customers.slice(0, 10).map((customer) => customer.id),
        samplePeerIds: batchPeerIds.slice(0, 10),
      });

      if (invalidVkCustomersSample.length) {
        this.logWarn({
          event: 'customers.skipped-without-vk-external-id',
          source,
          filter,
          batchIndex: customersBatchIndex,
          sample: invalidVkCustomersSample,
        });
      }

      if (!batchPeerIds.length) {
        if (!hasMoreCustomers) break;
        continue;
      }

      const batches = this.chunkPeerIds(batchPeerIds);

      for (const batch of batches) {
        const result = await this.vk.post('/api/vk/method/messages.getConversationsById', {
          source,
          params: {
            v: '5.199',
            peer_ids: batch.join(','),
            extended: 1,
            fields: 'id,photo_50',
          },
        });

        if (result.status >= 400) {
          return result;
        }

        const payload = (result.data || {}) as VkConversationResponse;
        const response = this.isRecord(payload.response) ? payload.response : {};
        const rawItems = Array.isArray(response.items)
          ? response.items.filter(this.isRecord.bind(this))
          : [];
        const items = rawItems.map((item) => this.normalizeConversationItem(item));
        const profiles = Array.isArray(response.profiles)
          ? response.profiles.filter(this.isRecord.bind(this))
          : [];
        allItems.push(...items);
        allProfiles.push(...profiles);

        const returnedPeerIds = items
          .map((item) => this.getPeerIdFromConversationItem(item))
          .filter((peerId) => peerId > 0);
        const missingPeerIds = batch.filter((peerId) => !returnedPeerIds.includes(peerId));

        this.logInfo({
          event: 'dialogs.by-id.batch',
          source,
          filter,
          batchIndex: customersBatchIndex,
          requestedPeerIdsCount: batch.length,
          returnedItemsCount: items.length,
          rawItemKeysSample: rawItems[0] ? Object.keys(rawItems[0]).slice(0, 12) : [],
          requestedPeerIdsSample: batch.slice(0, 10),
          returnedPeerIdsSample: returnedPeerIds.slice(0, 10),
          missingPeerIdsCount: missingPeerIds.length,
          missingPeerIdsSample: missingPeerIds.slice(0, 10),
        });
      }

      const dedupedItems = this.sortConversationItems(
        this.dedupeConversationItemsByPeerId(allItems),
      );
      const currentFilteredItems = this.applyConversationFilter(dedupedItems, filter);

      this.logInfo({
        event: 'dialogs.by-id.progress',
        source,
        filter,
        batchIndex: customersBatchIndex,
        dedupedItemsCount: dedupedItems.length,
        filteredItemsCount: currentFilteredItems.length,
        targetItemsCount,
      });

      if (currentFilteredItems.length >= targetItemsCount) {
        break;
      }

      if (!hasMoreCustomers) {
        break;
      }
    }

    const dedupedItems = this.sortConversationItems(
      this.dedupeConversationItemsByPeerId(allItems),
    );
    const filteredItems = this.applyConversationFilter(dedupedItems, filter);
    const pagedItems = filteredItems.slice(offset, offset + limit);
    const pagedProfiles = this.filterProfilesByConversationItems(
      this.dedupeRecordsById(allProfiles),
      pagedItems,
    );
    const dtoItems = this.mapConversationItemsToDto(pagedItems, pagedProfiles);

    this.logInfo({
      event: 'dialogs.by-id.completed',
      source,
      filter,
      dedupedItemsCount: dedupedItems.length,
      filteredItemsCount: filteredItems.length,
      outputItemsCount: dtoItems.length,
      unreadCount: this.countUnread(filteredItems),
      scannedCustomersCount,
      requestedPeerIdsCount: requestedPeerIds.size,
      page,
      limit,
      offset,
      outputPeerIdsSample: pagedItems
        .map((item) => this.getPeerIdFromConversationItem(item))
        .filter((peerId) => peerId > 0)
        .slice(0, 10),
      profilesCount: pagedProfiles.length,
    });

    return {
      response: {
        count: filteredItems.length,
        unread_count: this.countUnread(filteredItems),
        items: dtoItems,
      },
    };
  }

  async list(query: ListCrmVkDialogsQueryDto) {
    const source = this.normalizeSource(query.source);
    const filter = query.filter || 'all';
    const hasActiveCrmFilters = this.hasActiveCrmFilters(query);

    if (hasActiveCrmFilters) {
      const result = await this.getFilteredDialogsByCustomers(source, filter, query);

      if ('status' in result) {
        return result;
      }

      const filteredItems = Array.isArray(result.response?.items)
        ? result.response.items
        : [];

      this.logInfo({
        event: 'dialogs.filtered',
        source,
        filter,
        strategy: 'getConversationsById',
        totalFilteredCount: Number(result.response?.count || 0),
        outputCount: filteredItems.length,
        unreadCount: Number(result.response?.unread_count || 0),
        page: this.resolvePage(query),
        limit: this.resolveLimit(query),
        statusIds: query.statusIds ?? [],
        tagIds: query.tagIds ?? [],
        managerIds: query.managerIds ?? [],
        outputPeerIdsSample: filteredItems
          .map((item) => this.getPeerIdFromConversationItem(item))
          .filter((peerId) => peerId > 0)
          .slice(0, 10),
      });

      return {
        status: 200,
        data: result,
      };
    }

    const vkResult = await this.vk.post('/api/vk/messages/get-conversations', {
      source,
      v: '5.199',
      extended: 1,
      count: VK_DIALOGS_DEFAULT_COUNT,
      fields: 'id,photo_50',
      filter,
    });

    if (vkResult.status >= 400) {
      return vkResult;
    }

    const payload = (vkResult.data || {}) as VkConversationResponse;
    const response = this.isRecord(payload.response) ? payload.response : {};
    const items = Array.isArray(response.items)
      ? response.items.filter(this.isRecord.bind(this))
      : [];
    const profiles = Array.isArray(response.profiles)
      ? response.profiles.filter(this.isRecord.bind(this))
      : [];
    const peerIds = this.extractPeerIds(items);
    const dtoItems = this.mapConversationItemsToDto(items, profiles);

    this.logInfo({
      event: 'dialogs.requested',
      source,
      filter,
      conversationsCount: VK_DIALOGS_DEFAULT_COUNT,
      inputCount: items.length,
      peerIdsCount: peerIds.length,
      hasActiveCrmFilters,
      statusIds: query.statusIds ?? [],
      tagIds: query.tagIds ?? [],
      managerIds: query.managerIds ?? [],
      peerIdsSample: peerIds.slice(0, 10),
    });

    if (!peerIds.length) {
      return {
        status: vkResult.status,
        data: {
          response: {
            count: dtoItems.length,
            unread_count: this.countUnread(items),
            items: dtoItems,
          },
        },
      };
    }

    return {
      status: vkResult.status,
      data: {
        response: {
          count: dtoItems.length,
          unread_count: this.countUnread(items),
          items: dtoItems,
        },
      },
    };
  }
}
