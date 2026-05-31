# Mak's OJ — 在线判题系统

一个面向 C++ 程序设计课程的全栈 Web OJ（Online Judge）系统，支持多文件代码编辑、静态判题、Fuzz 对拍、题目管理后台，并重点优化了题目页面的信息层级设计、LaTeX / KaTeX 数学公式渲染和整体页面可读性。

## 项目简介

本项目是一个可本地运行的全栈在线判题系统，核心目标是提供清晰、易读的题目展示体验和完整的代码评测能力。系统支持：

- 多文件 C++ 代码编辑（Monaco Editor，桌面端 / 移动端自适应）
- 题目描述的 Markdown + KaTeX 数学公式渲染
- 题目信息层级：描述、输入输出格式、样例、约束条件分区展示
- 静态判题：编译 → 执行测试用例 → 对比标准输出
- Fuzz 对拍：随机输入生成 → 标准程序 vs 用户程序 → 差异对比
- 在线自测（不入库）：快速验证代码逻辑
- 提交历史与结果对比（含 WA 逐行 diff）
- 管理员题目管理后台（CRUD、测试用例管理）
- 用户注册 / 登录（JWT 认证）、个人做题统计
- 亮色 / 暗色双主题

## 项目背景

这个项目源自大一下学期 C++ 程序设计课程（25 程设 II）的课程实践需求。在使用学校 OJ 系统的过程中，我发现许多 OJ 平台的题目页面在信息层级、公式渲染和可读性方面有较大的改进空间，于是尝试自己搭建一个更注重阅读体验的 OJ 系统。

项目通过 AI Coding 工具（Claude Code）辅助开发，采用迭代式人机协作的方式完成从需求设计到页面实现的全过程。

## 核心功能

### 题目展示

- 结构化题面：题目描述、输入格式、输出格式、样例、约束条件分区展示
- KaTeX / LaTeX 数学公式内联渲染，支持行内公式 `$...$` 和块级公式 `$$...$$`
- 代码块语法高亮
- Markdown 表格、列表、引用等丰富排版

### 代码编辑

- 桌面端：Monaco Editor，支持语法高亮、自动补全、多文件切换
- 移动端 / iPad：自动切换为轻量 Textarea 编辑器
- 可调节面板布局（react-resizable-panels）

### 判题引擎

- **静态判题**：编译用户 C++ 代码 → 逐个执行测试用例 → 对比标准输出
- **Fuzz 对拍**：随机输入生成器 + 标准程序 + 用户程序，10 轮差异对比
- **在线自测**：Playground 模式，不写入数据库
- 通过 go-judge 沙箱安全执行代码
- Celery 异步任务队列处理评测请求

### 用户系统

- 注册 / 登录（JWT 认证）
- 个人做题统计（recharts 图表）
- 提交历史查看与代码恢复

### 管理后台

- 题目 CRUD（创建、编辑、删除）
- 测试用例管理（judge_cases）
- 多文件代码模板（template_files / readonly_files）
- 题目标签与难度设置

## 页面展示

> 待补充：项目首页、题目列表页、题目详情页、KaTeX 公式渲染效果、样例展示效果。
>
> 截图将放置在 `docs/screenshots/` 目录下。

## LaTeX / KaTeX 公式渲染

题目内容中的数学公式通过以下技术栈渲染：

- `remark-math`：解析 Markdown 中的数学公式语法
- `rehype-katex`：将解析后的公式渲染为 KaTeX HTML
- `katex`：底层数学公式渲染引擎

支持的公式格式：

| 语法 | 说明 | 示例 |
|------|------|------|
| `$...$` | 行内公式 | 时间复杂度 $O(n \log n)$ |
| `$$...$$` | 块级公式 | $$\sum_{i=1}^{n} a_i = S$$ |

渲染效果覆盖：分数、上下标、矩阵、积分、求和、希腊字母、特殊符号等常见数学排版需求。

## 技术栈

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19 | UI 框架 |
| TypeScript | 6 | 类型安全 |
| Vite | 8 | 构建工具 |
| Tailwind CSS | v4 | 样式方案 |
| shadcn/ui | - | 组件库（基于 Radix UI） |
| Zustand | 5 | 状态管理 |
| Framer Motion | 12 | 页面动画 |
| Monaco Editor | 4 | 代码编辑器 |
| react-markdown | 10 | Markdown 渲染 |
| KaTeX | 0.16 | 数学公式渲染 |
| react-router-dom | 7 | 路由 |
| recharts | 3 | 统计图表 |
| axios | 1 | HTTP 请求 |

### 后端

| 技术 | 用途 |
|------|------|
| FastAPI | Web 框架（异步） |
| SQLAlchemy (async) + asyncpg | ORM + PostgreSQL 驱动 |
| PostgreSQL 14 | 数据库（JSONB 存储题目和提交数据） |
| Redis | 消息队列 / Celery Broker |
| Celery | 异步判题任务执行 |
| go-judge | 判题沙箱（C++ 编译与安全执行） |
| python-jose | JWT 认证 |
| passlib + bcrypt | 密码哈希 |
| Pydantic | 请求 / 响应数据验证 |
| Nginx | 反向代理 + 静态文件服务 |
| Docker Compose | 容器编排 |

## 本地运行

### 环境要求

- Node.js >= 18
- Python >= 3.11
- Docker & Docker Compose（用于 PostgreSQL、Redis、go-judge）

### 1. 启动基础设施

```bash
# 启动 PostgreSQL、Redis、go-judge
docker compose up -d db redis judge-core
```

### 2. 配置后端

```bash
cd backend
cp .env.example .env
# 编辑 .env，设置 POSTGRES_PASSWORD 和 JWT_SECRET_KEY
pip install -r requirements.txt
```

启动后端：

```bash
cd backend
uvicorn main:app --reload --port 8000
```

启动 Celery 判题 Worker：

```bash
cd backend
celery -A celery_app.celery worker --loglevel=info
```

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端默认运行在 `http://localhost:5173`，API 请求自动代理到 `http://127.0.0.1:8000`。

### 4. 使用 Docker Compose 一键启动（可选）

```bash
# 确保已配置 backend/.env
docker compose up -d
```

访问 `http://localhost` 即可。

## 项目结构

```
.
├── frontend/                  # 前端工程（React 19 + Vite 8 + TypeScript）
│   ├── src/
│   │   ├── components/        # UI 组件
│   │   │   ├── ui/            # shadcn/ui 基础组件
│   │   │   ├── WorkspacePanels.tsx    # 核心工作台（题面 + 编辑器 + 控制台）
│   │   │   ├── ProblemMarkdown.tsx    # Markdown 渲染组件
│   │   │   ├── ProblemTable.tsx       # 题目列表表格
│   │   │   ├── OutputDiffPanel.tsx    # WA 结果 diff 展示
│   │   │   └── Navbar.tsx             # 导航栏
│   │   ├── pages/             # 页面
│   │   │   ├── DashboardPage.tsx      # 首页 / 题目列表
│   │   │   ├── LoginPage.tsx          # 登录注册
│   │   │   ├── ProfilePage.tsx        # 个人统计
│   │   │   ├── ProblemWorkspacePage.tsx # 题目工作台
│   │   │   └── admin/                 # 管理后台页面
│   │   ├── store/             # Zustand 状态管理
│   │   ├── lib/               # 工具函数（API、diff、utils）
│   │   ├── types/             # TypeScript 类型定义
│   │   └── styles/            # 全局样式与主题
│   └── package.json
│
├── backend/                   # 后端工程（FastAPI + SQLAlchemy）
│   ├── app/
│   │   ├── main.py            # FastAPI 应用入口
│   │   └── routers/           # 路由模块
│   │       ├── auth.py        # 认证（登录 / 注册 / JWT）
│   │       ├── problem.py     # 题目查询
│   │       └── admin_problems.py  # 管理员题目 CRUD
│   ├── routers/               # 评测与用户路由
│   │   ├── submit.py          # 提交评测 + 在线自测
│   │   └── user.py            # 用户统计
│   ├── scripts/               # 数据管理工具
│   │   ├── import_problem.py  # 题目导入
│   │   └── ...                # 审计、修复工具
│   ├── config.py              # 配置（环境变量）
│   ├── database.py            # 数据库连接
│   ├── models.py              # ORM 模型（User / Problem / Submission）
│   ├── schemas.py             # Pydantic 数据模型
│   ├── worker.py              # Celery 判题 Worker（静态 + Fuzz）
│   ├── celery_app.py          # Celery 配置
│   ├── requirements.txt       # Python 依赖
│   ├── Dockerfile             # 后端容器镜像
│   └── .env.example           # 环境变量模板
│
├── docker-compose.yml         # 容器编排（开发参考）
├── nginx.conf                 # Nginx 反向代理配置
├── docs/
│   └── screenshots/           # 项目截图（待补充）
├── SYSTEM.md                  # 系统架构文档
├── PROBLEM_SPEC.md            # 题目数据规范
├── LICENSE                    # MIT License
└── README.md
```

## 我的主要工作

- 梳理 OJ 题目页面的信息层级，包括题目描述、输入输出格式、样例、约束条件和公式展示。
- 参考成熟 OJ 平台的展示方式，提出全页面 UI 和阅读体验优化需求。
- 推动引入 KaTeX / LaTeX 渲染能力，使数学公式和算法题内容展示更清晰。
- 负责本地运行测试、页面对比、问题复现和优化反馈。
- 使用 AI Coding 工具辅助代码理解、问题定位和页面改造迭代。

## 当前状态

- ✅ 前端页面基本功能完成：题目列表、题目工作台、代码编辑、提交评测、结果展示
- ✅ 后端判题引擎完成：静态判题 + Fuzz 对拍
- ✅ KaTeX 数学公式渲染正常工作
- ✅ 亮色 / 暗色双主题支持
- ✅ 桌面端 / 移动端自适应布局
- ✅ Docker Compose 容器化部署方案
- 🔲 题库内容持续扩充中
- 🔲 截图与可视化展示待补充
- 🔲 单元测试与 E2E 测试待补充

## 后续计划

- 补充项目截图与在线 Demo 链接
- 完善题库，覆盖更多算法与数据结构题目
- 增加用户排行榜与竞赛模式
- 补充前端单元测试与 E2E 测试
- 优化移动端编辑体验
- 完善部署文档与 CI/CD 流程

## License

[MIT](LICENSE) © 2026 Mai Lexuan
