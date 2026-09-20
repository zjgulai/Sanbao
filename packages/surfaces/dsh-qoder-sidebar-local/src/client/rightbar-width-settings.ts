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
import { nativeSlots } from './native-rightbar';
import { createRightbarWidthFace } from './rightbar-width-face';
import { RightbarWidthRow } from './rightbar-width-row';
import type { RightbarPref } from './rightbar-width-pref';
import { measuredRightbarWidth } from './rightbar-width-writer';

/** 偏好行的稳定 id（诊断与验收按它点名）。 */
export const SETTINGS_ROW_ID = 'qoder-sidebar-width';

/**
 * 登记偏好行。
 * @param ctx - 客户端根上下文。
 * @param pref - 宽度偏好句柄（行写它、落地点读它，两处同一个家）。
 * @returns 卸载函数。
 */
export function registerRightbarWidthSettings(ctx: ClientContext, pref: RightbarPref): () => void {
  const face = createRightbarWidthFace({
    pref,
    frameWidth: () => window.innerWidth,
    current: () => measuredRightbarWidth(document, window),
  });
  const slots = nativeSlots(ctx);
  return slots.inject('settings.general.item', () =>
    slots.register(
      {
        name: 'settings.general.item',
        key: SETTINGS_ROW_ID,
        id: SETTINGS_ROW_ID,
        // 落在通用页既有行的后面：官方登记过的 order 最大到 3，留足插入空间。
        order: 40,
        label: () => '右侧栏宽度',
        inject: () => ({ face }),
      },
      RightbarWidthRow as never,
    ),
  ) as () => void;
}
