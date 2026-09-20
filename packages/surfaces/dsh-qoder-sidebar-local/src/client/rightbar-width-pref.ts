/**
 * 右栏宽度的**偏好层**：localStorage 读写 + 变更广播。
 *
 * 单独一层的原因：设置行（写）与覆写层（读）必须共用同一个家，否则会出现
 * 「设置改了但界面不动」这种两处各存一份的漂移（总账 P-07）。这里只放
 * 「值怎么存、怎么通知」，区间与轨道计算全在 `rightbar-width.ts`。
 *
 * 依赖注入式（storage 与 queueMicrotask 可换）是为了能在 node 里直接测——
 * 不引 jsdom，也不把 DOM 拉进这一层。
 */
import {
  formatStoredWidth,
  parseStoredWidth,
  RIGHTBAR_WIDTH_KEY,
} from './rightbar-width';

/** 读写右栏宽度偏好的最小面。`null` = 未设，交回官方宽度。 */
export interface RightbarPref {
  read(): number | null;
  /** 写入宽度；传 `null` 撤掉设置。 */
  write(px: number | null): void;
  subscribe(listener: (px: number | null) => void): () => void;
}

/** 只用到三个方法的存储形状（真 localStorage 与测试桩同型）。 */
export interface WidthStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * 建一个偏好句柄。
 * @param storage - 存储后端（真机传 `window.localStorage`）。
 * @returns 读写 + 订阅面。
 */
export function createRightbarPref(storage: WidthStorage): RightbarPref {
  const listeners = new Set<(px: number | null) => void>();

  const notify = (): void => {
    const value = read();
    for (const listener of listeners) listener(value);
  };

  function read(): number | null {
    return parseStoredWidth(storage.getItem(RIGHTBAR_WIDTH_KEY));
  }

  function write(px: number | null): void {
    const current = read();
    if (px === null) {
      if (current === null) return;
      storage.removeItem(RIGHTBAR_WIDTH_KEY);
      notify();
      return;
    }
    const next = formatStoredWidth(px);
    if (current === Number(next)) return;
    storage.setItem(RIGHTBAR_WIDTH_KEY, next);
    notify();
  }

  function subscribe(listener: (px: number | null) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return { read, write, subscribe };
}
