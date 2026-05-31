# Mak's OJ 系统文档

更新时间：2026-05-28
当前版本：v1.0.0
公网地址：[http://43.165.172.190/](http://43.165.172.190/)

## 1. 系统概览

Mak's OJ 是一个面向 C++ 程序设计课程的在线判题系统，支持：

- 多文件代码模板与提交
- 在线自测 `/api/run`
- 标准静态判题
- `generator_code + std_code` 驱动的 fuzzing 对拍
- 用户登录、做题统计与历史提交恢复
- 管理员后台录题、改题、删题

当前活跃代码目录：

- `D:\OJ\frontend`：当前实际前端工程
- `D:\OJ\_remote_backend_patch`：当前实际后端补丁工程
- `D:\OJ\mak-oj-demo`：上游参考仓库，不是当前生产代码
- `D:\OJ\matrix_practice`：题目源数据与导入素材
- `D:\OJ\figma_raw`：早期 Figma 导出原型

## 2. 技术栈

- 前端：React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + shadcn/ui (Radix UI) + Framer Motion + 亮/暗双色模式
- 编辑器：Monaco Editor（桌面端） / MobileTextareaEditor（移动端自动切换）
- 状态管理：Zustand
- 后端：FastAPI + async SQLAlchemy
- 数据库：PostgreSQL 14
- 队列：Redis + Celery
- 判题沙箱：go-judge
- 部署：Nginx + Docker Compose

## 3. 核心运行结构

### 3.1 前端

- 入口：`D:\OJ\frontend\src\App.tsx`
- 工作台页：`D:\OJ\frontend\src\pages\ProblemWorkspacePage.tsx`
- 核心工作台组件：`D:\OJ\frontend\src\components\WorkspacePanels.tsx`
- 移动端简易编辑器：`D:\OJ\frontend\src\components\MobileTextareaEditor.tsx`
- 管理员题目编辑页：`D:\OJ\frontend\src\pages\admin\AdminProblemEditorPage.tsx`

### 3.2 后端

- FastAPI 入口：`D:\OJ\_remote_backend_patch\app\main.py`
- 管理员题目接口：`D:\OJ\_remote_backend_patch\app\routers\admin_problems.py`
- 提交与在线运行接口：`D:\OJ\_remote_backend_patch\routers\submit.py`
- ORM 模型：`D:\OJ\_remote_backend_patch\models.py`
- Celery 判题 worker：`D:\OJ\_remote_backend_patch\worker.py`

### 3.3 判题模式

静态判题：

1. 编译用户代码
2. 逐个执行 `judge_cases`
3. 对比标准输出
4. 返回 `AC / WA / CE / RE / TLE / MLE / System Error`

对拍判题：

1. 同时编译用户代码、`generator_code`、`std_code`
2. 生成随机输入
3. 分别运行标准程序和用户程序
4. 比较 `expected_output` 与 `actual_output`
5. 默认执行 10 轮，任一轮失配即返回 `WA`

## 4. 主要接口

- `POST /api/auth/login`：登录
- `GET /api/problems`：题目列表
- `GET /api/problems/{id}`：题目详情
- `GET /api/problems/{id}/my_submissions`：当前用户该题提交历史
- `POST /api/submissions`：提交评测
- `GET /api/submissions/{id}`：查询评测结果
- `POST /api/run`：在线自测，不入库
- `GET /api/users/{id}/stats`：用户统计
- `GET/POST/PUT/DELETE /api/admin/problems...`：管理员题目管理接口

## 5. 本地与生产部署

### 5.1 本地前端

- 开发地址：`http://127.0.0.1:5173/`
- 构建命令：`cd D:\OJ\frontend && npm run build`
- 质量检查：`cd D:\OJ\frontend && npm run lint`

### 5.2 生产前端发布

当前使用的稳定发布方式：

1. 本地执行 `npm run build`
2. 上传 `dist` 到服务器临时目录 `/tmp/frontend_dist`
3. 整目录替换 `/opt/matrix_oj_clone/frontend_dist`
4. `sudo systemctl reload nginx`

推荐命令：

```powershell
cd D:\OJ\frontend
npm run build
ssh quant-system-ubuntu "rm -rf /tmp/frontend_dist && mkdir -p /tmp/frontend_dist"
scp -r D:/OJ/frontend/dist/* quant-system-ubuntu:/tmp/frontend_dist/
ssh quant-system-ubuntu "sudo rm -rf /opt/matrix_oj_clone/frontend_dist && sudo mkdir -p /opt/matrix_oj_clone/frontend_dist && sudo cp -r /tmp/frontend_dist/. /opt/matrix_oj_clone/frontend_dist/ && sudo systemctl reload nginx"
```

注意：

- 不要再用”只清空部分文件后增量覆盖”的方式发布前端，容易残留旧 `index.html` 或旧 hash 资源。
- 每次发布后确认 `index.html` 指向最新的 hash 资源文件。

## 6. 测试账号

- 管理员：`test / 123456`

## 7. 变更记录

### 7.1 移动端编辑器适配（v0.7.0）

发布时间：2026-05-11

问题背景：

- iPad Safari / 手机浏览器中，Monaco Editor 无法正常复制、粘贴、输入或长按弹出菜单。

解决方案：

- 新增 `MobileTextareaEditor` 组件（`D:\OJ\frontend\src\components\MobileTextareaEditor.tsx`），包含：
  - `isMobileOrTablet()` 移动端判断函数，支持 iPadOS 伪装 Mac 检测
  - textarea 简易编辑器，支持 Tab 插入 4 空格、readOnly、等宽字体、横向滚动
- 修改 `WorkspacePanels.tsx`，新增编辑器模式切换逻辑：
  - 三种模式：`auto`（自动） / `simple`（简易编辑器） / `advanced`（高级编辑器）
  - localStorage key：`oj-editor-mode`
  - `auto` 模式下移动端自动使用 textarea，桌面端继续用 Monaco
  - 工具栏新增模式选择器下拉菜单和"粘贴代码"按钮
- textarea 和 Monaco 共享同一个 `fileContents` 状态，运行/自测/提交读取同一份代码

已上线：已构建并部署到生产服务器。

当前生产前端资源：

- JS：`index-CJCbSxgZ.js`
- CSS：`index-CJjoSMBr.css`

### 7.2 判题输出比对修复（v0.7.1）

发布时间：2026-05-11

问题现象：

- 学生代码输出内容与期望完全一致，但被判 WA。
- 典型场景：程序输出 `YES`（无尾部换行），期望输出为 `YES\n`（有尾部换行），被判 WA。
- `judge_result` 中 `normalized_equal: true`，说明内容确实相同，但判题结果仍为 WA。

根因：

- `worker.py` 中 `_normalize_output()` 仅做了 `\r\n` → `\n` 转换，未 strip 尾部空白。
- 判题使用严格 `==` 比较，`"YES" != "YES\n"`，导致误判。
- `build_output_diff()` 中已有 `normalized_equal = expected.strip() == actual.strip()`，但该值仅用于展示，未参与判题决策。

修复：

- 文件：`D:\OJ\_remote_backend_patch\worker.py`，`_normalize_output()` 函数
- 改动：`.replace("\r\n", "\n")` → `.replace("\r\n", "\n").strip()`
- 影响范围：静态判题、fuzzing 判题的输出比对均经过此函数，一处修改全部生效

已上线：已更新服务器上 `worker.py` 并重启 backend 和 celery-worker 容器。

### 7.2 前端源码恢复与稳定化

- 修复了前端若干损坏/乱码文件导致的构建失败问题。
- 重建了 `WorkspacePanels.tsx`，恢复了题目工作台、自测区、控制台和提交历史的可维护实现。
- 修复了相关页面中的 Hook 依赖问题，使前端恢复到可 lint、可 build 状态。

验证结果：

- `npm run lint` 通过
- `npm run build` 通过

### 7.3 在线自测区布局修复

问题现象：

- 在线自测运行后，“实际输出区”会向下挤压或遮挡“标准输入区”。
- 用户期望输入区和输出区始终保持水平并排。

修复方案：

- 在 `D:\OJ\frontend\src\components\WorkspacePanels.tsx` 中，重构 `PlaygroundPanel` 布局。
- 将自测区核心内容改为固定双列网格：
  - 左侧：标准输入区
  - 右侧：实际输出区
- 每个面板内部独立滚动，避免输出内容撑破整体布局。
- 输出区使用可换行样式，降低长输出导致的横向溢出风险。

效果：

- 运行自测前后，输入区和输出区保持水平并排
- 输出增加时，只在右侧输出面板内部滚动

### 7.4 前端上线（2026-05-11）

发布时间：2026-05-11

已执行：

- 本地重新构建前端产物
- 上传到服务器临时目录
- 整目录替换生产静态资源目录
- 重载 Nginx

上线后确认：

- 服务器上的 `frontend_dist/index.html` 已指向最新 hash
- 公网首页返回最新 `index.html`
- `http://43.165.172.190/login` 返回 `200 OK`

当前生产前端资源：

- JS：`index-CJCbSxgZ.js`
- CSS：`index-CJjoSMBr.css`

### 7.5 前端全面改造（v1.0.0）

发布时间：2026-05-26

改造内容：

- **设计风格**：从赛博朋克风格迁移至 shadcn/ui 简洁风格，支持亮/暗双色模式
- **组件库**：引入 16 个 shadcn/ui 标准组件（Button, Card, Badge, Table, Tabs, Dialog, Input, Textarea, Select, DropdownMenu 等），基于 Radix UI + CVA
- **主题系统**：全新 CSS 变量体系，中性色亮/暗双色，保留 Rajdhani/Sora/JetBrains Mono 三字体系统，圆角 0.625rem，极淡半透明边框
- **导航**：Navbar 替代旧 AppShell，DropdownMenu 用户菜单，Sun/Moon 暗色模式切换
- **Dashboard**：移除 Hero 区域，ProblemTable 融合 shadcn Table + framer-motion stagger 动画
- **全局样式**：移除 cyber-glow/neon-text/scan-line 等赛博特效，保留页面切换丝滑动画
- **npm 修复**：创建 .npmrc 解决 npm 11 默认跳过 devDependencies 的问题
- **清理**：删除 cyber-effects.css、tailwind.css、MatrixSidebar.tsx

已执行：

- 备份在 `frontend_backup_20260526/`
- TypeScript 编译零错误
- Vite 生产构建通过
- 上传至服务器 `/opt/matrix_oj_clone/frontend_dist`
- Nginx 重载成功

当前生产前端资源：

- JS：`index-BjhpO6hF.js`
- CSS：`index-Cc5TKcU8.css`

## 8. 题目详情页改造（v1.1.0）

发布时间：2026-05-26

改造内容：

- **新增依赖**：`remark-gfm`（GFM 表格/任务列表）、`remark-math` + `rehype-katex` + `katex`（LaTeX 数学公式渲染）
- **新增组件**：`ProblemMarkdown.tsx` — 封装 react-markdown + remark-gfm + remark-math + rehype-katex，自定义渲染 h2/h3/inline-code/code-block/table/blockquote
- **新增样式**：`problem-page.css` — `.problem-page`（居中 960px 容器）、`.problem-title`、`.problem-meta`、`.problem-badges`、`.problem-markdown`（正文 sans-serif）、`.problem-inline-code`（灰色背景）、fenced code block（圆角灰底）、table（条纹行）、blockquote（左边框高亮）、KaTeX 数学公式
- **新增工具**：`problemContent.ts` — 纯文本→Markdown 转换层，自动检测"题目描述/输入格式/输出格式/样例输入/样例输出/说明"等中文段落标记并注入 `##` 标题
- **改造 ProblemDescriptionPanel**：从原来的纯 prose ReactMarkdown 改为结构化布局 — 标签/难度徽章 → 元信息行（时间限制/内存限制）→ Markdown 正文
- **index.css**：引入 `problem-page.css`

文件清单：

- `frontend/src/components/ProblemMarkdown.tsx`（新增）
- `frontend/src/components/WorkspacePanels.tsx`（修改 ProblemDescriptionPanel）
- `frontend/src/lib/problemContent.ts`（新增）
- `frontend/src/styles/problem-page.css`（新增）
- `frontend/src/index.css`（修改，新增 import）

已执行：

- `npm install remark-gfm remark-math rehype-katex katex`
- `npm run build` 通过
- 上传 dist 到服务器 `/opt/matrix_oj_clone/frontend_dist`
- `sudo systemctl reload nginx`
- 公网验证：`http://43.165.172.190/` 返回最新 `index.html`，JS/CSS/KaTeX 资源均 200

## 9. 当前已知事项

- 前端主包仍约 640 kB，后续可以做 code splitting 优化首屏体积。
- 当前文档已改为干净 UTF-8 版本，后续请直接在此文件持续更新，不再沿用旧乱码内容。
## 9. 2026-05-11 提交 WA 输出差异恢复

问题现象：
- 之前为了撤掉在线自测区里的 diff，前端把结果渲染链路一起收窄了。
- 后端正式判题 WA 实际仍然返回 `output_diff`，但提交结果页没有继续解析和渲染这个字段。
- 结果就是普通自测不显示 diff 的同时，正式提交 WA 也一起丢失了“期望输出 vs 实际输出”的差异面板。

根因：
- `D:\OJ\_remote_backend_patch\worker.py` 中的 `build_output_diff()` 仍然存在。
- 正式判题 WA 分支仍然会写入 `case_entry["output_diff"]` / `fuzz_case["output_diff"]`。
- 真正丢功能的是前端 `D:\OJ\frontend\src\components\WorkspacePanels.tsx`：
  - `extractTestPoints()` 没有把 `entry.output_diff` 带进测试点详情。
  - `ConsolePanel` 没有再渲染 `OutputDiffPanel`。

修复：
- 在 `D:\OJ\frontend\src\components\WorkspacePanels.tsx` 中给 `ParsedTestPoint` 恢复 `outputDiff` 字段。
- 新增 `parseOutputDiff()` / `parseLineDiffEntry()` / `parseCharDiffEntry()`，把提交结果里的 `output_diff` 安全映射成前端 `OutputDiffResult`。
- 新增 `shouldShowSubmitOutputDiff()`，只在以下条件下渲染 `OutputDiffPanel`：
  - `status === "WA"`
  - `actualOutput` 存在
  - `expectedOutput` 存在
  - `outputDiff?.has_diff === true`
- 在线自测区 `PlaygroundPanel` 保持不变，不显示 diff，也不会去请求官方 `expected_output`。

结果：
- 普通运行自测：只显示实际输出，不显示期望输出和输出差异。
- 正式提交 WA：显示实际输出、期望输出和差异面板。
- 正式提交 AC / CE / RE：不显示差异面板。

---

### 2026-05-28 修复：编辑器快速输入时光标跳转到底部

问题现象：
- 在 Monaco Editor 中快速连续输入时，编辑器会卡顿，光标跳转到最底部。

根因：
- `WorkspacePanels.tsx` 中 Monaco Editor 使用了受控模式（`value` prop 绑定 React state）。
- 每次按键触发 `onChange` → `setFileContents` → React 重新渲染 → `value` prop 更新。
- 当快速输入时，React 批量重渲染滞后于 Monaco 的实时模型更新，导致 `@monaco-editor/react` 检测到 `value` 与模型内容不一致，调用 `model.setValue()` 重置光标位置。

修复：
- 将 Monaco Editor 从受控模式（`value`）切换为非受控模式（`defaultValue`），让 Monaco 自行管理编辑状态。
- 新增 `editorVersion` 状态计数器，在恢复提交等外部内容变更时递增，通过 `key` 强制编辑器重新挂载以加载新内容。
- 文件：`frontend/src/components/WorkspacePanels.tsx`、`frontend/src/pages/ProblemWorkspacePage.tsx`
