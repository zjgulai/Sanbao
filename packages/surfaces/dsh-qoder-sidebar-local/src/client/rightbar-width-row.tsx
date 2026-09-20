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
import React, { useEffect, useState } from 'react';
import css from '../../styles/sidebar.module.css';
import { MIN_RIGHTBAR_WIDTH } from './rightbar-width';
import type { RightbarWidthFace } from './rightbar-width-face';

/** 步进：一次 40px，够粗到不误触，又不至于跨过量级。 */
const STEP = 40;

const LABEL_ZH = '右侧栏宽度';
const HINT_ZH = `${MIN_RIGHTBAR_WIDTH}px 起，上限随窗口宽度 · 拖右栏边缘即时生效`;
const FOLLOW_ZH = '跟随默认';

/** 官方 owner 不传 props，值全走我们自己的 inject 面。 */
export interface RightbarWidthRowProps {
  readonly face: RightbarWidthFace;
}

/** 行里显示的两个量：偏好存没存、钳后生效值是多少。 */
interface RowSnapshot {
  readonly stored: number | null;
  readonly shown: number | null;
}

export function RightbarWidthRow({ face }: RightbarWidthRowProps): React.ReactElement {
  const snapshotOf = (): RowSnapshot => ({ stored: face.read(), shown: face.effective() });
  const [view, setView] = useState<RowSnapshot>(snapshotOf);
  useEffect(() => face.subscribe(() => setView(snapshotOf())), [face]);

  const isDefault = view.stored === null;

  return (
    <div className={css.widthRow} data-lute-rightbar-setting="">
      <div className={css.widthCopy}>
        <span className={css.widthLabel}>{LABEL_ZH}</span>
        <span className={css.widthHint}>{HINT_ZH}</span>
      </div>
      <div className={css.widthControl}>
        <button type="button" className={css.widthButton} onClick={() => face.nudge(-STEP)} aria-label="收窄右侧栏">
          −
        </button>
        <span className={css.widthValue} aria-live="polite">
          {isDefault ? '默认' : `${view.shown ?? MIN_RIGHTBAR_WIDTH}px`}
        </span>
        <button type="button" className={css.widthButton} onClick={() => face.nudge(STEP)} aria-label="加宽右侧栏">
          +
        </button>
        <button
          type="button"
          className={css.widthButton}
          onClick={() => face.useOfficial()}
          disabled={isDefault}
        >
          {FOLLOW_ZH}
        </button>
      </div>
    </div>
  );
}
