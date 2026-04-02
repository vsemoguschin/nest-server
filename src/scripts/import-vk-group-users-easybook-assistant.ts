import 'dotenv/config';

import axios, { AxiosInstance } from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const VK_API_BASE_URL = 'https://api.vk.com/method';
const VK_API_VERSION = process.env.VK_DEFAULT_VERSION?.trim() || '5.199';

const TARGET_ACCOUNT_ID = 19;
const TARGET_CRM_STATUS_ID = 366763;
const TARGET_TAG_ID = 1065597;
const GROUP_MEMBERS_PAGE_SIZE = 1000;
const CONVERSATIONS_PAGE_SIZE = 200;
const USERS_GET_BATCH_SIZE = 100;
const PROFILE_FIELDS = [
  'sex',
  'bdate',
  'city',
  'country',
  'photo_50',
  'photo_100',
  'photo_200',
  'screen_name',
].join(',');

type VkGroupsGetMembersResponse = {
  count?: number;
  items?: number[];
};

type VkConversationPeer = {
  id?: number;
  type?: string;
};

type VkConversationItem = {
  conversation?: {
    peer?: VkConversationPeer;
  };
};

type VkMessagesGetConversationsResponse = {
  count?: number;
  items?: VkConversationItem[];
};

type VkProfile = {
  id: number;
  first_name?: string;
  last_name?: string;
  sex?: number;
  bdate?: string;
  city?: { id?: number; title?: string };
  country?: { id?: number; title?: string };
  photo_50?: string;
  photo_100?: string;
  photo_200?: string;
  screen_name?: string;
};

type ImportStats = {
  groupMembersCount: number;
  conversationUsersCount: number;
  uniqueUsersCount: number;
  profilesLoadedCount: number;
  crmVkCreated: number;
  crmVkFound: number;
  crmCustomerCreated: number;
  crmCustomerSkipped: number;
  crmCustomerLinked: number;
  conflictsSkipped: number;
  userErrors: number;
};

class VkApiClient {
  private readonly http: AxiosInstance;

  constructor(private readonly accessToken: string) {
    this.http = axios.create({
      baseURL: VK_API_BASE_URL,
      timeout: 20000,
    });
  }

  async getGroupMemberIds(groupId: number): Promise<Set<number>> {
    const userIds = new Set<number>();
    let offset = 0;
    let total = 0;

    while (true) {
      const response = await this.callMethod<VkGroupsGetMembersResponse>(
        'groups.getMembers',
        {
          group_id: groupId,
          offset,
          count: GROUP_MEMBERS_PAGE_SIZE,
        },
        {
          group_id: groupId,
          offset,
          count: GROUP_MEMBERS_PAGE_SIZE,
        },
      );

      const items = Array.isArray(response.items) ? response.items : [];
      total = this.toPositiveInt(response.count) ?? total;

      for (const item of items) {
        const userId = this.toPositiveInt(item);
        if (userId) {
          userIds.add(userId);
        }
      }

      console.info('[vk-import] groups.getMembers page loaded', {
        offset,
        received: items.length,
        total,
        accumulated: userIds.size,
      });

      if (items.length === 0 || userIds.size >= total || items.length < GROUP_MEMBERS_PAGE_SIZE) {
        break;
      }

      offset += GROUP_MEMBERS_PAGE_SIZE;
    }

    return userIds;
  }

  async getConversationUserIds(groupId: number): Promise<Set<number>> {
    const userIds = new Set<number>();
    let offset = 0;
    let total = 0;

    while (true) {
      const response = await this.callMethod<VkMessagesGetConversationsResponse>(
        'messages.getConversations',
        {
          group_id: groupId,
          offset,
          count: CONVERSATIONS_PAGE_SIZE,
          filter: 'all',
          extended: 0,
        },
        {
          group_id: groupId,
          offset,
          count: CONVERSATIONS_PAGE_SIZE,
          filter: 'all',
        },
      );

      const items = Array.isArray(response.items) ? response.items : [];
      total = this.toPositiveInt(response.count) ?? total;

      for (const item of items) {
        const peer = this.asRecord(item.conversation)?.peer;
        const peerRecord = this.asRecord(peer);
        if (peerRecord?.type !== 'user') {
          continue;
        }

        const userId = this.toPositiveInt(peerRecord.id);
        if (userId) {
          userIds.add(userId);
        }
      }

      console.info('[vk-import] messages.getConversations page loaded', {
        offset,
        received: items.length,
        total,
        accumulatedUsers: userIds.size,
      });

      if (items.length === 0 || offset + items.length >= total || items.length < CONVERSATIONS_PAGE_SIZE) {
        break;
      }

      offset += CONVERSATIONS_PAGE_SIZE;
    }

    return userIds;
  }

  async getProfiles(userIds: number[]): Promise<VkProfile[]> {
    const profiles: VkProfile[] = [];

    for (let start = 0; start < userIds.length; start += USERS_GET_BATCH_SIZE) {
      const batch = userIds.slice(start, start + USERS_GET_BATCH_SIZE);
      const response = await this.callMethod<VkProfile[]>(
        'users.get',
        {
          user_ids: batch.join(','),
          fields: PROFILE_FIELDS,
        },
        {
          user_ids_count: batch.length,
          fields: PROFILE_FIELDS,
        },
      );

      const items = Array.isArray(response) ? response : [];
      for (const item of items) {
        const profile = this.normalizeProfile(item);
        if (profile) {
          profiles.push(profile);
        }
      }

      console.info('[vk-import] users.get batch loaded', {
        from: start,
        batchSize: batch.length,
        loadedProfiles: items.length,
        accumulatedProfiles: profiles.length,
      });
    }

    return profiles;
  }

  private async callMethod<T>(
    method: string,
    params: Record<string, string | number>,
    logContext: Record<string, unknown>,
  ): Promise<T> {
    const response = await this.http.get(`/${method}`, {
      params: {
        ...params,
        access_token: this.accessToken,
        v: VK_API_VERSION,
      },
    });

    const payload = response.data;
    if (this.isVkErrorPayload(payload)) {
      console.error('[vk-import] VK API error', {
        method,
        ...logContext,
        vkErrorCode: payload.error.error_code,
        vkErrorMessage: payload.error.error_msg,
      });
      throw new Error(
        `VK API error: ${method} (${payload.error.error_code ?? 'unknown'}) ${payload.error.error_msg ?? 'unknown error'}`,
      );
    }

    if (!this.asRecord(payload)?.response) {
      throw new Error(`VK API invalid response for method ${method}`);
    }

    return payload.response as T;
  }

  private normalizeProfile(raw: unknown): VkProfile | null {
    const item = this.asRecord(raw);
    if (!item) {
      return null;
    }

    const id = this.toPositiveInt(item.id);
    if (!id) {
      return null;
    }

    return {
      id,
      first_name: this.toOptionalString(item.first_name),
      last_name: this.toOptionalString(item.last_name),
      sex: this.toPositiveInt(item.sex),
      bdate: this.toOptionalString(item.bdate),
      city: this.asRecord(item.city) as VkProfile['city'],
      country: this.asRecord(item.country) as VkProfile['country'],
      photo_50: this.toOptionalString(item.photo_50),
      photo_100: this.toOptionalString(item.photo_100),
      photo_200: this.toOptionalString(item.photo_200),
      screen_name: this.toOptionalString(item.screen_name),
    };
  }

  private isVkErrorPayload(value: unknown): value is {
    error: { error_code?: number; error_msg?: string };
  } {
    return Boolean(this.asRecord(value)?.error && this.asRecord(this.asRecord(value)?.error));
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private toOptionalString(value: unknown): string | undefined {
    if (typeof value === 'string') {
      const normalized = value.trim();
      return normalized.length > 0 ? normalized : undefined;
    }

    return undefined;
  }

  private toPositiveInt(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return undefined;
  }
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Не задана обязательная env-переменная ${name}`);
  }
  return value;
}

function readRequiredIntEnv(name: string): number {
  const value = readRequiredEnv(name);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Env-переменная ${name} должна быть положительным целым числом, получено "${value}"`,
    );
  }
  return parsed;
}

function parseDryRun(): boolean {
  const envValue = (process.env.VK_IMPORT_DRY_RUN || '').trim().toLowerCase();
  if (envValue === '1' || envValue === 'true' || envValue === 'yes') {
    return true;
  }

  return process.argv.includes('--dry-run');
}

function buildFullName(profile: VkProfile): string {
  const fullName = [profile.first_name ?? '', profile.last_name ?? '']
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return fullName || String(profile.id);
}

function normalizeBirthday(bdate?: string): string {
  if (!bdate) {
    return '';
  }

  const value = bdate.trim();
  return /^\d{2}\.\d{2}\.\d{4}$/.test(value) ? value : '';
}

function mapVkSex(value?: number): string {
  if (value === 1) return 'f';
  if (value === 2) return 'm';
  return '';
}

function pickPhotoUrl(profile: VkProfile): string {
  return profile.photo_200 || profile.photo_100 || profile.photo_50 || '';
}

async function validateReferences() {
  const account = await prisma.crmAccount.findUnique({
    where: { id: TARGET_ACCOUNT_ID },
    select: { id: true, code: true, name: true, isActive: true },
  });

  if (!account) {
    throw new Error(`CrmAccount id=${TARGET_ACCOUNT_ID} не найден`);
  }

  const status = await prisma.crmStatus.findUnique({
    where: { id: TARGET_CRM_STATUS_ID },
    select: { id: true, accountId: true, name: true },
  });

  if (!status) {
    throw new Error(`CrmStatus id=${TARGET_CRM_STATUS_ID} не найден`);
  }

  if (status.accountId !== TARGET_ACCOUNT_ID) {
    throw new Error(
      `CrmStatus id=${TARGET_CRM_STATUS_ID} принадлежит accountId=${status.accountId}, ожидался ${TARGET_ACCOUNT_ID}`,
    );
  }

  const tag = await prisma.crmTag.findUnique({
    where: { id: TARGET_TAG_ID },
    select: { id: true, accountId: true, name: true },
  });

  if (!tag) {
    throw new Error(`CrmTag id=${TARGET_TAG_ID} не найден`);
  }

  if (tag.accountId !== TARGET_ACCOUNT_ID) {
    throw new Error(
      `CrmTag id=${TARGET_TAG_ID} принадлежит accountId=${tag.accountId}, ожидался ${TARGET_ACCOUNT_ID}`,
    );
  }

  console.info('[vk-import] validated references', {
    account,
    status,
    tag,
  });
}

async function ensureCustomerTag(customerId: number, dryRun: boolean) {
  if (dryRun) {
    return;
  }

  await prisma.crmCustomerTag.upsert({
    where: {
      customerId_tagId: {
        customerId,
        tagId: TARGET_TAG_ID,
      },
    },
    update: {
      accountId: TARGET_ACCOUNT_ID,
    },
    create: {
      accountId: TARGET_ACCOUNT_ID,
      customerId,
      tagId: TARGET_TAG_ID,
    },
  });
}

async function importProfile(params: {
  profile: VkProfile;
  groupId: number;
  dryRun: boolean;
  stats: ImportStats;
}) {
  const { profile, groupId, dryRun, stats } = params;
  const externalId = String(profile.id);
  const fullName = buildFullName(profile);

  try {
    const existingCrmVk = await prisma.crmVk.findUnique({
      where: {
        accountId_externalId: {
          accountId: TARGET_ACCOUNT_ID,
          externalId,
        },
      },
      select: {
        id: true,
        externalId: true,
      },
    });

    let crmVkId = existingCrmVk?.id ?? null;

    if (existingCrmVk) {
      stats.crmVkFound += 1;
    } else {
      stats.crmVkCreated += 1;
    }

    if (!existingCrmVk && !dryRun) {
      const createdCrmVk = await prisma.crmVk.create({
        data: {
          accountId: TARGET_ACCOUNT_ID,
          externalId,
          name: fullName,
          messagesGroupId: String(groupId),
        },
        select: {
          id: true,
        },
      });
      crmVkId = createdCrmVk.id;
    }

    if (existingCrmVk && !dryRun) {
      await prisma.crmVk.update({
        where: {
          id: existingCrmVk.id,
        },
        data: {
          name: fullName,
          messagesGroupId: String(groupId),
        },
      });
    }

    const existingCustomerByVk =
      crmVkId || dryRun
        ? await prisma.crmCustomer.findFirst({
            where: {
              accountId: TARGET_ACCOUNT_ID,
              vkId: crmVkId ?? -1,
            },
            select: {
              id: true,
              vkId: true,
            },
          })
        : null;

    const existingCustomer = existingCustomerByVk || null;

    if (existingCustomer) {
      if (!existingCustomer.vkId && crmVkId && !dryRun) {
        await prisma.crmCustomer.update({
          where: { id: existingCustomer.id },
          data: {
            vkId: crmVkId,
          },
        });
        stats.crmCustomerLinked += 1;
      }

      await ensureCustomerTag(existingCustomer.id, dryRun);

      stats.crmCustomerSkipped += 1;
      return;
    }

    if (dryRun) {
      stats.crmCustomerCreated += 1;
      return;
    }

    const createdCustomer = await prisma.crmCustomer.create({
      data: {
        accountId: TARGET_ACCOUNT_ID,
        crmStatusId: TARGET_CRM_STATUS_ID,
        vkId: crmVkId ?? undefined,
        fullName,
        photoUrl: pickPhotoUrl(profile),
        birthday: normalizeBirthday(profile.bdate),
        sex: mapVkSex(profile.sex),
        phone: '',
        email: '',
        address: '',
        sourceId: null,
      },
      select: {
        id: true,
      },
    });

    await ensureCustomerTag(createdCustomer.id, dryRun);

    stats.crmCustomerCreated += 1;
  } catch (error) {
    stats.userErrors += 1;
    console.error('[vk-import] user import failed', {
      vkUserId: profile.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function main() {
  const groupId = readRequiredIntEnv('VK_GROUP_EASYBOOK_ASSISTANT_ID');
  const accessToken = readRequiredEnv('VK_TOKEN_EASYBOOK_ASSISTANT_GROUP');
  const dryRun = parseDryRun();
  const startedAt = Date.now();

  const stats: ImportStats = {
    groupMembersCount: 0,
    conversationUsersCount: 0,
    uniqueUsersCount: 0,
    profilesLoadedCount: 0,
    crmVkCreated: 0,
    crmVkFound: 0,
    crmCustomerCreated: 0,
    crmCustomerSkipped: 0,
    crmCustomerLinked: 0,
    conflictsSkipped: 0,
    userErrors: 0,
  };

  try {
    await validateReferences();

    const vk = new VkApiClient(accessToken);

    console.info('[vk-import] start', {
      groupId,
      accountId: TARGET_ACCOUNT_ID,
      crmStatusId: TARGET_CRM_STATUS_ID,
      dryRun,
      vkApiVersion: VK_API_VERSION,
    });

    const groupMembers = await vk.getGroupMemberIds(groupId);
    stats.groupMembersCount = groupMembers.size;

    const conversationUsers = await vk.getConversationUserIds(groupId);
    stats.conversationUsersCount = conversationUsers.size;

    const uniqueUserIds = new Set<number>([
      ...groupMembers.values(),
      ...conversationUsers.values(),
    ]);
    stats.uniqueUsersCount = uniqueUserIds.size;

    console.info('[vk-import] union prepared', {
      groupMembersCount: stats.groupMembersCount,
      conversationUsersCount: stats.conversationUsersCount,
      uniqueUsersCount: stats.uniqueUsersCount,
    });

    const profiles = await vk.getProfiles(Array.from(uniqueUserIds.values()));
    stats.profilesLoadedCount = profiles.length;

    for (const profile of profiles) {
      await importProfile({
        profile,
        groupId,
        dryRun,
        stats,
      });
    }

    const durationMs = Date.now() - startedAt;
    console.info('[vk-import] done', {
      ...stats,
      durationMs,
      dryRun,
    });
  } catch (error) {
    console.error('[vk-import] failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
