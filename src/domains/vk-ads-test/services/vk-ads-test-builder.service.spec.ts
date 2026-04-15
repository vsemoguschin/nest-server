import { VkAdsTestBuilderService } from './vk-ads-test-builder.service';

jest.mock(
  'src/prisma/prisma.service',
  () => ({
    PrismaService: class PrismaService {},
  }),
  { virtual: true },
);

describe('VkAdsTestBuilderService', () => {
  it('keeps only 9:16 video slots for a 9:16-like asset', () => {
    const service = new VkAdsTestBuilderService({} as any, {} as any);

    const content = (service as any).buildBannerContentFromTemplate(
      {
        icon_256x256: { id: 11, type: 'image' },
        video_portrait_9_16_30s: { id: 101, type: 'video' },
        video_portrait_9_16_180s: { id: 102, type: 'video' },
        video_portrait_4_5_30s: { id: 103, type: 'video' },
        video_portrait_4_5_180s: { id: 104, type: 'video' },
      },
      113383672,
      'portrait_9_16',
    );

    expect(content).toEqual({
      icon_256x256: { id: 11 },
      video_portrait_9_16_30s: { id: 113383672 },
      video_portrait_9_16_180s: { id: 113383672 },
    });
  });

  it('maps 600x1066 asset to portrait_9_16 profile', () => {
    const service = new VkAdsTestBuilderService({} as any, {} as any);

    const profile = (service as any).resolveVideoSlotProfile(600, 1066);

    expect(profile).toBe('portrait_9_16');
  });
});
