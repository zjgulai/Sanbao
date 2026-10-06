# scripts/design-loop

- `verify_ticket.mjs`：LOOP.md §1 判者。2026-10-06 收纳自 `Sage-ui-wiring-design/tools/`；
  原默认 worktree 是用户机器绝对路径，现默认对准宿主仓自身（主仓相对入口）。
  隔离运行请显式传 `--worktree <path>`。用法与判据见文件头与 [docs/design-loop/README.md](../../docs/design-loop/README.md)。
