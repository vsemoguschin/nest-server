import { Injectable, Logger } from '@nestjs/common';
import { CrmCustomer, CrmVk } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type SyncIntegration = {
  id: number;
  accountId: number;
  initialCrmStatusId?: number | null;
  defaultSourceId?: number | null;
};

type VkUserProfile = {
  id: number;
  first_name?: string;
  last_name?: string;
  sex?: number;
  bdate?: string;
  photo_200?: string;
};

type SyncParams = {
  integration: SyncIntegration;
  crmVk: CrmVk;
  vkProfile: VkUserProfile;
  callbackEventId?: number;
};

type SyncResult = {
  crmCustomer: CrmCustomer;
  action: 'created' | 'found' | 'updated';
};

const TECHNICAL_VK_FULL_NAME = 'Пользователь VK';

@Injectable()
export class VkCallbackCustomerSyncService {
  private readonly logger = new Logger(VkCallbackCustomerSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async syncGroupJoinCustomer(params: SyncParams): Promise<SyncResult> {
    const { integration, crmVk, vkProfile, callbackEventId } = params;
    const accountId = integration.accountId;

    if (!accountId || !crmVk?.id) {
      throw new Error('VK callback customer sync requires accountId and crmVk.id');
    }

    const existingCustomer = await this.prisma.crmCustomer.findFirst({
      where: {
        accountId,
        vkId: crmVk.id,
      },
    });

    const validSourceId = await this.resolveValidSourceId({
      accountId,
      sourceId: integration.defaultSourceId ?? null,
      callbackEventId,
      integrationId: integration.id,
    });

    if (existingCustomer) {
      const patch = this.buildSoftUpdatePatch(existingCustomer, vkProfile, validSourceId);

      if (!Object.keys(patch).length) {
        return {
          crmCustomer: existingCustomer,
          action: 'found',
        };
      }

      const crmCustomer = await this.prisma.crmCustomer.update({
        where: {
          id: existingCustomer.id,
        },
        data: patch,
      });

      return {
        crmCustomer,
        action: 'updated',
      };
    }

    const validStatusId = await this.resolveValidStatusId({
      accountId,
      crmStatusId: integration.initialCrmStatusId ?? null,
      callbackEventId,
      integrationId: integration.id,
    });

    const fullName = this.buildFullName(vkProfile);
    const photoUrl = this.pickNonEmptyString(vkProfile.photo_200);
    const birthday = this.pickNonEmptyString(vkProfile.bdate);
    const sex = this.mapVkSexToCrmSex(vkProfile.sex);

    const createData = {
      accountId,
      vkId: crmVk.id,
      fullName,
      ...(photoUrl ? { photoUrl } : {}),
      ...(birthday ? { birthday } : {}),
      ...(sex ? { sex } : {}),
      ...(validStatusId ? { crmStatusId: validStatusId } : {}),
      ...(validSourceId ? { sourceId: validSourceId } : {}),
    };

    const crmCustomer = await this.prisma.crmCustomer.create({
      data: createData,
    });

    return {
      crmCustomer,
      action: 'created',
    };
  }

  private buildSoftUpdatePatch(
    customer: CrmCustomer,
    vkProfile: VkUserProfile,
    validSourceId: number | null,
  ) {
    const patch: Record<string, string | number> = {};
    const photoUrl = this.pickNonEmptyString(vkProfile.photo_200);
    const birthday = this.pickNonEmptyString(vkProfile.bdate);
    const sex = this.mapVkSexToCrmSex(vkProfile.sex);
    const fullName = this.buildFullName(vkProfile);

    if (photoUrl && customer.photoUrl !== photoUrl) {
      patch.photoUrl = photoUrl;
    }

    if (birthday && customer.birthday !== birthday) {
      patch.birthday = birthday;
    }

    if (sex && customer.sex !== sex) {
      patch.sex = sex;
    }

    if (customer.sourceId === null && validSourceId) {
      patch.sourceId = validSourceId;
    }

    if (fullName !== TECHNICAL_VK_FULL_NAME && this.isTechnicalFullName(customer.fullName)) {
      patch.fullName = fullName;
    }

    return patch;
  }

  private buildFullName(profile: VkUserProfile): string {
    const fullName = [profile.first_name ?? '', profile.last_name ?? '']
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    return fullName || TECHNICAL_VK_FULL_NAME;
  }

  private mapVkSexToCrmSex(value?: number): string {
    if (value === 1) return 'f';
    if (value === 2) return 'm';
    return '';
  }

  private pickNonEmptyString(value?: string): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private isEmptyString(value: string | null): boolean {
    return !value || value.trim().length === 0;
  }

  private isTechnicalFullName(value: string | null): boolean {
    if (this.isEmptyString(value)) {
      return true;
    }

    return value!.trim() === TECHNICAL_VK_FULL_NAME;
  }

  private async resolveValidStatusId(params: {
    accountId: number;
    crmStatusId: number | null;
    callbackEventId?: number;
    integrationId: number;
  }): Promise<number | null> {
    const { accountId, crmStatusId, callbackEventId, integrationId } = params;
    if (!crmStatusId) return null;

    const crmStatus = await this.prisma.crmStatus.findUnique({
      where: {
        id: crmStatusId,
      },
      select: {
        id: true,
        accountId: true,
      },
    });

    if (crmStatus?.accountId === accountId) {
      return crmStatus.id;
    }

    this.logger.warn(
      JSON.stringify({
        scope: 'vk-callback-customer-sync',
        event: 'invalid_initial_status',
        callbackEventId: callbackEventId ?? null,
        integrationId,
        accountId,
        crmStatusId,
      }),
    );

    return null;
  }

  private async resolveValidSourceId(params: {
    accountId: number;
    sourceId: number | null;
    callbackEventId?: number;
    integrationId: number;
  }): Promise<number | null> {
    const { accountId, sourceId, callbackEventId, integrationId } = params;
    if (!sourceId) return null;

    const crmSource = await this.prisma.crmSource.findUnique({
      where: {
        id: sourceId,
      },
      select: {
        id: true,
        accountId: true,
      },
    });

    if (crmSource?.accountId === accountId) {
      return crmSource.id;
    }

    this.logger.warn(
      JSON.stringify({
        scope: 'vk-callback-customer-sync',
        event: 'invalid_default_source',
        callbackEventId: callbackEventId ?? null,
        integrationId,
        accountId,
        sourceId,
      }),
    );

    return null;
  }
}
