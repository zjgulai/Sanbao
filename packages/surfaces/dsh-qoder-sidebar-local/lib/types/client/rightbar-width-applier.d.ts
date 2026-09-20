import type { RightbarPref } from './rightbar-width-pref';
/** 我们自己打上的标记：覆写规则只认它，射程完全由本包掌握。 */
export declare const SIZED_ATTR = "data-lute-rightbar-sized";
/** 承载「替换后的三轨」的自定义属性名。 */
export declare const TRACKS_VAR = "--lute-rightbar-cols";
interface ApplierDeps {
    readonly doc: Document;
    readonly win: Window;
    readonly pref: RightbarPref;
}
/**
 * 挂上覆写层。
 * @param deps - 文档、窗口与偏好句柄。
 * @returns 卸载函数（观察器与事件全部摘掉）。
 */
export declare function attachRightbarWidth({ doc, win, pref }: ApplierDeps): () => void;
export {};
