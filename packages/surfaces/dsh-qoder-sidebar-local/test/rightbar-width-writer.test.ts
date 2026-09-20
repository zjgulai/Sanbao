/**
 * `rightbar-width-writer.ts` 的能力探测与落点判定测试（DOM 侧由实机探针管）。
 *
 * 为什么探测本身要单测：官方把动作集收在 `LayoutController` 的 TS `private` 字段里
 * （运行时可见、类型上不可见），所以我们读的是**运行时实相**。这类「按属性找函数」的
 * 探测最坏的失效方式不是报错，而是**静默探到一个不是它的东西**——例如探到某个同名
 * 字段、或把抛异常当成调用成功。下面每条用例都钉一种错法。
 *
 * 同时钉住「探不到就彻底不写」：null 必须一路传下去，而不是退化成写 DOM 覆写——
 * 那是 2026-09-20 实测会被外壳 250ms 内改回去的那条死路。
 */
import { describe, expect, it, vi } from 'vitest';
import { findRightbarWriter, planRightbarWrite } from '../src/client/rightbar-width-writer';

describe('能力探测', () => {
  it('拦「没有 layout 服务也硬写」：undefined / null / 标量一律判不可达', () => {
    for (const layout of [undefined, null, 42, 'layout', true]) {
      expect(findRightbarWriter(layout)).toBeNull();
    }
  });

  it('拦「探到同名非函数」：setRightbar 必须是函数', () => {
    expect(findRightbarWriter({ setRightbar: 42 })).toBeNull();
    expect(findRightbarWriter({ setRightbar: null })).toBeNull();
  });

  it('拦「只在自己身上找」：动作集挂在 LayoutController 的私有字段上，要认一层属性值', () => {
    const seen: number[] = [];
    const writer = findRightbarWriter({
      panels: { setRightbar: (px: number) => { seen.push(px); } },
      navigation: { abort: () => {} },
    });
    expect(writer).not.toBeNull();
    expect(writer?.set(360)).toBe(true);
    expect(seen).toEqual([360]);
  });

  it('拦「漏掉直接挂在服务对象上的情况」：layout 自身有 setRightbar 也算', () => {
    const seen: number[] = [];
    const writer = findRightbarWriter({ setRightbar: (px: number) => { seen.push(px); } });
    expect(writer?.set(420)).toBe(true);
    expect(seen).toEqual([420]);
  });

  it('拦「把抛异常当成写成功」：调用抛错必须报 false（否则界面显示成功而布局没动）', () => {
    const writer = findRightbarWriter({
      panels: { setRightbar: () => { throw new Error('store disposed'); } },
    });
    expect(writer?.set(360)).toBe(false);
  });

  it('拦「遍历遇上 null / 函数 / 数组就炸」：一层属性值各种实相都要安全跳过', () => {
    const setter = vi.fn();
    const writer = findRightbarWriter({
      a: null,
      b: () => {},
      c: [1, 2, 3],
      d: 'name',
      panels: { setRightbar: setter },
    });
    expect(writer?.set(300)).toBe(true);
    expect(setter).toHaveBeenCalledWith(300);
  });

  it('拦「探测时把 setter 冻住」：调用时立刻重读持有者上的那个函数（外壳重挂动作后不写成旧 store）', () => {
    const first = vi.fn();
    const second = vi.fn();
    const layout: { panels: { setRightbar: (px: number) => void } } = { panels: { setRightbar: first } };
    const writer = findRightbarWriter(layout);
    layout.panels.setRightbar = second;
    writer?.set(380);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(380);
  });
});

describe('落点判定（写不写、写多少）', () => {
  it('拦「没人设置过却被我们改了宽度」：未设偏好一律 skip，不抢外壳首开的 45%', () => {
    expect(planRightbarWrite(null, 1376, null)).toEqual({ kind: 'skip', reason: 'no-pref' });
  });

  it('拦「同一个值反复写」：与上次生效值相同时 skip（否则每次 resize 都惊动外壳）', () => {
    expect(planRightbarWrite(400, 1376, 400)).toEqual({ kind: 'skip', reason: 'already-applied' });
  });

  it('拦「窗口变窄后越界」：写进去的是钳后的值，不是存储原值', () => {
    expect(planRightbarWrite(5000, 1000, null)).toEqual({ kind: 'write', px: 700 });
    expect(planRightbarWrite(200, 1000, null)).toEqual({ kind: 'write', px: 300 });
  });

  it('拦「脏请求把 NaN 写进外壳」：非有限值判 skip，不判 0', () => {
    expect(planRightbarWrite(Number.NaN, 1376, null)).toEqual({ kind: 'skip', reason: 'clamped-to-null' });
  });
});
