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
export declare function createRightbarWidthFace({ pref, frameWidth, current }: FaceDeps): RightbarWidthFace;
