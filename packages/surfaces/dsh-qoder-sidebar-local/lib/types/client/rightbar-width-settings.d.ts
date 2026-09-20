/**
 * 把「右侧栏宽度」这一偏好行登记进官方设置页。
 *
 * 座位选择：原生 `settings.general.item` 的契约原文就是
 * 「一个不需要整页的偏好行，由拥有该偏好的功能包贡献」（先例：locale → Language、
 * ui-conversation → Composer Enter）。外观页本身是主题包的单体组件、没有可贡献的
 * 内层座位，而那个包此刻正被另一会话在写——本仓库禁止同包双写，所以走这条公开加法路。
 *
 * 这里也是**装配点**：动作面要的两个实测读数（视口宽、当前渲染宽）只有 settings 这层
 * 能拿到，行本身保持纯渲染。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { RightbarPref } from './rightbar-width-pref';
/** 偏好行的稳定 id（诊断与验收按它点名）。 */
export declare const SETTINGS_ROW_ID = "qoder-sidebar-width";
/**
 * 登记偏好行。
 * @param ctx - 客户端根上下文。
 * @param pref - 宽度偏好句柄（行写它、落地点读它，两处同一个家）。
 * @returns 卸载函数。
 */
export declare function registerRightbarWidthSettings(ctx: ClientContext, pref: RightbarPref): () => void;
