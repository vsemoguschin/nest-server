import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  VkAdsTestClient,
  VkAdsUploadedContentResponse,
} from '../clients/vk-ads-test.client';
import { UploadVideoAssetDto } from '../dto/upload-video-asset.dto';
import { VkAdsTestRepository } from '../repositories/vk-ads-test.repository';

type NormalizedVideoAssetPayload = {
  previewUrl: string | null;
  videoUrl: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  status: 'processing' | 'ready' | 'failed';
};

type VariantCandidate = {
  key: string;
  url: string;
  mediaType: string | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
};

@Injectable()
export class VkAdsTestVideoAssetsService {
  constructor(
    private readonly repository: VkAdsTestRepository,
    private readonly client: VkAdsTestClient,
  ) {}

  async uploadVideo(dto: UploadVideoAssetDto, file?: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Video file is required');
    }

    const test = await this.repository.findTestById(dto.testId);
    if (!test) {
      throw new NotFoundException(`VK Ads test not found: id=${dto.testId}`);
    }

    const rawContent = await this.client.uploadVideoContent(
      test.accountIntegrationId,
      {
        file,
        width: dto.width,
        height: dto.height,
      },
    );
    const vkContentId = this.requireNumber(
      rawContent.id,
      'VK Ads video upload response does not contain numeric id',
    );
    const normalized = this.normalizeUploadedContent(rawContent);

    const asset = await this.repository.createVideoAsset({
      test: { connect: { id: test.id } },
      accountIntegration: { connect: { id: test.accountIntegrationId } },
      vkContentId,
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      rawContentJson: rawContent as Prisma.InputJsonValue,
      previewUrl: normalized.previewUrl,
      videoUrl: normalized.videoUrl,
      width: normalized.width,
      height: normalized.height,
      durationSec: normalized.durationSec,
      status: normalized.status,
    });

    await this.repository.logAction({
      test: { connect: { id: test.id } },
      action: 'video_asset_uploaded',
      payloadJson: {
        videoAssetId: asset.id,
        vkContentId: asset.vkContentId,
        status: asset.status,
      },
    });

    return this.toVideoAssetListItem(asset);
  }

  async listVideos(params: { testId?: number; accountIntegrationId?: number }) {
    const accountIntegrationId = await this.resolveAccountIntegrationId(params);
    const assets = await this.repository.listVideoAssetsByIntegration(
      accountIntegrationId,
    );
    return {
      items: assets.map((asset) => this.toVideoAssetListItem(asset)),
    };
  }

  async ensureVideoAssetForCreative(testId: number, videoAssetId: number) {
    const test = await this.repository.findTestById(testId);
    if (!test) {
      throw new NotFoundException(`VK Ads test not found: id=${testId}`);
    }

    const asset = await this.repository.findVideoAssetByIntegration(
      test.accountIntegrationId,
      videoAssetId,
    );
    if (!asset) {
      throw new BadRequestException(
        `VK Ads test video asset not found: testId=${testId}, videoAssetId=${videoAssetId}`,
      );
    }

    return asset;
  }

  private async resolveAccountIntegrationId(params: {
    testId?: number;
    accountIntegrationId?: number;
  }): Promise<number> {
    if (params.accountIntegrationId !== undefined) {
      const integration = await this.repository.findIntegrationById(
        params.accountIntegrationId,
      );

      if (!integration) {
        throw new NotFoundException(
          `VK Ads integration not found: id=${params.accountIntegrationId}`,
        );
      }

      return integration.id;
    }

    if (params.testId !== undefined) {
      const test = await this.repository.findTestById(params.testId);
      if (!test) {
        throw new NotFoundException(`VK Ads test not found: id=${params.testId}`);
      }

      return test.accountIntegrationId;
    }

    throw new BadRequestException(
      'accountIntegrationId or testId is required to list video assets',
    );
  }

  private toVideoAssetListItem(asset: {
    id: number;
    vkContentId: number;
    name?: string | null;
    previewUrl: string | null;
    videoUrl: string | null;
    width: number | null;
    height: number | null;
    durationSec: number | null;
    status: string;
    createdAt?: Date;
  }) {
    return {
      id: asset.id,
      vkContentId: asset.vkContentId,
      name: asset.name ?? null,
      previewUrl: asset.previewUrl,
      videoUrl: asset.videoUrl,
      width: asset.width,
      height: asset.height,
      durationSec: asset.durationSec,
      status: asset.status,
      createdAt: asset.createdAt?.toISOString() ?? null,
    };
  }

  private normalizeUploadedContent(
    rawContent: VkAdsUploadedContentResponse,
  ): NormalizedVideoAssetPayload {
    const variants = this.extractVariants(rawContent);
    const videoVariant = this.pickBestVideoVariant(variants);
    const previewVariant = this.pickBestPreviewVariant(variants);
    const bestDimensions = videoVariant ?? previewVariant ?? null;

    return {
      previewUrl: previewVariant?.url ?? null,
      videoUrl: videoVariant?.url ?? null,
      width: bestDimensions?.width ?? null,
      height: bestDimensions?.height ?? null,
      durationSec: videoVariant?.durationSec ?? null,
      status: videoVariant?.url ? 'ready' : 'processing',
    };
  }

  private extractVariants(
    rawContent: VkAdsUploadedContentResponse,
  ): VariantCandidate[] {
    const variants = this.asRecord(rawContent.variants);
    if (!variants) {
      return [];
    }

    return Object.entries(variants)
      .map(([key, value]) => {
        const record = this.asRecord(value);
        const url =
          record && typeof record.url === 'string' && record.url.trim()
            ? record.url
            : null;

        if (!record || url === null) {
          return null;
        }

        return {
          key,
          url,
          mediaType:
            typeof record.media_type === 'string' ? record.media_type : null,
          width: this.asNumber(record.width),
          height: this.asNumber(record.height),
          durationSec: this.extractDurationSec(record),
        };
      })
      .filter((item): item is VariantCandidate => item !== null);
  }

  private pickBestVideoVariant(
    variants: VariantCandidate[],
  ): VariantCandidate | null {
    const videoVariants = variants.filter((variant) =>
      this.isVideoVariant(variant),
    );

    if (!videoVariants.length) {
      return null;
    }

    return [...videoVariants].sort((left, right) => {
      return this.scoreVideoVariant(left) - this.scoreVideoVariant(right);
    })[0];
  }

  private pickBestPreviewVariant(
    variants: VariantCandidate[],
  ): VariantCandidate | null {
    const previewVariants = variants.filter((variant) =>
      this.isPreviewVariant(variant),
    );

    if (!previewVariants.length) {
      return null;
    }

    return [...previewVariants].sort((left, right) => {
      return this.scorePreviewVariant(left) - this.scorePreviewVariant(right);
    })[0];
  }

  private isVideoVariant(variant: VariantCandidate): boolean {
    if (variant.mediaType === 'video') {
      return true;
    }

    return this.hasVideoExtension(variant.url);
  }

  private isPreviewVariant(variant: VariantCandidate): boolean {
    if (variant.mediaType === 'image') {
      return true;
    }

    if (this.hasImageExtension(variant.url)) {
      return true;
    }

    return /(frame|preview|poster|thumb)/i.test(variant.key);
  }

  private scoreVideoVariant(variant: VariantCandidate): number {
    const extensionScore = variant.url.endsWith('.mp4')
      ? 0
      : variant.url.endsWith('.m3u8')
        ? 10
        : 20;
    const keyScoreMap: Record<string, number> = {
      original: 0,
      uploaded: 1,
      internal: 2,
      low: 3,
      mobile: 4,
      'master-hls': 5,
    };
    const keyScore = keyScoreMap[variant.key] ?? 20;
    const sizePenalty =
      (variant.width ?? 0) > 0 && (variant.height ?? 0) > 0
        ? -Math.min((variant.width ?? 0) * (variant.height ?? 0), 10_000_000) /
          10_000_000
        : 0;

    return extensionScore + keyScore + sizePenalty;
  }

  private scorePreviewVariant(variant: VariantCandidate): number {
    const keyScore = /(poster|preview|thumb)/i.test(variant.key)
      ? 0
      : /first_frame/i.test(variant.key)
        ? 1
        : /last_frame/i.test(variant.key)
          ? 2
          : 10;
    const imagePenalty =
      (variant.width ?? 0) > 0 && (variant.height ?? 0) > 0
        ? -Math.min((variant.width ?? 0) * (variant.height ?? 0), 10_000_000) /
          10_000_000
        : 0;

    return keyScore + imagePenalty;
  }

  private extractDurationSec(value: Record<string, unknown>): number | null {
    const integerLength = this.asNumber(value.length);
    if (integerLength !== null) {
      return Math.round(integerLength);
    }

    const floatLength = this.asNumber(value.float_length);
    if (floatLength !== null) {
      return Math.round(floatLength);
    }

    return null;
  }

  private hasVideoExtension(url: string): boolean {
    return /\.(mp4|m3u8)(\?|$)/i.test(url);
  }

  private hasImageExtension(url: string): boolean {
    return /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url);
  }

  private requireNumber(value: unknown, message: string): number {
    const parsed = this.asNumber(value);
    if (parsed === null) {
      throw new BadRequestException(message);
    }

    return parsed;
  }

  private asNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }
}
