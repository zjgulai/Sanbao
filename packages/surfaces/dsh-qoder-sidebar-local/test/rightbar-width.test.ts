/**
 * `rightbar-width.ts` 的回归测试：区间、官方默认、存储编解码。
 *
 * 这一层的区间**不是我们自己发明的**：它镜像外壳 `columns.ts` 的
 * `RIGHTBAR_MIN` / `RIGHTBAR_MAX_RATIO` / `RIGHTBAR_DEFAULT_RATIO`
 * ——外壳的 `setRightbar` 会用同一组常量再钳一次。镜像的意义是让设置页显示的值
 * 等于外壳真会给的值；镜像的代价是「上游改了数字而我们不知道」，所以实机探针
 * 必须把两端钉住（请求 200 → 实测 300；请求 9999 → 实测 floor(视口×0.7)），
 * 否则这里的绿色只是「我们和自己一致」。
 */
import { describe, expect, it } from 'vitest';
import {
  clampRightbarWidth,
  FALLBACK_FRAME_WIDTH,
  formatStoredWidth,
  MAX_RIGHTBAR_WIDTH_RATIO,
  MIN_RIGHTBAR_WIDTH,
  OFFICIAL_DEFAULT_RATIO,
  officialRightbarWidth,
  parseStoredWidth,
  RIGHTBAR_WIDTH_KEY,
  rightbarWidthCeiling,
} from '../src/client/rightbar-width';

describe('区间（镜像外壳 columns.ts）', () => {
  it('镜像的常量本身就是判据：改了它们必须同时改实机探针', () => {
    expect(MIN_RIGHTBAR_WIDTH).toBe(300);
    expect(MAX_RIGHTBAR_WIDTH_RATIO).toBe(0.7);
    expect(OFFICIAL_DEFAULT_RATIO).toBe(0.45);
  });

  it('拦「设置口把右栏放到读不动」：低于下限的请求被抬到外壳下限 300', () => {
    expect(clampRightbarWidth(200, 1376)).toBe(300);
    expect(clampRightbarWidth(0, 1376)).toBe(300);
  });

  it('拦「一滑就铺满」：上限是视口的 70%（外壳的同一条比例）', () => {
    expect(rightbarWidthCeiling(1376)).toBe(963);
    expect(rightbarWidthCeiling(1000)).toBe(700);
    expect(clampRightbarWidth(5000, 1000)).toBe(700);
  });

  it('拦「小窗口里钳出一个比下限还低的上限」：上限不低于下限', () => {
    expect(rightbarWidthCeiling(300)).toBe(300);
    expect(clampRightbarWidth(400, 300)).toBe(300);
  });

  it('拦「窗口宽读不到时按 0 算」：非有限视口回落到兜底帧宽，不是 300', () => {
    expect(rightbarWidthCeiling(Number.NaN)).toBe(Math.floor(FALLBACK_FRAME_WIDTH * 0.7));
    expect(clampRightbarWidth(420, Number.NaN)).toBe(420);
    expect(clampRightbarWidth(420, -1)).toBe(420);
  });

  it('拦「NaN/Infinity 被当成合法请求」', () => {
    expect(clampRightbarWidth(Number.NaN, 1376)).toBeNull();
    expect(clampRightbarWidth(Number.POSITIVE_INFINITY, 1376)).toBeNull();
  });

  it('拦「Qoder 区间被钳坏」：360–420 在常见窗口里原样通过', () => {
    for (const px of [360, 400, 420]) {
      expect(clampRightbarWidth(px, 1376)).toBe(px);
      expect(clampRightbarWidth(px, 1024)).toBe(px);
    }
  });
});

describe('官方默认宽度（跟随默认 = 外壳首开口径）', () => {
  it('拦「跟随默认把面板缩成 0」：等于外壳 openRightbar 的 max(300, round(视口×0.45))', () => {
    expect(officialRightbarWidth(1376)).toBe(619);
    expect(officialRightbarWidth(1000)).toBe(450);
    expect(officialRightbarWidth(300)).toBe(300);
  });

  it('拦「视口读不到时凭空造默认宽」：回落到兜底帧宽而不是 0', () => {
    expect(officialRightbarWidth(Number.NaN)).toBe(Math.round(FALLBACK_FRAME_WIDTH * 0.45));
  });
});

describe('存储编解码', () => {
  it('键名是本包唯一事实源（改名会让老用户静默失去设置）', () => {
    expect(RIGHTBAR_WIDTH_KEY).toBe('dsh-qoder-sidebar:rightbar-width');
  });

  it('拦「脏值被 Number() 静默解释」：空串/小数/科学计数/负数/文字一律判脏', () => {
    for (const raw of ['', ' 12', '12.5', '1e3', '-300', 'abc', '0x12c', '300px', 'Infinity']) {
      expect(parseStoredWidth(raw)).toBeNull();
    }
  });

  it('拦「合法值被误判成脏」：整数字面量原样读出', () => {
    expect(parseStoredWidth('320')).toBe(320);
    expect(parseStoredWidth('720')).toBe(720);
  });

  it('拦「超长数字变成不精确的浮点」：超出安全整数判脏', () => {
    expect(parseStoredWidth('99999999999999999999')).toBeNull();
  });

  it('写盘只做整数化，不偷偷二次钳位（钳位是读取侧的判定）', () => {
    expect(formatStoredWidth(320.4)).toBe('320');
    expect(parseStoredWidth(formatStoredWidth(320.4))).toBe(320);
  });
});
