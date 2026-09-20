import {
  OccupancyReviewStatus,
  OccupancyWorkbenchAction,
  SINOSURE_EXPOSURE_HIGH_REVIEW_REASON,
  isOccupancyHighApproved,
  isOccupancyWorkbenchAction,
  matchingOccupancyReview,
  occupancyActionNextStatus,
  occupancyFingerprint,
  planOccupancyReviewSync,
} from './occupancy-review';

const highExp = { occupancyFen: 7_500_000, excessFen: 2_500_000, insuredLimitFen: 5_000_000 };

describe('占用高风险工作台审核', () => {
  it('指纹按占用/超额/限额锁定，金额一变须重审', () => {
    expect(occupancyFingerprint(highExp)).toBe('7500000|2500000|5000000');
    expect(occupancyFingerprint({ ...highExp, excessFen: 2_500_001 })).not.toBe(
      occupancyFingerprint(highExp),
    );
  });

  it('领取 / 放行 / 驳回状态机：放行后可过闸，驳回后仍阻断', () => {
    expect(occupancyActionNextStatus(OccupancyReviewStatus.OPEN, OccupancyWorkbenchAction.CLAIM)).toEqual({
      ok: true,
      status: OccupancyReviewStatus.CLAIMED,
    });
    expect(occupancyActionNextStatus(OccupancyReviewStatus.CLAIMED, OccupancyWorkbenchAction.APPROVE)).toEqual({
      ok: true,
      status: OccupancyReviewStatus.APPROVED,
    });
    expect(occupancyActionNextStatus(OccupancyReviewStatus.OPEN, OccupancyWorkbenchAction.APPROVE)).toEqual({
      ok: true,
      status: OccupancyReviewStatus.APPROVED,
    });
    expect(occupancyActionNextStatus(OccupancyReviewStatus.CLAIMED, OccupancyWorkbenchAction.REJECT)).toEqual({
      ok: true,
      status: OccupancyReviewStatus.REJECTED,
    });
    expect(occupancyActionNextStatus(OccupancyReviewStatus.REJECTED, OccupancyWorkbenchAction.CLAIM)).toEqual({
      ok: true,
      status: OccupancyReviewStatus.CLAIMED,
    });
    expect(occupancyActionNextStatus(OccupancyReviewStatus.REJECTED, OccupancyWorkbenchAction.APPROVE)).toEqual({
      ok: true,
      status: OccupancyReviewStatus.APPROVED,
    });
    expect(occupancyActionNextStatus(OccupancyReviewStatus.APPROVED, OccupancyWorkbenchAction.REJECT).ok).toBe(
      false,
    );
    expect(isOccupancyWorkbenchAction('CLAIM')).toBe(true);
    expect(isOccupancyWorkbenchAction('FALSE_POSITIVE')).toBe(false);
  });

  it('仅匹配同一节点且指纹一致的已放行记录', () => {
    const reviews = [
      {
        id: 'old',
        nodeCode: 'N3',
        status: OccupancyReviewStatus.APPROVED,
        ...highExp,
        fingerprint: occupancyFingerprint(highExp),
      },
    ];
    expect(isOccupancyHighApproved(reviews, 'N3', highExp)).toBe(true);
    expect(isOccupancyHighApproved(reviews, 'N4', highExp)).toBe(false);
    expect(isOccupancyHighApproved(reviews, 'N3', { ...highExp, occupancyFen: 8_000_000 })).toBe(false);
    expect(matchingOccupancyReview(reviews, 'N3', highExp)?.id).toBe('old');
  });

  it('HIGH 无匹配任务则入列；中风险/超高风险不建审核任务', () => {
    const existing = [
      {
        id: 'open-1',
        nodeCode: 'N3',
        status: OccupancyReviewStatus.OPEN,
        occupancyFen: 6_000_000,
        excessFen: 2_000_000,
        insuredLimitFen: 4_000_000,
        fingerprint: '6000000|2000000|4000000',
      },
    ];
    const high = planOccupancyReviewSync(existing, 'N3', { band: 'HIGH', ...highExp, currency: 'USD' });
    expect(high.create?.status).toBe(OccupancyReviewStatus.OPEN);
    expect(high.supersedeIds).toEqual(['open-1']);

    const keep = planOccupancyReviewSync(
      [{ id: 'keep', nodeCode: 'N3', status: OccupancyReviewStatus.CLAIMED, ...highExp }],
      'N3',
      { band: 'HIGH', ...highExp },
    );
    expect(keep.keepId).toBe('keep');
    expect(keep.create).toBeUndefined();

    expect(planOccupancyReviewSync(existing, 'N3', { band: 'MEDIUM', ...highExp }).create).toBeUndefined();
    expect(planOccupancyReviewSync(existing, 'N3', { band: 'ULTRA_HIGH', ...highExp }).supersedeIds).toEqual([
      'open-1',
    ]);
    expect(SINOSURE_EXPOSURE_HIGH_REVIEW_REASON).toContain('工作台');
  });
});
