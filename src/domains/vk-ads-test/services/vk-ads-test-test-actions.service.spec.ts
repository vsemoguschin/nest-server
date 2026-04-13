import { VkAdsTestTestActionsService } from './vk-ads-test-test-actions.service';

jest.mock(
  'src/prisma/prisma.service',
  () => ({
    PrismaService: class PrismaService {},
  }),
  { virtual: true },
);

describe('VkAdsTestTestActionsService', () => {
  it('pauses active variants sequentially and keeps partial success report', async () => {
    const repository = createRepositoryMock([
      { id: 10, status: 'active' },
      { id: 11, status: 'active' },
      { id: 12, status: 'paused' },
    ]);
    const variantActions = {
      pauseVariant: jest
        .fn()
        .mockResolvedValueOnce({ id: 10 })
        .mockRejectedValueOnce(new Error('VK failed')),
      resumeVariant: jest.fn(),
    };
    const service = new VkAdsTestTestActionsService(
      repository as any,
      variantActions as any,
    );

    const report = await service.pauseTest(1);

    expect(variantActions.pauseVariant.mock.calls).toEqual([[10], [11]]);
    expect(report).toMatchObject({
      testId: 1,
      action: 'pause',
      total: 3,
      attempted: 2,
      succeeded: 1,
      failed: 1,
      skipped: 1,
    });
    expect(report.results).toEqual([
      { variantId: 10, status: 'succeeded' },
      { variantId: 11, status: 'failed', errorMessage: 'VK failed' },
      {
        variantId: 12,
        status: 'skipped',
        errorMessage: 'variant_status_not_active',
      },
    ]);
    expect(repository.updateTest).not.toHaveBeenCalled();
    expect(repository.logAction).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'test_paused' }),
    );
    expect(repository.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'test_action_completed',
        reason: 'pause',
      }),
    );
  });
});

function createRepositoryMock(variants: Array<{ id: number; status: string }>) {
  return {
    getTestForActions: jest.fn().mockResolvedValue({
      id: 1,
      variants,
    }),
    updateTest: jest.fn().mockResolvedValue(null),
    logAction: jest.fn().mockResolvedValue(null),
  };
}
