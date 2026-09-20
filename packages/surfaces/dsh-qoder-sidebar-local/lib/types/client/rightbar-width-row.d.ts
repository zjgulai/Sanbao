/**
 * 设置页里的「右侧栏宽度」偏好行（官方 `settings.general.item` 座位）。
 *
 * 为什么是这一行而不是外观页内：外观页（`dsh-theme` section）是主题包的单体组件、
 * 没有可贡献的内层座位，而它正被另一会话在写（本仓库禁止同包双写）。官方契约里
 * `settings.general.item` 就是为「一个不需要整页的偏好」准备的加法座位
 * （先例：locale → Language、ui-conversation → Composer Enter），
 * 由拥有该偏好的包自己贡献——本包即所有者。
 *
 * 这一行只做渲染：步进从哪儿起步、钳到边界算不算变更、「跟随默认」写什么，
 * 全在 `rightbar-width-face.ts` 里决定并单测；真正落进布局的是 `rightbar-width-writer.ts`。
 */
import React from 'react';
import type { RightbarWidthFace } from './rightbar-width-face';
/** 官方 owner 不传 props，值全走我们自己的 inject 面。 */
export interface RightbarWidthRowProps {
    readonly face: RightbarWidthFace;
}
export declare function RightbarWidthRow({ face }: RightbarWidthRowProps): React.ReactElement;
