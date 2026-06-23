# Mak's OJ 考试模式使用教程

更新时间：2026-06-23

---

## 1. 考试模式概览

考试模式允许教师/助教创建限时考试，学生在统一时间窗口内作答，系统自动计时、计分。

### 核心流程

```
创建考试 → 考生开始考试 → 作答（支持暂停） → 交卷 → 查看成绩
```

### 关键特性

- **限时倒计时**：前端计时器实时显示剩余时间，最后5分钟红色警告
- **暂停机制**：暂停期间遮罩覆盖题目、禁止查看/编辑/提交，所有暂停时长自动扣除
- **多题切换**：顶部 Tab 切换题目，每题独立代码草稿（浏览器 localStorage 隔离）
- **自动交卷**：倒计时归零自动调用 submit 接口
- **分值均分**：100 分按题目数量平均分配，AC 得满分否则 0 分

---

## 2. 考试 vs 普通做题的区别

| 特性 | 普通做题模式 | 考试模式 |
|------|-------------|---------|
| 时间限制 | 无 | 有（倒计时） |
| 暂停 | 不支持 | 支持暂停/继续 |
| 代码草稿 | 按题目保存 | 按 (考试ID + 题目ID) 独立保存 |
| 结果展示 | 每题独立查看 | 汇总成绩页（总分+逐题详情） |
| 计分 | 无 | 100 分均分，AC 得分 |
| 题目导航 | 每题独立页面 | 考试内 Tab 切换 |
| 历史记录 | 按题目显示 | 按考试显示（列出历史考试） |

---

## 3. 前提条件

### 3.1 题目已上传到 OJ 系统

考试引用的是系统中已有的题目（通过 `problem_ids`），不是新创建题目。请先通过管理员后台或导入脚本上传题目。

获取题目 ID 的方法：
- 访问 OJ 首页题目列表，点击题目查看 URL 中的 `id`
- 或通过 Admin API 查询：`GET /api/admin/problems?page_size=100`
- 或通过考试创建页输入题目 slug 自动查找对应 ID

### 3.2 已有用户账号

考试功能需要登录（JWT 认证）。所有学生需要有已注册的账号。
当前系统默认有测试账号 `test / 123456`。

---

## 4. 考试创建

### 4.1 Web 页面创建（推荐）

访问 `/exam/create`，填写表单：

1. **考试标题**：如 `模拟一：W1-W6 诊断`
2. **题目 slug**：逐个输入 slug 后按回车添加（如 `week14-variant-library-system`）
   - 系统会自动通过 slug 查找题目 ID
   - 显示为带序号的标签，点击 × 可删除
3. **考试时长**：分钟数，如 `120`（最大 1440，即 24 小时）

点击「创建考试」后自动跳转到 `/exam/:id`。

### 4.2 API 创建（脚本批量创建）

```python
import requests

BASE_URL = "http://43.165.172.190"

# 1. 登录
resp = requests.post(
    f"{BASE_URL}/api/auth/login",
    json={"username": "test", "password": "123456"},
)
token = resp.json()["access_token"]
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# 2. 创建考试
resp = requests.post(
    f"{BASE_URL}/api/exams",
    headers=headers,
    json={
        "title": "模拟一：W1-W6 诊断",
        "problem_ids": [138, 139, 140, 141, 142, 143],
        "duration_minutes": 120,
    },
)
exam = resp.json()
print(f"考试已创建: /exam/{exam['id']}")
```

### 4.3 API 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | 是 | 考试标题，1-255 字符 |
| `problem_ids` | int[] | 是 | 题目 ID 列表，按考试顺序排列，至少 1 道 |
| `duration_minutes` | int | 是 | 考试时长（分钟），范围 1-1440 |

---

## 5. 考试答题

### 5.1 开始考试

访问 `/exam/:exam_id`，页面加载后调用 `POST /api/exams/{id}/start` 写入 `start_time`。考试状态变为 `in_progress`。

### 5.2 答题界面

- **顶部**：考试标题 + 倒计时时钟（HH:MM:SS 格式）+ 暂停/交卷按钮
- **题目 Tab 栏**：每道题一个 Tab，带状态指示灯：
  - 灰色圆点 = 未做
  - 黄色圆点 = 已提交过（Attempted）
  - 绿色圆点 = 已 AC
- **主工作区**：完全复用普通做题页的 `WorkspacePanels` 组件（代码编辑 + 自测 + 提交评测 + 提交历史）
- **代码草稿**：每道题的代码自动保存到 localStorage（key 格式：`maks_oj_exam_draft_{examId}_p{problemId}`），切换题目不会丢失

### 5.3 暂停与继续

- **暂停**：点击「暂停考试」按钮 → 调用 `POST /api/exams/{id}/pause` → 状态变为 `paused`
  - 全屏半透明黑色遮罩覆盖
  - 遮罩上显示「考试已暂停」和「继续考试」按钮
  - 暂停期间：题目不可见、代码不可编辑、提交按钮不可用
  - 暂停时长自动累计到 `total_paused_seconds`

- **继续**：点击遮罩上的「继续考试」按钮 → 调用 `POST /api/exams/{id}/resume`
  - 系统通过 `updated_at` 时间戳差值计算暂停时长并累加到 `total_paused_seconds`
  - 状态恢复为 `in_progress`

### 5.4 交卷

- **手动交卷**：点击「交卷」按钮 → 二次确认弹窗 → 确认后调用 `POST /api/exams/{id}/submit`
- **自动交卷**：倒计时归零时自动调用 submit 接口
- 交卷后自动跳转到 `/exam/:exam_id/results` 查看成绩

---

## 6. 考试结果

### 6.1 结果页面

访问 `/exam/:exam_id/results` 或交卷后自动跳转。

**成绩汇总卡片**：
- 总分 / 100 分
- 通过题数 / 总题数
- 绿色进度条
- 实际用时（已扣除暂停时间）

**逐题详情表**：
- 题号、slug（可点击跳转题目详情页查看代码）
- 状态：AC（绿色 ✓）或非 AC（红色 ✗）
- 得分

### 6.2 计分规则

100 分在 `problem_ids` 间平均分配：
- 如有 5 道题，每题 20 分
- 如有 6 道题，每题 16.67 分（前 5 题 16.67，最后 1 题 16.65 凑整）
- 如有 3 道题，每题 33.33 分（最后 1 题 33.34）

每题得分 = AC → 满分 / 非 AC → 0 分（二元制）

### 6.3 结果数据 API

`GET /api/exams/{id}/results` 返回的 JSON：

```json
{
  "exam_id": 2,
  "title": "模拟一：W1-W6 诊断",
  "duration_minutes": 120,
  "elapsed_seconds": 7250,
  "total_score": 50.0,
  "passed_count": 3,
  "total_problems": 6,
  "problems": [
    {
      "problem_id": 138,
      "slug": "week14-variant-library-system",
      "status": "AC",
      "score": 16.67,
      "passed": true
    },
    {
      "problem_id": 139,
      "slug": "week14-variant-petshop-system",
      "status": "WA",
      "score": 0.0,
      "passed": false
    }
  ]
}
```

---

## 7. 考试状态生命周期

```
pending  ──start──→  in_progress  ──pause──→  paused
                         │                       │
                         │  resume               │
                         │←──────────────────────┘
                         │
                         └──submit──→  completed
```

- `pending`：已创建，尚未开始
- `in_progress`：正在作答
- `paused`：已暂停
- `completed`：已交卷（不可修改）

---

## 8. API 完整参考

### 8.1 创建考试

```
POST /api/exams
```

**请求体**：
```json
{
  "title": "string (1-255)",
  "problem_ids": [101, 102, 103],
  "duration_minutes": 120
}
```

**响应**：`ExamRead` 对象（201 Created）

### 8.2 开始考试

```
POST /api/exams/{exam_id}/start
```

前提：状态必须是 `pending`。写入 `start_time`，状态 → `in_progress`。

### 8.3 暂停考试

```
POST /api/exams/{exam_id}/pause
```

前提：状态必须是 `in_progress`。状态 → `paused`。

### 8.4 继续考试

```
POST /api/exams/{exam_id}/resume
```

前提：状态必须是 `paused`。通过 `updated_at` 时间戳差值计算暂停时长，累加到 `total_paused_seconds`。状态 → `in_progress`。

### 8.5 交卷

```
POST /api/exams/{exam_id}/submit
```

前提：状态必须是 `in_progress` 或 `paused`。写入 `end_time`，状态 → `completed`。返回考试结果汇总。

### 8.6 查看结果

```
GET /api/exams/{exam_id}/results
```

返回 `ExamResults` 对象。

### 8.7 列出考试

```
GET /api/exams
```

返回当前用户的全部考试记录列表。

---

## 9. 批量创建考试脚本示例

```python
#!/usr/bin/env python3
"""批量创建考试实例的辅助脚本"""
import json
import sys
from typing import Any

import requests

BASE_URL = "http://43.165.172.190"
USERNAME = "test"
PASSWORD = "123456"


def login() -> str:
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": USERNAME, "password": PASSWORD},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def get_problem_slug_map(headers: dict[str, str]) -> dict[str, int]:
    """获取所有题目 slug → id 的映射"""
    slug_to_id: dict[str, int] = {}
    page = 1
    page_size = 500
    while True:
        resp = requests.get(
            f"{BASE_URL}/api/problems",
            headers=headers,
            params={"page": page, "page_size": page_size},
            timeout=30,
        )
        resp.raise_for_status()
        payload = resp.json()
        for item in payload["items"]:
            slug_to_id[item["slug"]] = item["id"]
        if page * page_size >= payload["total"]:
            break
        page += 1
    return slug_to_id


def create_exam(
    headers: dict[str, str],
    title: str,
    problem_slugs: list[str],
    duration_minutes: int,
    slug_map: dict[str, int],
) -> dict[str, Any]:
    problem_ids: list[int] = []
    missing: list[str] = []
    for slug in problem_slugs:
        pid = slug_map.get(slug)
        if pid:
            problem_ids.append(pid)
        else:
            missing.append(slug)

    if missing:
        raise ValueError(f"以下 slug 未找到: {missing}")

    resp = requests.post(
        f"{BASE_URL}/api/exams",
        headers=headers,
        json={
            "title": title,
            "problem_ids": problem_ids,
            "duration_minutes": duration_minutes,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def main() -> None:
    token = login()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    slug_map = get_problem_slug_map(headers)
    print(f"已加载 {len(slug_map)} 道题目")

    # ── 在此定义考试 ──────────────────────────────────────────────
    exams_to_create = [
        {
            "title": "模拟一：继承与多态",
            "slugs": [
                "week14-variant-library-system",
                "week14-variant-petshop-system",
                "week14-variant-server-cluster",
                "week14-variant-tool-rental",
                "week14-variant-beverage-order",
                "week14-variant-furniture-warehouse",
            ],
            "duration_minutes": 120,
        },
    ]

    for exam_def in exams_to_create:
        exam = create_exam(
            headers,
            exam_def["title"],
            exam_def["slugs"],
            exam_def["duration_minutes"],
            slug_map,
        )
        print(f"  已创建: {exam['title']} → /exam/{exam['id']}")

    print(f"\n完成，共创建 {len(exams_to_create)} 场考试。")


if __name__ == "__main__":
    main()
```

---

## 10. 常见问题

### Q: 学生考试时可以切出去搜索吗？

考试页面是纯前端，没有切屏检测。如需防作弊可以考虑：
- 教室监考
- 后期通过 Browser lockdown 类工具限制

### Q: 暂停期间倒计时还在走吗？

不在。暂停时计时器前端停止 + 后端记录暂停时长。继续后剩余时间从暂停时刻恢复。

### Q: 每道题的代码会自动保存吗？

会。每 60 秒自动保存到浏览器 localStorage，切换题目时也会触发保存。下次打开同一考试同一题时会恢复。

### Q: 如果浏览器崩溃了怎么办？

重新登录后访问同一 `/exam/:exam_id` 即可恢复。考试状态（已开始、剩余时间等）从服务端读取，代码草稿从 localStorage 恢复。

### Q: 分值可以自定义吗？

当前版本是均分 100 分（AC 得分 / 非 AC 0 分）。如需自定义每题分值，需要修改后端 `_build_exam_results()` 函数。

### Q: 可以删除或修改已创建的考试吗？

当前版本未提供删除/修改考试的 API。如有需要可在数据库中直接操作 `exams` 表。

---

## 11. 数据库表结构

`exams` 表（PostgreSQL）：

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | int (PK) | 自增主键 |
| `user_id` | int (FK → users.id) | 创建考试的用户 |
| `title` | varchar(255) | 考试标题 |
| `problem_ids` | jsonb | 题目 ID 列表，如 `[101, 102, 103]` |
| `duration_minutes` | int | 考试时长（分钟） |
| `start_time` | timestamptz (nullable) | 开始时间（点开始考试时写入） |
| `end_time` | timestamptz (nullable) | 结束时间（交卷时写入） |
| `total_paused_seconds` | int (default 0) | 累计暂停秒数 |
| `status` | exam_status enum | `pending` / `in_progress` / `paused` / `completed` |
| `created_at` | timestamptz | 创建时间 |
| `updated_at` | timestamptz | 最后更新时间 |
