# Mak's OJ 选择题制作与上传规范

更新时间：2026-07-05

---

本规范介绍了选择题（理论题）在 Mak's OJ 系统中的数据结构、设计原则及批量上传导入教程。

## 1. 题目数据结构

选择题与编程题共用 `problems` 表，通过 `type` 字段进行类型区分。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `slug` | String(120) | 是 | URL 友好唯一标识，例如 `week1-midterm-theory-a` |
| `title` | String(255) | 是 | 题目标题，例如 `[第一周期中] C++ 基础理论测试` |
| `statement_markdown` | Text | 是 | 理论题说明页描述（Markdown 格式，通常写考试须知或说明） |
| `type` | String(32) | **是** | **必须填入 `'choice'`** |
| `difficulty` | String(32) | 否 | `Easy` / `Medium` / `Hard`，默认 `Easy` |
| `tags` | JSONB | 否 | 标签数组，例如 `["C++", "理论", "期中考试"]` |
| `choice_questions` | JSONB | **是** | 选择题题目列表，数据结构见下文 |

---

## 2. 选择题列表项结构 (ChoiceQuestion)

`choice_questions` 是一个 JSONB 数组，数组中的每一项代表一道具体的单选、多选或判断题：

```json
[
  {
    "id": 1,
    "type": "single",
    "description": "C++ 中有关引用(Reference)的说法，错误的是？",
    "options": [
      "A. 引用在创建时必须初始化",
      "B. 引用一旦初始化后就不能再指向其他变量",
      "C. 引用会占用独立的、与原变量相同大小的内存空间",
      "D. 可以定义引用的引用，但不能定义引用的指针"
    ],
    "answer": ["C"],
    "explanation": "引用在底层通常实现为指针，但在语言层面它只是一个别名，不占用用户可见的独立内存空间。"
  }
]
```

### 属性详解：

- `id` (Integer / String): **题目唯一标识 ID**。在一套选择题中必须唯一。
- `type` (String): 题型，允许的值为：
  - `"single"`: 单选题。
  - `"multiple"`: 多选题。
  - `"judgment"`: 判断题。
- `description` (String): **题干说明**（支持 Markdown、行内/块级数学公式、C++代码块）。
- `options` (Array of String): **选项列表**。
  - 单选和多选题必须提供。建议格式为 `["A. 选项内容", "B. 选项内容", ...]`。
  - **判断题可省略 `options`**（前端会自动生成“正确 (True)”与“错误 (False)”选项）。
- `answer` (Array of String): **标准答案列表**（必须是大写字母或 `T`/`F`）。
  - 单选题：`["A"]`
  - 多选题：`["A", "C"]`
  - 判断题：`["T"]`（正确）或 `["F"]`（错误）
- `explanation` (String): **题目解析**（支持 Markdown，评测后向学生公开）。

---

## 3. 安全防作弊过滤机制

> [!IMPORTANT]
> **开发安全规则**
> 系统的后端接口在学生获取题目详情时（`GET /api/problems/{id}`），会通过 Pydantic 模型**自动剥离过滤**掉所有选择题的 `answer` 和 `explanation` 字段。
> 
> 学生在作答时，本地只能获取到题干和选项。直到学生点击【提交评测】，由 Celery 评测机在后台核对并打分后，答案和解析才会回填并在前端的答题卡下方展示，从而完全杜绝了通过 Chrome F12 审查元素作弊的行为。

---

## 4. 上传导入示例

### 4.1 通过 Admin API 上传

你可以直接使用 Python 的 `requests` 库调用 `/api/admin/problems` 接口创建选择题：

```python
import requests

BASE_URL = "http://43.165.172.190"

# 1. 登录管理员账号
login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
    "username": "admin_username",
    "password": "admin_password"
})
token = login_resp.json()["access_token"]
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}

# 2. 组装选择题数据
choice_problem = {
    "slug": "cpp-basics-midterm-theory",
    "title": "C++ 基础理论测试",
    "statement_markdown": "# 考试说明\n\n请在右侧选择正确答案进行作答。总分 100 分。",
    "type": "choice",
    "difficulty": "Easy",
    "tags": ["C++", "理论题", "期中考试"],
    "choice_questions": [
        {
            "id": 1,
            "type": "single",
            "description": "下列关于常对象 (const object) 的说法中正确的是？",
            "options": [
                "A. 常对象可以调用其类的任意成员函数",
                "B. 常对象只能调用其类的常成员函数",
                "C. 常对象的成员变量不能被常成员函数修改，但可以被非常成员函数修改",
                "D. 以上说法都不正确"
            ],
            "answer": ["B"],
            "explanation": "常对象只能调用常成员函数（const member functions），以确保对象的状态不会被意外改变。"
        },
        {
            "id": 2,
            "type": "judgment",
            "description": "在 C++ 中，析构函数可以重载。",
            "answer": ["F"],
            "explanation": "析构函数没有参数，没有返回值，且一个类只能有一个析构函数，因此无法重载。"
        },
        {
            "id": 3,
            "type": "multiple",
            "description": "哪些是 C++ 核心支持的面向对象特征？",
            "options": [
                "A. 封装 (Encapsulation)",
                "B. 继承 (Inheritance)",
                "C. 多态 (Polymorphism)",
                "D. 模板 (Template)"
            ],
            "answer": ["A", "B", "C"],
            "explanation": "封装、继承、多态是面向对象三大核心特征。模板属于泛型编程特征。"
        }
    ]
}

# 3. 发送请求创建题目
create_resp = requests.post(f"{BASE_URL}/api/admin/problems", headers=headers, json=choice_problem)
if create_resp.status_code == 201:
    print("选择题题目导入成功！")
else:
    print("创建失败：", create_resp.json())
```

### 4.2 通过批量脚本导入
你可以在工程根目录下创建一个导入脚本（如 `import_choices.py`），利用本地 `database.py` 的 `AsyncSession` 直接写入数据库，无需通过 HTTP 网络接口：

```python
import asyncio
from database import AsyncSessionLocal
from models import Problem

async def main():
    async with AsyncSessionLocal() as session:
        # 在此处构建 Problem 对象并 session.add(problem)
        # 最后 await session.commit() 即可
        pass

if __name__ == "__main__":
    asyncio.run(main())
```
