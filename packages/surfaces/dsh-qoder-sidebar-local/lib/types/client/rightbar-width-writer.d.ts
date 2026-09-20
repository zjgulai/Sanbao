import type { RightbarPref } from './rightbar-width-pref';
/** 探测结论落在 documentElement 上的属性名（验收按它点名，不靠日志）。 */
export declare const WRITER_PROBE_ATTR = "data-lute-rightbar-writer";
/** 官方宽度写入口的窄面。 */
export interface RightbarWriter {
    /** 走官方动作写入宽度；返回是否真的写成功。 */
    set(px: number): boolean;
}
/**
 * 从 layout 服务对象上探出官方宽度写入口。
 * @param layout - `ctx.get('layout')` 的返回值，形状由外壳决定。
 * @returns 可用的写入口；探不到时为 null。
 */
export declare function findRightbarWriter(layout: unknown): RightbarWriter | null;
export interface AttachDeps {
    /** 惰性取 layout 服务（裸读未声明服务在 cordis 里会抛，只能走 `ctx.get`）。 */
    readonly getLayout: () => unknown;
    readonly doc: Document;
    readonly win: Window;
    readonly pref: RightbarPref;
}
/** 官方写入口是否可达（验收读属性，不读日志）。 */
export type WriterVerdict = 'official' | 'unreachable';
/** 「这一次要不要写、写多少」的判定结果。 */
export type WritePlan = {
    readonly kind: "skip";
    readonly reason: "no-pref" | "clamped-to-null" | "already-applied";
} | {
    readonly kind: "write";
    readonly px: number;
};
/**
 * 落地点的核心判定：偏好存在、钳得过、且不是自己刚写过的那一值，才写。
 *
 * 「未设偏好就一个像素都不写」是这里最要紧的一条：外壳首开按视口 45% 自己算，
 * 抢先写一份就等于把一个没人点过的设置变成事实上的所有者。
 */
export declare function planRightbarWrite(stored: number | null, innerWidth: number, lastApplied: number | null): WritePlan;
/**
 * 挂上宽度落地点：把偏好写进外壳的 store，并把外壳自己的改动（拖把手）采纳回偏好。
 * @param deps - layout 取用器、文档、窗口与偏好句柄。
 * @returns 卸载函数。
 */
export declare function attachRightbarWidth({ getLayout, doc, win, pref }: AttachDeps): () => void;
/**
 * 实测右栏渲染宽度：读 frame 计算后的轨道末位（布局后一律是 px 用量值）。
 * 折叠态末轨为 0，判读不到——那不代表宽度是 0。
 */
export declare function measuredRightbarWidth(doc: Document, win: Window): number | null;
