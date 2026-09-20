/**
 * 会话活动折叠：把**本会话自己的事件流**折成右栏那几栏「产物」。
 *
 * 参照形态（Qoder 的右侧栏）不是常驻看板：**空白会话里什么都没有**，AI 开始调用
 * 工具、产出资源时，一栏一栏地出现。所以数据不能取「机器上有什么」（git 状态、
 * 技能清单、进程表），只能取**这个会话做过什么**——事件流是唯一权威源。
 *
 * 事件形状（原生 `SessionEvent`，见 dsh-session 的 types）是**信封**：
 *   `{ type, seq, time, data }` —— 负载在 `data` 里，不在事件对象本身上。
 * 折叠读的四种负载：
 *   · `tool/call`   —— `data: { callId, name, arguments }`（arguments 是模型给的原始 JSON 串）
 *   · `tool/result` —— `data.message.source.callId` 回填成败（`data.error` 或 `content[0].isError`）
 *   · `user/message`—— 人给的图片/文件块 → 来源
 *   · `deliverables/presented` —— 工具显式交付的文件 → 产出
 *
 * 折叠结果按「有内容的栏才出现」输出（见 `SessionActivity.sections`），空会话返回空数组。
 */
/** 事件窗口里的一格（与 `SessionEventWindow.entries` 同形，不引它的类型：本包不依赖该包）。 */
export interface ActivityEventEntry {
    readonly type: string;
    readonly event?: {
        readonly type?: string;
        /** 信封里的负载（原生 `SessionEvent.data`）；形状由事件类型决定。 */
        readonly data?: {
            readonly [key: string]: unknown;
        };
    };
}
/** 一栏里的一行。 */
export interface ActivityItem {
    readonly label: string;
    readonly meta?: string;
    readonly state?: 'running' | 'done' | 'error';
}
/** 有内容的一栏。 */
export interface ActivitySection {
    readonly id: string;
    /** 18px 网格的图标源码（与左栏/设置页同一批图标风格）。 */
    readonly icon: string;
    readonly label: string;
    readonly items: readonly ActivityItem[];
}
/** 一次折叠的产物：只有非空的栏。 */
export interface SessionActivity {
    readonly sections: readonly ActivitySection[];
}
/** 只读可订阅源（本包不引 `dsh-client-store` 的类型，形状够用即可）。 */
export interface ActivitySource {
    getSnapshot(): SessionActivity;
    subscribe(listener: () => void): () => void;
}
/** 栏的固定次序（与参照形态一致）。 */
declare const SECTIONS: readonly [{
    readonly id: "env";
    readonly icon: "<svg viewBox=\"0 0 16 16\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"8\" cy=\"8\" r=\"3\"/><path d=\"M8 1v3M8 12v3M1 8h3M12 8h3\"/></svg>";
    readonly label: "环境信息";
}, {
    readonly id: "background-procs";
    readonly icon: "<svg viewBox=\"0 0 16 16\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M8 3v2M8 11v2M3 8h2M11 8h2M4.93 4.93l1.41 1.41M9.66 9.66l1.41 1.41M4.93 11.07l1.41-1.41M9.66 6.34l1.41-1.41\"/></svg>";
    readonly label: "后台进程";
}, {
    readonly id: "skills-mcp";
    readonly icon: "<svg viewBox=\"0 0 16 16\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M8 2l-3 6h3l-2 6 3-6h-3z\"/></svg>";
    readonly label: "技能与 MCP";
}, {
    readonly id: "outputs";
    readonly icon: "<svg viewBox=\"0 0 16 16\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3.5 4.5l4.5-2.5 4.5 2.5v5l-4.5 2.5-4.5-2.5v-5z\"/><path d=\"M8 7v5\"/></svg>";
    readonly label: "产出";
}, {
    readonly id: "web-search";
    readonly icon: "<svg viewBox=\"0 0 16 16\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"7\" cy=\"7\" r=\"4.4\"/><path d=\"M10.4 10.4L14 14\"/></svg>";
    readonly label: "网页查阅";
}, {
    readonly id: "sources";
    readonly icon: "<svg viewBox=\"0 0 16 16\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 3h8v10H4z\"/><path d=\"M4 3v10a2 2 0 002 2h6\"/></svg>";
    readonly label: "来源";
}];
type SectionId = (typeof SECTIONS)[number]['id'];
/**
 * 把一个会话的事件窗口折成「有内容的栏」。
 * @param entries - 事件窗口的条目（只读；`transient` 条目忽略）。
 * @returns 只有非空栏的活动视图；空白会话得到 `{ sections: [] }`。
 */
export declare function foldSessionActivity(entries: readonly ActivityEventEntry[]): SessionActivity;
/** 栏的图标（视图层画表头用；`env` 不在折叠输出里，由视图层按 git 状态补）。 */
export declare const SECTION_ICONS: {
    readonly [id in SectionId]: string;
};
/**
 * 包一层带记忆的源：窗口没变（`revision` 相同）就不重算，快照引用保持稳定。
 * @param window - 原生的事件窗口源。
 * @returns 折叠后的活动源，可交给注册的 `hooks` 隔间。
 */
export declare function activitySource(window: {
    getSnapshot(): {
        entries: readonly ActivityEventEntry[];
        revision?: unknown;
    };
    subscribe(listener: () => void): () => void;
}): ActivitySource;
export {};
