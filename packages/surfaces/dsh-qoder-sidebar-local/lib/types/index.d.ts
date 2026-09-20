import type { Context } from '@deepseek-ai/cordis';
export declare const name = "qoder-sidebar-local";
/** Services required before the git route can mount. */
export declare const inject: string[];
/** Route paths (the client bundle mirrors these literals). */
export declare const ROUTES: {
    readonly gitStatus: "/api/dsh-qoder-sidebar/git-status";
};
/** What the 环境信息 section needs, and nothing more. */
export interface GitStatusInfo {
    branch: string;
    uncommittedFiles: number;
    ahead: number;
    behind: number;
    lastCommit?: {
        hash: string;
        message: string;
    };
}
export declare function apply(ctx: Context): void;
