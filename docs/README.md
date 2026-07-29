# 项目文档目录约定

`docs/` 只存放需要长期维护的产品、架构和实施文档，不保存运行数据、候选人材料或临时原型。

- `architecture.md`：当前系统架构、路由、数据流与数据模型。
- `integration-guide.md`：面向前端或 API 接入者的接口契约和示例。
- `operator-runbook.md`：生产冒烟、数据保护与故障定位。
- `handoff.md`：当前交付状态、验证边界和后续事项。
- `未来需迭代内容.md`：认证、角色隔离和基础设施风险登记。
- `docs/superpowers/specs/`：已确认的功能设计规格，文件名使用 `YYYY-MM-DD-<topic>-design.md`。
- `docs/superpowers/plans/`：规格确认后的实施计划，文件名使用 `YYYY-MM-DD-<topic>-plan.md`。

工具生成的临时交互预览位于 `.superpowers/brainstorm/`，只用于设计过程，不作为长期事实来源；当前产品事实以 `architecture.md`、`integration-guide.md`、`operator-runbook.md` 和 `handoff.md` 为准。
