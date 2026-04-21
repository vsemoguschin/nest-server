import {
  VkAdsTestClientError,
} from '../clients/vk-ads-test.client';
import { VkAdsTestRuntimeStatusService } from './vk-ads-test-runtime-status.service';

jest.mock(
  'src/prisma/prisma.service',
  () => ({
    PrismaService: class PrismaService {},
  }),
  { virtual: true },
);

describe('VkAdsTestRuntimeStatusService', () => {
  it('maps VK ad plan statuses to runtime statuses', async () => {
    const client = createClientMock({
      getAdPlan: jest.fn().mockResolvedValue({ status: 'blocked' }),
    });
    const service = new VkAdsTestRuntimeStatusService(client as any);

    await expect(
      service.resolveTestRuntimeStatus({
        id: 1,
        accountIntegrationId: 5,
        vkCampaignId: 401,
      }),
    ).resolves.toBe('paused');
  });

  it('keeps runtimeStatus active when vkads_status reports account issue', async () => {
    const client = createClientMock({
      getAdPlan: jest.fn().mockResolvedValue({
        status: 'active',
        vkads_status: {
          status: 'ACCOUNT_INACTIVE',
          codes: ['ACCOUNT_SHOULD_BE_MORE_LIVE_MONEY'],
        },
      }),
    });
    const service = new VkAdsTestRuntimeStatusService(client as any);

    await expect(
      service.resolveTestRuntimeState({
        id: 1,
        accountIntegrationId: 5,
        vkCampaignId: 401,
      }),
    ).resolves.toEqual({
      testId: 1,
      runtimeStatus: 'active',
      runtimeIssue: 'insufficient_funds',
    });
  });

  it('maps deleted campaigns to missing runtime status', async () => {
    const client = createClientMock({
      getAdPlan: jest.fn().mockResolvedValue({
        status: 'deleted',
      }),
    });
    const service = new VkAdsTestRuntimeStatusService(client as any);

    await expect(
      service.resolveTestRuntimeStatus({
        id: 1,
        accountIntegrationId: 5,
        vkCampaignId: 401,
      }),
    ).resolves.toBe('missing');
  });

  it('extracts runtime issues from VK payload fields', async () => {
    const client = createClientMock({
      getAdPlan: jest.fn().mockResolvedValue({
        status: 'active',
        vkads_status: {
          codes: ['ACCOUNT_SHOULD_BE_MORE_LIVE_MONEY'],
        },
      }),
    });
    const service = new VkAdsTestRuntimeStatusService(client as any);

    await expect(
      service.resolveTestRuntimeState({
        id: 1,
        accountIntegrationId: 5,
        vkCampaignId: 401,
      }),
    ).resolves.toEqual({
      testId: 1,
      runtimeStatus: 'active',
      runtimeIssue: 'insufficient_funds',
    });
  });

  it('treats a successful adPlan response without status as unknown', async () => {
    const client = createClientMock({
      getAdPlan: jest.fn().mockResolvedValue({ id: 401 }),
    });
    const service = new VkAdsTestRuntimeStatusService(client as any);

    await expect(
      service.resolveTestRuntimeStatus({
        id: 1,
        accountIntegrationId: 5,
        vkCampaignId: 401,
      }),
    ).resolves.toBe('unknown');
  });

  it('requests runtime fields from getAdPlan', async () => {
    const getAdPlan = jest.fn().mockResolvedValue({
      id: 401,
      status: 'active',
      vkads_status: { status: 'active' },
    });
    const client = createClientMock({ getAdPlan });
    const service = new VkAdsTestRuntimeStatusService(client as any);

    await expect(
      service.resolveTestRuntimeState({
        id: 11,
        accountIntegrationId: 5,
        vkCampaignId: 401,
      }),
    ).resolves.toEqual({
      testId: 11,
      runtimeStatus: 'active',
      runtimeIssue: null,
    });

    expect(getAdPlan).toHaveBeenCalledWith(5, 401, {
      fields: ['status', 'vkads_status'],
    });
  });

  it('returns missing on 404 and unknown when campaign id is absent', async () => {
    const client = createClientMock({
      getAdPlan: jest
        .fn()
        .mockRejectedValue(
          new VkAdsTestClientError({
            message: 'not found',
            status: 404,
            method: 'GET',
            endpoint: '/api/v2/ad_plans/401.json',
          }),
        ),
    });
    const service = new VkAdsTestRuntimeStatusService(client as any);

    await expect(
      service.resolveTestRuntimeStatus({
        id: 1,
        accountIntegrationId: 5,
        vkCampaignId: 401,
      }),
    ).resolves.toBe('missing');
    await expect(
      service.resolveTestRuntimeState({
        id: 1,
        accountIntegrationId: 5,
        vkCampaignId: 401,
      }),
    ).resolves.toEqual({
      testId: 1,
      runtimeStatus: 'missing',
      runtimeIssue: 'deleted_entity',
    });
    await expect(
      service.resolveTestRuntimeStatus({
        id: 2,
        accountIntegrationId: 5,
        vkCampaignId: null,
      }),
    ).resolves.toBe('unknown');
  });

  it('maps VK errors with money-related messages to insufficient funds', async () => {
    const client = createClientMock({
      getAdPlan: jest
        .fn()
        .mockRejectedValue(
          new VkAdsTestClientError({
            message: 'Not enough funds',
            status: 400,
            method: 'GET',
            endpoint: '/api/v2/ad_plans/401.json',
            vkErrorMessage: 'Not enough funds',
          }),
        ),
    });
    const service = new VkAdsTestRuntimeStatusService(client as any);

    await expect(
      service.resolveTestRuntimeState({
        id: 3,
        accountIntegrationId: 5,
        vkCampaignId: 401,
      }),
    ).resolves.toEqual({
      testId: 3,
      runtimeStatus: 'error',
      runtimeIssue: 'insufficient_funds',
    });
  });

  it('treats active campaigns as active', async () => {
    const client = createClientMock({
      getAdPlan: jest.fn().mockResolvedValue({ status: 'active' }),
    });
    const service = new VkAdsTestRuntimeStatusService(client as any);

    const result = await service.resolveTestRuntimeStatus({
      id: 1,
      accountIntegrationId: 5,
      vkCampaignId: 401,
    });

    expect(result).toBe('active');
  });

  it('resolves runtime state for many tests', async () => {
    const client = createClientMock({
      getAdPlan: jest.fn().mockResolvedValue({ status: 'blocked' }),
    });
    const service = new VkAdsTestRuntimeStatusService(client as any);

    await expect(
      service.resolveManyTestsRuntimeState([
        { id: 1, accountIntegrationId: 5, vkCampaignId: 401 },
        { id: 2, accountIntegrationId: 5, vkCampaignId: null },
      ]),
    ).resolves.toEqual([
      { testId: 1, runtimeStatus: 'paused', runtimeIssue: null },
      { testId: 2, runtimeStatus: 'unknown', runtimeIssue: null },
    ]);
  });
});

function createClientMock(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    getAdPlan: overrides.getAdPlan ?? jest.fn(),
  };
}
