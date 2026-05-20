# ChargeTrail

[English](../README.md) · [Français](./README.fr.md) · **简体中文**

ChargeTrail 是一个 Web 应用程序，用于聚合来自多个第三方充电网络
（ChargePoint、ChargeLab、BC Hydro 等）的电动汽车充电会话数据，将其归一化
为统一的数据模型，本地持久化到 SQLite，并通过 REST API 提供给 React 单页前端
使用。

它为如今分散在各个服务商门户中的充电活动提供了一个统一的视图——具备离线可用
的本地存储，以及可插拔的适配器层，无需改动核心即可接入新的网络。

## 技术栈

- **后端** — Node.js + Express 5、TypeScript（ESM）、SQLite
  （better-sqlite3）、Drizzle ORM、基于 Zod 的校验 + OpenAPI 文档。
- **前端** — React 18 + Vite、TypeScript、Tailwind CSS 4、shadcn/ui、
  TanStack Query、Recharts、i18next。

## 开发环境快速搭建

前置要求：**Node.js 20+**（推荐 24.x）和 npm。

```bash
# 1. 克隆
git clone git@github.com:chnliupu/ChargeTrail.git
cd ChargeTrail

# 2. 后端
cd backend
npm install
cp .env .env.local        # 按需调整
npm run dev               # API 运行在 http://localhost:3000
                          # Swagger UI 在 http://localhost:3000/api-docs

# 3. 前端（在第二个终端中）
cd frontend
npm install
cp .env.example .env      # VITE_API_ORIGIN 默认为 http://localhost:3000
npm run dev               # 应用运行在 http://localhost:3001
```

常用脚本（在 `backend/` 或 `frontend/` 目录中运行）：

| 命令             | 用途                     |
| ---------------- | ------------------------ |
| `npm run dev`    | 启动带热重载的开发服务器 |
| `npm run build`  | 生产构建                 |
| `npm test`       | 运行测试套件（Vitest）   |
| `npm run lint`   | 代码检查                 |
| `npm run format` | 检查代码格式             |

## 页面

### 连接器（Connector）

![连接器页面](connector.png)

### 数据（Data）

![数据页面](data.png)

### 汇总（Summary）

![汇总页面](summary.png)

### 深色模式（Dark mode）

![系统设置](system_settings.png)

## 许可证

[MIT](../LICENSE) © chnliupu
