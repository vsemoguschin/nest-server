import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { VkAdsTestRepository } from '../repositories/vk-ads-test.repository';

export type VkAdsTestAuthContext = {
  integrationId: number;
  accountId: number;
  baseUrl: string;
  tokenEnvKey: string;
  accessToken: string;
};

const DEFAULT_VK_ADS_BASE_URL = 'https://ads.vk.com';

@Injectable()
export class VkAdsTestAuthService {
  constructor(private readonly repository: VkAdsTestRepository) {}

  async resolveAuthContext(
    integrationId: number,
  ): Promise<VkAdsTestAuthContext> {
    const integration = await this.repository.findIntegrationById(integrationId);

    if (!integration) {
      throw new NotFoundException(
        `VK Ads integration not found: integrationId=${integrationId}`,
      );
    }

    if (!integration.isActive) {
      throw new InternalServerErrorException(
        `VK Ads integration is inactive: integrationId=${integrationId}`,
      );
    }

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
      String(integration.baseUrl || '').trim() || DEFAULT_VK_ADS_BASE_URL;

    return {
      integrationId: integration.id,
      accountId: integration.accountId,
      baseUrl,
      tokenEnvKey,
      accessToken,
    };
  }
}
