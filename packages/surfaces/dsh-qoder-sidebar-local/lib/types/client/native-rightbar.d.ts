/**
 * 原生右栏（`@deepseek-ai/dsh-client-ui-sidebar-right`）的**最小契约面**。
 *
 * 本包不引那个包的类型：它不在本包的依赖表里，货架上跑的是应用自带的那一份
 * （`0.1.5-rc.2`），为几个方法装一份可能版本不符的类型源不划算。因此这里只声明
 * 我们真正用到的成员，并把 `ctx` 的转型集中在这一个文件——调用点保持类型安全，
 * 转型只有两处，各自写明为什么。
 *
 * 用到的两条路径（与 `ui-sidebar-documentpreview` 一致）：
 *   1. 标签类型登记：`ctx.sidebarRightTabs.register({ id, kind, title, … })`
 *   2. 标签体登记：`ctx.slots.register({ name: 'sidebar.right.pane.tab', key: id }, Body)`
 * 打开：`ctx.sidebarRight.openTab(kind)`——它同一步里展开右栏。
 */
import type { ComponentType } from 'react';
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/** 指南页上的一张入口卡（原生 `SidebarRightGuideEntry`）。 */
export interface NativeGuideEntry {
    /** 升序位置。 */
    readonly order: number;
    /** 卡片标题（thunk，语言变化时重读）。 */
    readonly title: () => string;
    /** 标题下的一行说明。 */
    readonly description?: () => string;
}
/** 标签类型的静态面（阶段一）。字段与原生 `SidebarRightTabDefinition` 的前半一致。 */
export interface NativeTabDefinition {
    /** 本实现在标签系统里的身份；也是标签体登记时的 `key`。 */
    readonly id: string;
    /** 类型判别符：`openTab` 用它点名。 */
    readonly kind: string;
    /** 优先级带；从产品外来的类型是 `extension`。 */
    readonly priority?: 'extension' | 'builtin' | 'fallback';
    /** 标签条上的标题（thunk，语言变化时重读）。 */
    readonly title: () => string;
    /**
     * 指南页的入口卡。**只有一个条目时它就是右栏的默认页**（原生 `defaultSeed`），
     * 所以本包贡献这一条 = 右栏一打开就是工作台。
     */
    readonly guide?: readonly NativeGuideEntry[];
}
/** 标签类型注册表（原生 `ctx.sidebarRightTabs` 的登记面）。 */
export interface NativeTabRegistry {
    register(definition: NativeTabDefinition): () => void;
}
/** 右栏导航面（原生 `ctx.sidebarRight` 里本包用到的读法与打开手势）。 */
export interface NativeSidebarRight {
    /** 按 kind 打开一个页面标签；同一步里把右栏展开。 */
    openTab(kind: string): void;
    /** 右栏此刻是否展开（没有座位挂载时为 false）。 */
    isExpanded(): boolean;
    /** 活动标签的记录；没有座位时为 undefined。 */
    active(): {
        readonly kind?: string;
    } | undefined;
}
/** 座位登记面：本包只用「注入 + 登记」两个方法，slot 名由原生包声明。 */
export interface NativeSlots {
    inject(name: string, callback: () => unknown): () => void;
    register(registration: NativeRegistration, component: ComponentType): () => void;
}
/**
 * 一次 keyed 登记。
 * `inject` 是**业务面工厂**（原生 `SlotCore.register` 的 inject 载）：会话槽的工厂
 * 按位置收到 `sessionId`，返回的面里 `hooks.<name>` 会被框架绑成组件的 `use<Name>`
 * 选择器钩子（见原生 `SlotInjectFace`）。本包只用这一条通道把会话事件流递给标签体。
 *
 * `id` / `order` / `label` 只在**导航类座位**上用（如 `settings.general.item`）：
 * 原生把「标签体座位」与「带导航身份的座位」分成两套选项，本包两边都要用，
 * 所以合成一份声明并把导航字段标成可选——缺省时原生按 key 处理。
 */
export interface NativeRegistration {
    readonly name: string;
    readonly key: string;
    readonly id?: string;
    readonly order?: number;
    readonly label?: () => string;
    readonly inject?: (sessionId: string) => Record<string, unknown>;
}
/**
 * 取标签类型注册表。
 * @param ctx - 客户端根上下文。
 * @returns 注册表；服务缺失（原生包未装载）时 undefined。
 */
export declare function nativeTabRegistry(ctx: ClientContext): NativeTabRegistry | undefined;
/**
 * 取右栏导航面。
 * @param ctx - 客户端根上下文。
 * @returns 导航面；服务缺失时 undefined。
 */
export declare function nativeRightbar(ctx: ClientContext): NativeSidebarRight | undefined;
/**
 * 取座位登记面（`ctx.slots` 的窄化）。
 * @param ctx - 客户端根上下文。
 * @returns `sidebar.right.pane.tab` 这种带 key 的登记入口。
 */
export declare function nativeSlots(ctx: ClientContext): NativeSlots;
