import type { SessionActivity } from './session-activity';
export interface SidebarBodyProps {
    /** 原生渲染器按登记的 `hooks.sessionActivity` 绑出来的选择器钩子。 */
    useSessionActivity?: <T>(selector: (activity: SessionActivity) => T) => T;
}
export declare function SidebarBody({ useSessionActivity }: SidebarBodyProps): JSX.Element;
