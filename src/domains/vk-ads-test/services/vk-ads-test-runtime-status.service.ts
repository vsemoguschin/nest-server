import { Injectable, Logger } from '@nestjs/common';
import {
  VkAdsTestClient,
  VkAdsTestClientError,
} from '../clients/vk-ads-test.client';

// ---------------------------------------------------------------------------
// TTL cache for ad_plan runtime state.
// Prevents repeated VK API calls when listTests() is called in rapid succession
// (e.g. UI polling, multiple tabs, background refresh).
//
// TTL is per integrationId:campaignId key. Stale entries are evicted lazily.
// ENV:  VK_ADS_RUNTIME_CACHE_TTL_MS  (default: 10 minutes)
// ---------------------------------------------------------------------------
const DEFAULT_RUNTIME_CACHE_TTL_MS = 10 * 60 * 1_000; // 10 minutes
const RUNTIME_CACHE_TTL_MS = (() => {
  const raw = process.env['VK_ADS_RUNTIME_CACHE_TTL_MS'];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RUNTIME_CACHE_TTL_MS;
})();

type CachedRuntimeState = {
  result: VkAdsTestRuntimeStateResult;
  expiresAt: number;
};

export type VkAdsTestRuntimeStatus =
  | 'active'
  | 'paused'
  | 'missing'
  | 'error'
  | 'unknown';

export type VkAdsTestRuntimeIssue =
  | 'insufficient_funds'
  | 'moderation_problem'
  | 'rejected'
  | 'deleted_entity'
  | 'unknown_issue';

export type VkAdsTestRuntimeStatusTarget = {
  id: number;
  accountIntegrationId: number;
  vkCampaignId: number | null;
};

export type VkAdsTestRuntimeStatusResult = {
  testId: number;
  runtimeStatus: VkAdsTestRuntimeStatus;
};

export type VkAdsTestRuntimeStateResult = {
  testId: number;
  runtimeStatus: VkAdsTestRuntimeStatus;
  runtimeIssue: VkAdsTestRuntimeIssue | null;
};

type AdPlanRecord = Record<string, unknown>;

const AD_PLAN_RUNTIME_FIELDS = ['status', 'vkads_status'];

@Injectable()
export class VkAdsTestRuntimeStatusService {
  private readonly logger = new Logger(VkAdsTestRuntimeStatusService.name);
  private readonly stateCache = new Map<string, CachedRuntimeState>();

  constructor(private readonly client: VkAdsTestClient) {}

  private getCacheKey(integrationId: number, campaignId: number): string {
    return `${integrationId}:${campaignId}`;
  }

  private getCached(integrationId: number, campaignId: number): VkAdsTestRuntimeStateResult | null {
    const key = this.getCacheKey(integrationId, campaignId);
    const entry = this.stateCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.stateCache.delete(key);
      return null;
    }
    return entry.result;
  }

  private setCached(integrationId: number, campaignId: number, result: VkAdsTestRuntimeStateResult): void {
    const key = this.getCacheKey(integrationId, campaignId);
    this.stateCache.set(key, { result, expiresAt: Date.now() + RUNTIME_CACHE_TTL_MS });
  }

  invalidateCache(integrationId: number, campaignId: number): void {
    const key = this.getCacheKey(integrationId, campaignId);
    if (this.stateCache.has(key)) {
      this.stateCache.delete(key);
      this.logger.debug(
        JSON.stringify({
          scope: 'vk-ads-test-runtime-status',
          event: 'cache_invalidate',
          integrationId,
          campaignId,
        }),
      );
    }
  }

  async resolveTestRuntimeStatus(
    test: VkAdsTestRuntimeStatusTarget,
  ): Promise<VkAdsTestRuntimeStatus> {
    if (test.vkCampaignId == null) {
      return 'unknown';
    }

    return this.resolveCampaignRuntimeStatus(
      test.accountIntegrationId,
      test.vkCampaignId,
    );
  }

  async resolveManyTestsRuntimeStatus(
    tests: VkAdsTestRuntimeStatusTarget[],
  ): Promise<VkAdsTestRuntimeStatusResult[]> {
    return Promise.all(
      tests.map(async (test) => ({
        testId: test.id,
        runtimeStatus: await this.resolveTestRuntimeStatus(test),
      })),
    );
  }

  async resolveTestRuntimeState(
    test: VkAdsTestRuntimeStatusTarget,
  ): Promise<VkAdsTestRuntimeStateResult> {
    if (test.vkCampaignId == null) {
      return {
        testId: test.id,
        runtimeStatus: 'unknown',
        runtimeIssue: null,
      };
    }

    const cached = this.getCached(test.accountIntegrationId, test.vkCampaignId);
    if (cached) {
      this.logger.debug(
        JSON.stringify({
          scope: 'vk-ads-test-runtime-status',
          event: 'resolveTestRuntimeState.cache_hit',
          testId: test.id,
          vkCampaignId: test.vkCampaignId,
          runtimeStatus: cached.runtimeStatus,
        }),
      );
      return { ...cached, testId: test.id };
    }

    try {
      const adPlan = await this.client.getAdPlan(
        test.accountIntegrationId,
        test.vkCampaignId,
        { fields: AD_PLAN_RUNTIME_FIELDS },
      );
      const runtimeStatusDebug =
        this.collectAdPlanRuntimeStatusDebug(adPlan);
      const runtimeStatus = this.normalizeAdPlanRuntimeStatus(adPlan);
      const runtimeIssue = this.normalizeAdPlanRuntimeIssue(adPlan);

      this.logger.warn(
        JSON.stringify({
          scope: 'vk-ads-test-runtime-status',
          event: 'resolveTestRuntimeState',
          testId: test.id,
          vkCampaignId: test.vkCampaignId,
          rawAdPlan: adPlan,
          runtimeStatusDebug,
          normalizedRuntimeStatus: runtimeStatus,
          normalizedRuntimeIssue: runtimeIssue,
        }),
      );

      const result: VkAdsTestRuntimeStateResult = {
        testId: test.id,
        runtimeStatus,
        runtimeIssue,
      };
      this.setCached(test.accountIntegrationId, test.vkCampaignId, result);
      return result;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          scope: 'vk-ads-test-runtime-status',
          event: 'resolveTestRuntimeState.error',
          testId: test.id,
          vkCampaignId: test.vkCampaignId,
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                }
              : error,
        }),
      );

      return {
        testId: test.id,
        runtimeStatus: this.normalizeErrorRuntimeStatus(error),
        runtimeIssue: this.normalizeErrorRuntimeIssue(error),
      };
    }
  }

  async resolveManyTestsRuntimeState(
    tests: VkAdsTestRuntimeStatusTarget[],
  ): Promise<VkAdsTestRuntimeStateResult[]> {
    // Sequential — not Promise.all — to avoid N parallel VK reads at once.
    // The rate limiter in VkAdsTestClient provides the final guard, but
    // serializing here keeps the queue short and reduces head-of-line blocking.
    const results: VkAdsTestRuntimeStateResult[] = [];
    for (const test of tests) {
      results.push(await this.resolveTestRuntimeState(test));
    }
    return results;
  }

  private async resolveCampaignRuntimeStatus(
    accountIntegrationId: number,
    vkCampaignId: number,
  ): Promise<VkAdsTestRuntimeStatus> {
    try {
      const adPlan = await this.client.getAdPlan(
        accountIntegrationId,
        vkCampaignId,
        { fields: AD_PLAN_RUNTIME_FIELDS },
      );

      const runtimeStatus = this.normalizeAdPlanRuntimeStatus(adPlan);
      this.logger.warn(
        JSON.stringify({
          scope: 'vk-ads-test-runtime-status',
          event: 'resolveCampaignRuntimeStatus',
          accountIntegrationId,
          vkCampaignId,
          rawAdPlan: adPlan,
          runtimeStatusDebug: this.collectAdPlanRuntimeStatusDebug(adPlan),
          normalizedRuntimeStatus: runtimeStatus,
        }),
      );

      return runtimeStatus;
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          scope: 'vk-ads-test-runtime-status',
          event: 'resolveCampaignRuntimeStatus.error',
          accountIntegrationId,
          vkCampaignId,
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                }
              : error,
        }),
      );

      return this.normalizeErrorRuntimeStatus(error);
    }
  }

  private normalizeAdPlanRuntimeIssue(
    entity: AdPlanRecord,
  ): VkAdsTestRuntimeIssue | null {
    if (!entity || typeof entity !== 'object') {
      return null;
    }

    return this.normalizeVkAdsIssue(entity.vkads_status);
  }

  private normalizeAdPlanRuntimeStatus(
    entity: AdPlanRecord,
  ): VkAdsTestRuntimeStatus {
    if (!entity || typeof entity !== 'object') {
      return 'error';
    }

    const status = this.asString(entity.status);

    if (status === 'active') {
      return 'active';
    }

    if (status === 'deleted') {
      return 'missing';
    }

    if (status === 'blocked') {
      return 'paused';
    }

    if (Object.keys(entity).length > 0) {
      return 'unknown';
    }

    return 'error';
  }

  private normalizeVkAdsIssue(value: unknown): VkAdsTestRuntimeIssue | null {
    const record = this.asRecord(value);
    if (!record) {
      return null;
    }

    const issueCandidates = [
      ...this.normalizeCodesIssue(record.codes),
      this.extractIssueCandidate(record.issue),
      this.extractIssueCandidate(record.problem),
      this.extractIssueCandidate(record.reason),
      this.extractIssueCandidate(record.status_reason),
      this.extractIssueCandidate(record.statusReason),
      this.normalizeModerationIssue(record.moderation_status),
      this.normalizeModerationIssue(record.moderationStatus),
    ];

    for (const candidate of issueCandidates) {
      if (candidate) {
        return candidate;
      }
    }

    return null;
  }

  private normalizeVkAdsStatus(value: unknown): VkAdsTestRuntimeStatus | null {
    const record = this.asRecord(value);
    if (!record) {
      return null;
    }

    const statusLikeKeys = [
      'status',
      'state',
      'delivery',
      'delivery_status',
      'activity',
      'activity_status',
      'mode',
      'broadcast_status',
      'transmission_status',
      'is_active',
      'active',
    ];

    for (const key of statusLikeKeys) {
      const normalized = this.normalizeStatusLikeValue(record[key]);
      if (normalized) {
        return normalized;
      }
    }

    for (const candidate of Object.values(record)) {
      const normalized = this.normalizeStatusLikeValue(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  private collectAdPlanRuntimeStatusDebug(entity: AdPlanRecord) {
    if (!entity || typeof entity !== 'object') {
      return {
        status: null,
        vkads_status: null,
        statusLikeFields: [],
      };
    }

    const statusLikeKeys = [
      'status',
      'state',
      'delivery',
      'delivery_status',
      'activity',
      'activity_status',
      'mode',
      'broadcast_status',
      'transmission_status',
      'is_active',
      'active',
    ] as const;

    return {
      status: this.asString(entity.status) || null,
      vkads_status: this.asRecord(entity.vkads_status),
      statusLikeFields: statusLikeKeys
        .map((key) => {
          const value = this.readStatusLikeField(entity, key);
          return value === null ? null : { key, value };
        })
        .filter((value) => value !== null),
    };
  }

  private normalizeStatusLikeValue(
    value: unknown,
  ): VkAdsTestRuntimeStatus | null {
    if (typeof value === 'boolean') {
      return value ? 'active' : 'paused';
    }

    const normalized = this.asString(value).trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    if (
      normalized === 'deleted' ||
      normalized.includes('deleted') ||
      normalized.includes('removed') ||
      normalized.includes('archived')
    ) {
      return 'missing';
    }

    if (
      normalized === 'blocked' ||
      normalized.includes('blocked') ||
      normalized === 'paused' ||
      normalized.includes('paused') ||
      normalized === 'stopped' ||
      normalized.includes('stopped') ||
      normalized === 'inactive' ||
      normalized.includes('inactive') ||
      normalized.includes('not_delivering') ||
      normalized.includes('not delivering') ||
      normalized.includes('suspended') ||
      normalized === 'off'
    ) {
      return 'paused';
    }

    if (
      normalized === 'active' ||
      normalized.includes('active') ||
      normalized.includes('delivering') ||
      normalized.includes('enabled') ||
      normalized.includes('running') ||
      normalized.includes('showing') ||
      normalized.includes('broadcasting') ||
      normalized.includes('transmitting')
    ) {
      return 'active';
    }

    return null;
  }

  private normalizeCodesIssue(
    value: unknown,
  ): Array<VkAdsTestRuntimeIssue | null> {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.map((entry) => {
      const normalized = this.asString(entry).trim().toLowerCase();
      if (!normalized) {
        return null;
      }

      if (
        normalized.includes('money') ||
        normalized.includes('fund') ||
        normalized.includes('balance') ||
        normalized.includes('payment')
      ) {
        return 'insufficient_funds';
      }

      if (
        normalized.includes('moderation') ||
        normalized.includes('review') ||
        normalized.includes('pending')
      ) {
        return 'moderation_problem';
      }

      if (
        normalized.includes('reject') ||
        normalized.includes('ban') ||
        normalized.includes('blocked') ||
        normalized.includes('deny')
      ) {
        return 'rejected';
      }

      if (
        normalized.includes('delete') ||
        normalized.includes('removed') ||
        normalized.includes('archive')
      ) {
        return 'deleted_entity';
      }

      return 'unknown_issue';
    });
  }

  private normalizeErrorRuntimeStatus(
    error: unknown,
  ): VkAdsTestRuntimeStatus {
    if (error instanceof VkAdsTestClientError) {
      if (error.status === 404) {
        return 'missing';
      }

      return 'error';
    }

    return 'error';
  }

  private normalizeErrorRuntimeIssue(
    error: unknown,
  ): VkAdsTestRuntimeIssue | null {
    if (!(error instanceof VkAdsTestClientError)) {
      return null;
    }

    if (error.status === 404) {
      return 'deleted_entity';
    }

    const candidates = [
      this.extractIssueCandidate(error.vkErrorCode),
      this.extractIssueCandidate(error.vkErrorMessage),
      this.extractIssueCandidate(error.message),
      this.extractIssueCandidate(
        typeof error.rawError === 'object' && error.rawError
          ? (error.rawError as { reason?: unknown; problem?: unknown }).reason ??
              (error.rawError as { reason?: unknown; problem?: unknown }).problem
          : undefined,
      ),
    ];

    for (const candidate of candidates) {
      if (candidate) {
        return candidate as VkAdsTestRuntimeIssue;
      }
    }

    return null;
  }

  private extractIssueCandidate(
    value: unknown,
  ): VkAdsTestRuntimeIssue | null {
    const normalized = this.asString(value).trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    if (
      normalized.includes('fund') ||
      normalized.includes('balance') ||
      normalized.includes('money') ||
      normalized.includes('insufficient')
    ) {
      return 'insufficient_funds';
    }

    if (
      normalized.includes('moderation') ||
      normalized.includes('review') ||
      normalized.includes('pending')
    ) {
      return 'moderation_problem';
    }

    if (
      normalized.includes('reject') ||
      normalized.includes('denied') ||
      normalized.includes('blocked')
    ) {
      return 'rejected';
    }

    if (normalized.includes('delete') || normalized.includes('removed')) {
      return 'deleted_entity';
    }

    return 'unknown_issue';
  }

  private normalizeModerationIssue(
    value: unknown,
  ): VkAdsTestRuntimeIssue | null {
    const normalized = this.asString(value).trim().toLowerCase();
    if (!normalized || normalized === 'allowed') {
      return null;
    }

    if (
      normalized === 'denied' ||
      normalized === 'rejected' ||
      normalized === 'reject'
    ) {
      return 'rejected';
    }

    if (
      normalized === 'moderation' ||
      normalized === 'pending' ||
      normalized === 'review' ||
      normalized === 'checking'
    ) {
      return 'moderation_problem';
    }

    if (normalized.includes('delete')) {
      return 'deleted_entity';
    }

    return 'unknown_issue';
  }

  private asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private asRecord(value: unknown): AdPlanRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as AdPlanRecord;
  }

  private readStatusLikeField(entity: AdPlanRecord, key: string) {
    if (!entity || typeof entity !== 'object') {
      return null;
    }

    if (!(key in entity)) {
      return null;
    }

    return (entity as Record<string, unknown>)[key];
  }
}
