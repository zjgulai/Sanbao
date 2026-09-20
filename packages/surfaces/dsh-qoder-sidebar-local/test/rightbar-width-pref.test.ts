/**
 * 偏好层的回归测试。用假 storage 跑——这一层不许碰 DOM，所以也不需要 jsdom。
 *
 * 拦的都是「设置改了但界面不动」这一类：通知漏发、幂等判断把真实变更吃掉、
 * 脏值被当成合法值传下去。
 */
import { describe, expect, it } from 'vitest';
import { createRightbarPref, type WidthStorage } from '../src/client/rightbar-width-pref';
import { RIGHTBAR_WIDTH_KEY } from '../src/client/rightbar-width';

function fakeStorage(seed: Record<string, string> = {}): WidthStorage & { dump(): Record<string, string> } {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
    dump: () => Object.fromEntries(map),
  };
}

describe('读写', () => {
  it('拦「没设过时凭空造一个默认值」：空存储读出 null（= 交回官方）', () => {
    expect(createRightbarPref(fakeStorage()).read()).toBeNull();
  });

  it('拦「写进去读不出来」：write 后 read 拿到同一个整数', () => {
    const storage = fakeStorage();
    const pref = createRightbarPref(storage);
    pref.write(320);
    expect(pref.read()).toBe(320);
    expect(storage.dump()[RIGHTBAR_WIDTH_KEY]).toBe('320');
  });

  it('拦「小数被原样存进盘」：写入前一次取整，读出仍是整数', () => {
    const storage = fakeStorage();
    const pref = createRightbarPref(storage);
    pref.write(320.6);
    expect(storage.dump()[RIGHTBAR_WIDTH_KEY]).toBe('321');
    expect(pref.read()).toBe(321);
  });

  it('拦「脏值被当成合法设置」：非整数字面量读出 null', () => {
    expect(createRightbarPref(fakeStorage({ [RIGHTBAR_WIDTH_KEY]: '12.5' })).read()).toBeNull();
  });

  it('拦「撤掉设置后仍留着旧值」：write(null) 真的把键摘掉', () => {
    const storage = fakeStorage();
    const pref = createRightbarPref(storage);
    pref.write(360);
    pref.write(null);
    expect(pref.read()).toBeNull();
    expect(RIGHTBAR_WIDTH_KEY in storage.dump()).toBe(false);
  });
});

describe('通知', () => {
  it('拦「改了但覆写层不知道」：每次真实变更都广播一次新值', () => {
    const pref = createRightbarPref(fakeStorage());
    const seen: Array<number | null> = [];
    pref.subscribe((px) => seen.push(px));
    pref.write(300);
    pref.write(null);
    expect(seen).toEqual([300, null]);
  });

  it('拦「重复写同值刷爆订阅者」：值没变就不通知', () => {
    const pref = createRightbarPref(fakeStorage());
    let count = 0;
    pref.subscribe(() => { count += 1; });
    pref.write(300);
    pref.write(300);
    expect(count).toBe(1);
  });

  it('拦「没设过时的一次空撤掉也算变更」：初始 write(null) 保持安静', () => {
    const pref = createRightbarPref(fakeStorage());
    let count = 0;
    pref.subscribe(() => { count += 1; });
    pref.write(null);
    expect(count).toBe(0);
  });

  it('拦「退订后还在被叫」：退订句柄真的摘掉监听', () => {
    const pref = createRightbarPref(fakeStorage());
    let count = 0;
    const off = pref.subscribe(() => { count += 1; });
    off();
    pref.write(420);
    expect(count).toBe(0);
  });
});
