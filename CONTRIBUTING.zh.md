# 为 Octo Admin 做贡献

感谢您有兴趣为 Octo Admin 做贡献！本文档说明如何报告问题、提出变更以及提交 Pull Request。

## 报告 Bug

Bug 通过 [GitHub Issues](../../issues) 进行追踪。在创建新 Issue 之前，请先搜索现有 Issue，避免重复提交。

提交 Bug 报告时，请包含以下内容：

- 清晰、具有描述性的标题。
- 复现问题的步骤。
- 期望的行为以及实际发生的情况。
- 您的环境信息（操作系统、Node.js 版本、浏览器、Octo Admin 版本或 commit）。
- 相关的日志、堆栈跟踪或截图。

## 功能请求

功能请求同样通过 [GitHub Issues](../../issues) 进行追踪。请：

- 先搜索以确认该想法是否已被提出。
- 描述使用场景以及该功能将要解决的问题。
- 概述您考虑过的其他替代方案。

在开始实现工作之前，相关讨论将在 Issue 中进行。

## Pull Request 流程

1. **Fork** 本仓库并将您的 Fork 克隆到本地。
2. 从 `main` **创建一个分支**用于您的变更。请使用具有描述性的名称，例如 `feat/space-invites-panel` 或 `fix/login-redirect`。
3. **进行变更**，保持提交聚焦且按逻辑分组。
4. 在本地**测试**您的变更。运行 lint 和类型检查，并在浏览器中验证受影响的 UI 流程。
5. 将您的分支**推送**到您的 Fork，并**向 `main` 发起 Pull Request**。
6. 填写 PR 描述：变更了什么、为什么变更以及如何测试。关联相关的 Issue。
7. 通过向同一分支推送额外的 commit 来处理评审反馈。维护者可能会要求在合并之前做出修改。

所有 PR 必须通过 CI（lint、类型检查、构建）后才能合并。

## 开发环境搭建

请参阅 [README](./README.md) 了解前置依赖、安装步骤，以及运行开发服务器、构建和运行测试的说明。

## 代码风格

- **TypeScript** 以严格模式使用。新代码必须通过类型检查，且在可避免的情况下不使用 `any` 这类逃生出口。
- **ESLint** 负责执行风格和正确性规则。在推送前运行 linter 并修复所有报告的问题。
- 优先编写小而聚焦的组件和函数。遵循周边代码中已经建立的约定。
- 不要将仅涉及格式化或 lint 的变更与功能性变更混在同一个提交中。

## 提交信息

本项目遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范。每条提交信息应采用以下格式：

```
<type>(<optional scope>): <short summary>

<optional body>

<optional footer>
```

常用类型：

- `feat` — 新功能
- `fix` — Bug 修复
- `docs` — 仅文档变更
- `style` — 格式化、缺少分号等；不涉及代码变更
- `refactor` — 既不修复 Bug 也不添加功能的代码变更
- `perf` — 性能改进
- `test` — 添加或修正测试
- `chore` — 工具链、构建或辅助性变更

示例：`feat(spaces): add invite revocation to members panel`

## 许可证

Octo Admin 采用 [Apache License, Version 2.0](./LICENSE) 进行授权。通过提交贡献，即表示您同意您的贡献将在同样的 Apache 2.0 条款下授权，并且您确认您有权以该许可证提交本贡献。
