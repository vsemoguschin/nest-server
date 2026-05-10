import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type VkAdsStatsProjectKey = 'neon' | 'book';

export type VkAdsProjectRef = {
  id: number;
  code: string | null;
  name: string | null;
  isActive: boolean;
};

export type VkAdsIntegrationListItem = {
  id: number;
  accountId: number;
  projectId: number | null;
  projectCode: string | null;
  projectName: string | null;
  name: string | null;
  tokenEnvKey: string | null;
  vkAdsAccountId: string | null;
  vkAdsCabinetId: string | null;
  isActive: boolean;
  defaultPackageId: number | null;
  adSourceId: number | null;
  createdAt: Date;
  updatedAt: Date;
  displayLabel: string;
};

export type AdSourceListItem = {
  id: number;
  title: string;
  workSpaceId: number;
  groupId: number | null;
  projectId: number | null;
  projectName: string | null;
  projectCode: string | null;
  vkIntegrationId: number | null;
  vkIntegrationName: string | null;
};

export type VkAdsIntegrationAuthContext = {
  integrationId: number;
  accountId: number;
  projectId: number | null;
  projectCode: string | null;
  projectName: string | null;
  tokenEnvKey: string;
  accessToken: string;
  baseUrl: string;
};

const DEFAULT_BASE_URL = 'https://ads.vk.com';

@Injectable()
export class VkAdsIntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveStatsProjectKeyFromProject(project?: {
    code?: string | null;
    name?: string | null;
  } | null): VkAdsStatsProjectKey | null {
    const code = String(project?.code || '').trim().toLowerCase();
    const name = String(project?.name || '').trim().toLowerCase();
    const haystack = `${code} ${name}`;

    if (
      code === 'easyneon' ||
      code.includes('easyneon') ||
      code === 'neon' ||
      code.includes('neon') ||
      name.includes('neon') ||
      haystack.includes('neon')
    ) {
      return 'neon';
    }

    if (
      code === 'easybook' ||
      code.includes('easybook') ||
      code === 'book' ||
      code.includes('book') ||
      name.includes('book') ||
      haystack.includes('book')
    ) {
      return 'book';
    }

    return null;
  }

  private formatDisplayLabel(integration: {
    id: number;
    name?: string | null;
    account?: { code?: string | null; name?: string | null } | null;
    project?: { code?: string | null; name?: string | null } | null;
    vkAdsAccountId?: string | null;
    vkAdsCabinetId?: string | null;
  }) {
    const name = String(integration.name || '').trim();
    if (name) return name;

    const projectLabel =
      String(integration.project?.name || '').trim() ||
      String(integration.project?.code || '').trim();
    const accountLabel =
      String(integration.account?.name || '').trim() ||
      String(integration.account?.code || '').trim() ||
      `Account ${integration.account?.code ?? integration.id}`;
    const parts = [
      projectLabel ? `Project ${projectLabel}` : 'Без проекта',
      accountLabel,
    ];
    if (integration.vkAdsAccountId)
      parts.push(`VK account ${integration.vkAdsAccountId}`);
    if (integration.vkAdsCabinetId)
      parts.push(`cabinet ${integration.vkAdsCabinetId}`);
    return parts.join(' · ');
  }

  async listActiveIntegrations(): Promise<VkAdsIntegrationListItem[]> {
    const integrations = await this.prisma.vkAdsAccountIntegration.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
      include: {
        account: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        project: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
          },
        },
      },
    });

    return integrations.map((integration) => ({
      id: integration.id,
      accountId: integration.accountId,
      projectId: integration.projectId ?? null,
      projectCode: integration.project?.code ?? null,
      projectName: integration.project?.name ?? null,
      name: integration.name ?? null,
      tokenEnvKey: integration.tokenEnvKey ?? null,
      vkAdsAccountId: integration.vkAdsAccountId ?? null,
      vkAdsCabinetId: integration.vkAdsCabinetId ?? null,
      isActive: integration.isActive,
      defaultPackageId: integration.defaultPackageId ?? null,
      adSourceId: (integration as any).adSourceId ?? null,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
      displayLabel: this.formatDisplayLabel(integration),
    }));
  }

  async listAdSources(): Promise<AdSourceListItem[]> {
    const sources = await this.prisma.adSource.findMany({
      orderBy: { id: 'asc' },
      include: {
        project: {
          select: { id: true, name: true, code: true },
        },
        vkAdsIntegration: {
          select: { id: true, name: true },
        },
      },
    });

    return sources.map((s) => ({
      id: s.id,
      title: s.title,
      workSpaceId: s.workSpaceId,
      groupId: s.groupId ?? null,
      projectId: (s as any).projectId ?? null,
      projectName: (s as any).project?.name ?? null,
      projectCode: (s as any).project?.code ?? null,
      vkIntegrationId: (s as any).vkAdsIntegration?.id ?? null,
      vkIntegrationName: (s as any).vkAdsIntegration?.name ?? null,
    }));
  }

  async findActiveIntegrationById(integrationId: number) {
    const integration = await this.prisma.vkAdsAccountIntegration.findFirst({
      where: {
        id: integrationId,
        isActive: true,
      },
      include: {
        account: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        project: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
          },
        },
      },
    });

    if (!integration) {
      throw new NotFoundException(
        `VK Ads integration not found or inactive: integrationId=${integrationId}`,
      );
    }

    return integration;
  }

  async resolveStatsProjectKeyByIntegrationId(
    integrationId: number,
  ): Promise<VkAdsStatsProjectKey | null> {
    const integration = await this.findActiveIntegrationById(integrationId);
    return this.resolveStatsProjectKeyFromProject(integration.project);
  }

  async resolveStatsProjectKeyByProjectId(
    projectId: number,
  ): Promise<VkAdsStatsProjectKey | null> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
      },
    });
    if (!project) return null;
    return this.resolveStatsProjectKeyFromProject(project);
  }

  async resolveIntegrationAuthContext(
    integrationId: number,
  ): Promise<VkAdsIntegrationAuthContext> {
    const integration = await this.findActiveIntegrationById(integrationId);
    const tokenEnvKey = String(integration.tokenEnvKey || '').trim();

    if (!tokenEnvKey) {
      throw new InternalServerErrorException(
        `VK Ads integration tokenEnvKey is empty: integrationId=${integrationId}`,
      );
    }

    const accessToken = String(process.env[tokenEnvKey] || '').trim();
    if (!accessToken) {
      throw new InternalServerErrorException(
        `VK Ads token not found in process.env for key ${tokenEnvKey}: integrationId=${integrationId}`,
      );
    }

    const baseUrl =
      String(integration.baseUrl || '').trim() ||
      String(process.env.VK_ADS_API_HOST || '').trim() ||
      DEFAULT_BASE_URL;

    return {
      integrationId: integration.id,
      accountId: integration.accountId,
      projectId: integration.projectId ?? null,
      projectCode: integration.project?.code ?? null,
      projectName: integration.project?.name ?? null,
      tokenEnvKey,
      accessToken,
      baseUrl,
    };
  }
}
