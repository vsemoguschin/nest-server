import { VkAdsTestVideoAssetsService } from './vk-ads-test-video-assets.service';

jest.mock(
  'src/prisma/prisma.service',
  () => ({
    PrismaService: class PrismaService {},
  }),
  { virtual: true },
);

describe('VkAdsTestVideoAssetsService', () => {
  it('uploads video asset, normalizes preview/video urls and stores raw payload', async () => {
    const repository = {
      findTestById: jest.fn().mockResolvedValue({
        id: 12,
        accountIntegrationId: 34,
      }),
      createVideoAsset: jest.fn().mockImplementation(async (data) => ({
        id: 56,
        createdAt: new Date('2026-04-15T10:00:00.000Z'),
        ...data,
      })),
      logAction: jest.fn().mockResolvedValue(null),
      listVideoAssetsByTest: jest.fn(),
      findVideoAssetByTest: jest.fn(),
    };
    const client = {
      uploadVideoContent: jest.fn().mockResolvedValue({
        id: 113372284,
        variants: {
          original: {
            url: 'https://cdn.example.com/video.mp4',
            width: 720,
            height: 1280,
            length: 23,
          },
          'mobile-first_frame': {
            media_type: 'image',
            url: 'https://cdn.example.com/preview.jpg',
            width: 256,
            height: 454,
          },
          'master-hls': {
            media_type: 'video',
            url: 'https://cdn.example.com/master.m3u8',
            width: 720,
            height: 1280,
            length: 24,
          },
        },
      }),
    };
    const service = new VkAdsTestVideoAssetsService(
      repository as any,
      client as any,
    );

    const result = await service.uploadVideo(
      {
        testId: 12,
        name: 'Uploaded video',
        width: 720,
        height: 1280,
      },
      {
        buffer: Buffer.from('video'),
        originalname: 'video.mp4',
        mimetype: 'video/mp4',
      } as Express.Multer.File,
    );

    expect(client.uploadVideoContent).toHaveBeenCalledWith(34, {
      file: expect.objectContaining({ originalname: 'video.mp4' }),
      width: 720,
      height: 1280,
    });
    expect(repository.createVideoAsset).toHaveBeenCalledWith({
      test: { connect: { id: 12 } },
      accountIntegration: { connect: { id: 34 } },
      vkContentId: 113372284,
      name: 'Uploaded video',
      rawContentJson: expect.any(Object),
      previewUrl: 'https://cdn.example.com/preview.jpg',
      videoUrl: 'https://cdn.example.com/video.mp4',
      width: 720,
      height: 1280,
      durationSec: 23,
      status: 'ready',
    });
    expect(result).toEqual({
      id: 56,
      vkContentId: 113372284,
      name: 'Uploaded video',
      previewUrl: 'https://cdn.example.com/preview.jpg',
      videoUrl: 'https://cdn.example.com/video.mp4',
      width: 720,
      height: 1280,
      durationSec: 23,
      status: 'ready',
      createdAt: '2026-04-15T10:00:00.000Z',
    });
  });

  it('lists video assets by account integration with newest first', async () => {
    const repository = {
      findIntegrationById: jest.fn().mockResolvedValue({ id: 34 }),
      listVideoAssetsByIntegration: jest.fn().mockResolvedValue([
        {
          id: 57,
          vkContentId: 113383672,
          name: 'New video',
          previewUrl: 'https://cdn.example.com/new-preview.jpg',
          videoUrl: 'https://cdn.example.com/new-video.mp4',
          width: 600,
          height: 1066,
          durationSec: 10,
          status: 'ready',
          createdAt: new Date('2026-04-15T12:00:00.000Z'),
        },
      ]),
    };
    const service = new VkAdsTestVideoAssetsService(
      repository as any,
      {} as any,
    );

    const result = await service.listVideos({ accountIntegrationId: 34 });

    expect(repository.findIntegrationById).toHaveBeenCalledWith(34);
    expect(repository.listVideoAssetsByIntegration).toHaveBeenCalledWith(34);
    expect(result).toEqual({
      items: [
        {
          id: 57,
          vkContentId: 113383672,
          name: 'New video',
          previewUrl: 'https://cdn.example.com/new-preview.jpg',
          videoUrl: 'https://cdn.example.com/new-video.mp4',
          width: 600,
          height: 1066,
          durationSec: 10,
          status: 'ready',
          createdAt: '2026-04-15T12:00:00.000Z',
        },
      ],
    });
  });

  it('allows binding video asset from another test in the same integration', async () => {
    const repository = {
      findTestById: jest.fn().mockResolvedValue({
        id: 20,
        accountIntegrationId: 34,
      }),
      findVideoAssetByIntegration: jest.fn().mockResolvedValue({
        id: 1,
        testId: 12,
        accountIntegrationId: 34,
        vkContentId: 113383672,
      }),
    };
    const service = new VkAdsTestVideoAssetsService(
      repository as any,
      {} as any,
    );

    const result = await service.ensureVideoAssetForCreative(20, 1);

    expect(repository.findVideoAssetByIntegration).toHaveBeenCalledWith(34, 1);
    expect(result).toMatchObject({
      id: 1,
      testId: 12,
      accountIntegrationId: 34,
      vkContentId: 113383672,
    });
  });
});
