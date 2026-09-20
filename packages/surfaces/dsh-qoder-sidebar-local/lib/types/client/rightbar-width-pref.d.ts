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
export declare function createRightbarPref(storage: WidthStorage): RightbarPref;
