/**
 * `rightbar-width-face.ts` 的回归测试：设置行**动作**的语义。
 *
 * 这一层替设置行做决定，所以必须能在 node 里测（不引 jsdom）：步进的基准从哪来、
 * 钳到边界时还算不算一次变更、「跟随默认」到底写什么。
 *
 * 拦的都是「设置页显示的值与外壳真给的值不是一回事」这一类：基准取错（未设时从
 * 区间中点起步而不是从眼睛看到的宽度起步）、钳位漏了一侧、以及未设时凭空造一个
 * 默认值写进存储（那会让用户在别的窗口宽度下也拿到同一个数）。
 */
import { describe, expect, it } from 'vitest';
import { createRightbarWidthFace } from '../src/client/rightbar-width-face';
import { createRightbarPref, type WidthStorage } from '../src/client/rightbar-width-pref';
import { MIN_RIGHTBAR_WIDTH, RIGHTBAR_WIDTH_KEY } from '../src/client/rightbar-width';

function fakeStorage(seed: Record<string, string> = {}): WidthStorage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
  };
}

interface Harness {
  readonly pref: ReturnType<typeof createRightbarPref>;
  readonly face: ReturnType<typeof createRightbarWidthFace>;
  readonly raw: () => string | null;
  readonly notifications: number[];
}

function setup(opts: {
  seed?: Record<string, string>;
  frameWidth?: number;
  current?: number | null;
} = {}): Harness {
  const storage = fakeStorage(opts.seed);
  const pref = createRightbarPref(storage);
  const notifications: number[] = [];
  const face = createRightbarWidthFace({
    pref,
    frameWidth: () => opts.frameWidth ?? 1376,
    current: () => (opts.current === undefined ? null : opts.current),
  });
  pref.subscribe((px) => { notifications.push(px ?? -1); });
  return { pref, face, raw: () => storage.getItem(RIGHTBAR_WIDTH_KEY), notifications };
}

describe('显示值', () => {
  it('未设偏好时 effective 为 null：界面显示「默认」而不是造一个数', () => {
    expect(setup().face.effective()).toBeNull();
  });

  it('钳后才显示：存储里的 5000 在 1000px 窗口上显示 700', () => {
    const h = setup({ seed: { [RIGHTBAR_WIDTH_KEY]: '5000' }, frameWidth: 1000 });
    expect(h.face.effective()).toBe(700);
    // 显示不写回存储：窗口拉宽后用户原本要的 5000 还在
    expect(h.raw()).toBe('5000');
  });

  it('拦脏存储：非整数字面量判未设，不四舍五入猜意图', () => {
    const h = setup({ seed: { [RIGHTBAR_WIDTH_KEY]: '1e3' } });
    expect(h.face.read()).toBeNull();
    expect(h.face.effective()).toBeNull();
  });
});

describe('步进基准', () => {
  it('已设时从存储值起步：+40 得到存储值 +40', () => {
    const h = setup({ seed: { [RIGHTBAR_WIDTH_KEY]: '400' } });
    h.face.nudge(40);
    expect(h.raw()).toBe('440');
  });

  it('未设时从**眼睛看到的**宽度起步，而不是从区间中点', () => {
    const h = setup({ current: 500 });
    h.face.nudge(40);
    expect(h.raw()).toBe('540');
  });

  it('未设且实测读不到时退到外壳首开口径（视口 × 0.45）', () => {
    const h = setup({ current: null, frameWidth: 1000 });
    h.face.nudge(0);
    expect(h.raw()).toBe('450');
  });

  it('钳到上界仍是一次有效写入，且不越界', () => {
    const h = setup({ seed: { [RIGHTBAR_WIDTH_KEY]: '960' }, frameWidth: 1000 });
    h.face.nudge(40);
    expect(h.raw()).toBe('700');
  });

  it('拦「把窗口宽当预算」：窄窗口里上限是视口的 70%，不是固定 720', () => {
    const h = setup({ seed: { [RIGHTBAR_WIDTH_KEY]: '700' }, frameWidth: 800 });
    h.face.nudge(40);
    expect(h.raw()).toBe('560');
  });
});

describe('跟随默认', () => {
  it('清掉偏好并广播一次 null：落地点据此把外壳宽度送回官方默认', () => {
    const h = setup({ seed: { [RIGHTBAR_WIDTH_KEY]: '500' } });
    h.face.useOfficial();
    expect(h.raw()).toBeNull();
    expect(h.notifications).toEqual([-1]);
  });

  it('本来未设时再点「跟随默认」不产生噪声通知', () => {
    const h = setup();
    h.face.useOfficial();
    expect(h.notifications).toEqual([]);
  });
});
