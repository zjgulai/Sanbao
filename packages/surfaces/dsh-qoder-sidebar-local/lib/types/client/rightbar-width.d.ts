/**
 * 右栏宽度的**纯**契约层：区间、官方默认、存储编解码。
 *
 * ## 区间为什么是「镜像」而不是自创
 * 真正钳位的是外壳：`setRightbar(px)` 用 `columns.ts` 的
 * `clampWidth(px, RIGHTBAR_MIN, max(RIGHTBAR_MIN, viewportWidth × RIGHTBAR_MAX_RATIO))`
 * 再钳一次（`vendor/dsh-desktop/deepseek-harness/packages/client/ui-layout/src/client/stores.ts`）。
 * 我们镜像同一组数字，唯一的目的是让设置页显示的值**等于外壳真会给的值**——
 * 否则会出现「设置写 240、面板渲染 300」这种界面在说谎的状态。
 *
 * 镜像的代价是「上游改了数字而这里不知道」。抵消它的不是注释，是实机探针
 * （`scripts/acceptance/right-sidebar-width-live.mjs`）两端对钉：请求 200 实测 300、
 * 请求 9999 实测 `floor(视口 × 0.7)`。数字漂了，探针红。
 *
 * ## 为什么不在这里做 DOM
 * 这一层零 DOM、零外壳知识（除了上面那组常量），所以能在 node 里直接测；
 * 落地点在 `rightbar-width-writer.ts`，设置行在 `rightbar-width-row.tsx`。
 */
/** 偏好键：本包唯一持有者（设置行与落地点都读写它，不存在第二个家）。 */
export declare const RIGHTBAR_WIDTH_KEY = "dsh-qoder-sidebar:rightbar-width";
/** 外壳的右栏下限（`columns.ts` RIGHTBAR_MIN）。 */
export declare const MIN_RIGHTBAR_WIDTH = 300;
/** 外壳的右栏上限比例（`columns.ts` RIGHTBAR_MAX_RATIO）：视口的 70%。 */
export declare const MAX_RIGHTBAR_WIDTH_RATIO = 0.7;
/** 外壳首开右栏的比例（`columns.ts` RIGHTBAR_DEFAULT_RATIO）。 */
export declare const OFFICIAL_DEFAULT_RATIO = 0.45;
/** 视口宽度读不到时的兜底帧宽（本机常见窗口宽；读得到时一律用实测）。 */
export declare const FALLBACK_FRAME_WIDTH = 1280;
/**
 * 本视口下允许的最宽右栏。
 * @param frameWidth - 视口宽。
 * @returns 上限（不低于下限，避免窄窗口里钳出负区间）。
 */
export declare function rightbarWidthCeiling(frameWidth: number): number;
/**
 * 把任意输入钳成外壳会接受的值。
 * @param requested - 用户要的值（可能来自脏存储、步进、或 NaN）。
 * @param frameWidth - 视口宽。
 * @returns 钳后的整数宽度；非有限请求判 null（不写）。
 */
export declare function clampRightbarWidth(requested: number, frameWidth: number): number | null;
/**
 * 外壳的默认右栏宽：等于 `openRightbar` 里的 `max(RIGHTBAR_MIN, round(视口 × 0.45))`。
 * 「跟随默认」要写的就是这个值（外壳没有「把 rightbar 重置为 null」的动作）。
 * @param frameWidth - 视口宽。
 * @returns 官方默认宽度。
 */
export declare function officialRightbarWidth(frameWidth: number): number;
/**
 * 解析存储值。只接受**十进制整数字面量**——`"12.5"` / `"1e3"` / `""` / `"abc"`
 * 一律判脏（脏值不猜意图，直接回落到默认宽度）。
 * @param raw - localStorage 的原始读数，或 null。
 * @returns 请求宽度，或 null。
 */
export declare function parseStoredWidth(raw: string | null): number | null;
/** 序列化（钳位由读取侧负责，这里只做字面量转换）。 */
export declare function formatStoredWidth(px: number): string;
