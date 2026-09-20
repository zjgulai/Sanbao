/**
 * 设置行**动作**的语义层：步进、跟随默认、显示值。
 *
 * 单独一层的理由与 `rightbar-width-pref.ts` 同源：设置行是渲染，落地点是副作用，
 * 而「步进从哪儿起步、钳到边界算不算变更」这两件事既不属于渲染也不属于 DOM，
 * 它们是**决定**。放在这里就能在 node 里逐条测（不引 jsdom），实机只负责把它渲染出来。
 *
 * 三条规矩：
 *   1. 步进的基准 = 用户**眼睛看到的宽度**（实测右栏宽），未设且实测读不到时才退到
 *      外壳首开口径。从区间中点起步是错的——那会让第一次点击把面板跳到别处。
 *   2. 写入前一定过一遍 {@link clampRightbarWidth}（镜像外壳的区间），所以设置页显示的
 *      值就是外壳会给的值。
 *   3. 「跟随默认」= 清掉偏好（外壳没有「重置 rightbar」的动作）。清空是一次**广播**，
 *      落地点听到后把外壳当前宽度显式送回官方默认值——不广播的话布局会停在旧宽度。
 */
import { clampRightbarWidth, officialRightbarWidth } from './rightbar-width';
import type { RightbarPref } from './rightbar-width-pref';

/** 设置行要用到的全部能力（行本身不碰 storage、不碰 DOM）。 */
export interface RightbarWidthFace {
  /** 已存偏好；`null` = 未设（跟着外壳默认走）。 */
  read(): number | null;
  /** 界面要显示的值：钳后的生效宽度；未设时为 `null`（界面显示「默认」）。 */
  effective(): number | null;
  /** 按步进改宽度（钳到外壳区间内）。 */
  nudge(delta: number): void;
  /** 回到外壳默认宽度（视口 × 0.45），并清掉偏好。 */
  useOfficial(): void;
  /** 偏好变更广播（含拖拽采纳；撤销订阅用返回的句柄）。 */
  subscribe(listener: (px: number | null) => void): () => void;
}

/** face 的依赖：偏好句柄 + 两个实测读数（视口宽、当前右栏渲染宽）。 */
export interface FaceDeps {
  readonly pref: RightbarPref;
  /** 视口宽（钳位与官方默认用）。 */
  readonly frameWidth: () => number;
  /** 当前渲染出来的右栏宽（步进基准用；读不到为 null）。 */
  readonly current: () => number | null;
}

/**
 * 建一个设置行动作面。
 * @param deps - 偏好句柄与两个实测读数。
 * @returns 动作面。
 */
export function createRightbarWidthFace({ pref, frameWidth, current }: FaceDeps): RightbarWidthFace {
  return {
    read: () => pref.read(),
    effective: () => {
      const stored = pref.read();
      return stored === null ? null : clampRightbarWidth(stored, frameWidth());
    },
    nudge: (delta: number) => {
      const base = pref.read() ?? current() ?? officialRightbarWidth(frameWidth());
      const next = clampRightbarWidth(base + delta, frameWidth());
      if (next !== null) pref.write(next);
    },
    useOfficial: () => {
      pref.write(null);
    },
    subscribe: (listener) => pref.subscribe(listener),
  };
}
