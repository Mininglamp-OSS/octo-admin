# Octo Admin

[English](./README.md) | [中文](./README.zh.md)

Octo Admin 是 **Octo** 即时通讯平台的 Web 管理后台，面向超级管理员和 Space 管理员，提供用户、群组、Space、应用 Bot、备份及下载配置等管理能力。

基于 **React 18**、**TypeScript**、**Vite** 与 **Ant Design 5** 构建。

## 功能特性

- **仪表盘** —— 平台运行与业务数据概览
- **用户管理** —— 浏览、搜索与维护平台用户
- **群组管理** —— 查看并管理群组
- **Space 管理** —— 创建、配置、审核 Space，管理成员、邀请与加入申请
- **应用 Bot** —— 注册、上架/下架平台与 Space 级 Bot，轮换 API Token
- **备份管理** —— 配置备份策略、手动触发、查看历史
- **下载配置** —— 管理下载资源与元信息
- **浅色 / 深色 / 跟随系统** 主题切换
- **国际化支持** —— 中文默认界面，内置主题与语言切换

## 快速开始

### 环境要求

- Node.js **18+**
- npm **9+**（或兼容的包管理器）
- 一个可访问的 Octo 后端服务

### 开发模式

```bash
npm install
cp .env.example .env.local   # 根据你的后端修改
npm run dev
```

开发服务运行在 `http://localhost:3000`。所有 `/api/*` 请求会代理到 `VITE_PROXY_TARGET` 指向的后端。

### 环境变量

完整说明见 [`.env.example`](./.env.example)。

| 变量 | 说明 |
| --- | --- |
| `VITE_API_BASE` | 后端 API 基础路径（默认 `/api`） |
| `VITE_PROXY_TARGET` | 开发模式反向代理目标 |
| `VITE_BOT_API_URL` | Bot 连接指南中使用的 API 地址（可选） |

### 生产构建

```bash
npm run build
npm run preview   # 可选：本地预览构建产物
```

构建产物输出到 `dist/`，使用 `/admin/` 作为 base 路径。

### Docker

```bash
docker build -t octo-admin .
docker run --rm -p 8080:80 -e API_BACKEND=host.docker.internal:8090 octo-admin
```

访问 `http://localhost:8080/admin/`。`API_BACKEND` 环境变量会注入到 `nginx.conf.template`。

## 项目结构

```
octo-admin/
├── src/
│   ├── api/          # 后端 API 客户端
│   ├── hooks/        # 通用 React Hooks
│   ├── layouts/      # 布局与主题容器
│   ├── pages/        # 业务页面
│   ├── store/        # Zustand 状态
│   ├── styles/       # 全局样式与设计 Token
│   ├── App.tsx       # 路由配置
│   └── main.tsx      # 应用入口
├── public/           # 静态资源
├── index.html        # HTML 模板
├── Dockerfile        # 生产镜像
├── nginx.conf.template
└── vite.config.ts
```

## 参与贡献

欢迎贡献！提交 Issue 或 Pull Request 前请阅读 [贡献指南](./CONTRIBUTING.zh.md) 以及 [行为准则](./CODE_OF_CONDUCT.zh.md)。

安全问题请私下通报，详见 [SECURITY.zh.md](./SECURITY.zh.md)。

## 许可协议

本项目基于 [Apache License 2.0](./LICENSE) 发布，归属信息见 [NOTICE](./NOTICE)。
