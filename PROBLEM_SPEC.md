# Mak's OJ 题目制作与上传规范

更新时间：2026-05-09

---

## 1. 题目数据结构

每道题目由以下字段组成：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `slug` | String(120) | 是 | URL 友好标识，如 `week9-multi-comparator-sort` |
| `title` | String(255) | 是 | 题目标题，如 `[第九周] 多条件排序器` |
| `statement_markdown` | Text | 是 | 题面，使用 Markdown 格式 |
| `difficulty` | String(32) | 否 | `Easy` / `Medium` / `Hard`，默认 `Easy` |
| `tags` | JSONB | 否 | 标签数组，如 `["C++", "排序", "仿函数"]` |
| `template_files` | JSONB | 是 | 多文件模板 `{filename: code}`，至少1个文件 |
| `readonly_files` | JSONB | 否 | 只读文件名列表（学生不可编辑） |
| `time_limit_ms` | Integer | 否 | 时间限制(ms)，范围 100~60000，默认 2000 |
| `memory_limit_kb` | Integer | 否 | 内存限制(KB)，范围 16384~1048576，默认 262144 |
| `judge_cases` | JSONB | 否 | 静态测试用例列表（可选，作为对拍失败时的降级测试） |
| `generator_code` | Text | **是** | 对拍生成器 C++ 代码，生成随机测试数据 |
| `std_code` | Text | **是** | 标准答案 C++ 代码，用于对拍比较 |

---

## 2. Slug 命名规范

Slug 是题目的 URL 标识，必须唯一，只允许小写字母、数字和连字符。

**格式**: `[分类]-[简短描述]`

**示例**:
- `week9-multi-comparator-sort`
- `2025-cpp-midterm-a1-bankaccount`
- `matrix-adjacent-sum`

---

## 3. 题面编写规范 (statement_markdown)

题面使用 Markdown 格式，建议包含以下结构：

```markdown
# 题目标题

简要描述题目背景和目标。

**成员函数功能说明**（如果是类实现题）

1. **函数签名**: 功能说明
2. ...

### 输入说明

输入格式描述。

### 输出说明

输出格式描述。

**样例输入**

```
样例输入内容
```

**样例输出**

```
样例输出内容
```
```

**注意事项**:
- 使用 ` ``` ` 包裹代码块
- 数学公式使用 `$...$` 行内 或 `$$...$$` 块级
- 关键字使用反引号 `` ` `` 包裹

---

## 4. 多文件模板规范 (template_files)

多文件题目需要提供完整的代码框架，学生只需实现指定部分。

### 4.1 文件结构

典型的多文件结构：

```
main.cpp          # 主函数（通常只读）
ClassName.h/.hpp  # 头文件，定义类接口（通常只读）
ClassName.cpp     # 实现文件（学生需要编辑）
```

### 4.2 只读文件规则（强制）

**强制规则**: 多文件题目中，除了学生需要实现的文件外，其他所有文件**必须**设为只读。违反此规则将导致学生修改不该修改的文件，影响评测。

- `main.cpp` — **必须只读**（主函数，学生不应修改）
- `.h` / `.hpp` 头文件 — **必须只读**（类接口定义，学生不应修改）
- `.cpp` 实现文件 — 可编辑（学生在此文件中实现类/函数）

```python
# 示例：学生只需实现 MultiComparator.cpp
template_files = {
    "main.cpp": "...",           # 主函数，只读
    "MultiComparator.h": "...",  # 头文件，只读
    "MultiComparator.cpp": "..." # 实现文件，可编辑
}
readonly_files = ["main.cpp", "MultiComparator.h"]  # 只读列表
```

### 4.3 模板代码要求

- **main.cpp**: 包含完整的输入输出逻辑，调用学生实现的类/函数
- **头文件**: 包含完整的类声明和函数原型
- **实现文件**: 只包含 `// TODO` 注释，学生需要填写实现

---

## 5. 测试用例规范 (judge_cases)

### 5.1 静态测试用例

```python
judge_cases = [
    {
        "input": "输入内容\n",           # 注意末尾换行
        "expected_output": "期望输出\n"   # 注意末尾换行
    },
    # 更多测试用例...
]
```

### 5.2 测试用例设计原则

1. **覆盖边界**: 包含空输入、最大值、最小值等边界情况
2. **覆盖正常路径**: 包含典型的正常使用场景
3. **覆盖异常路径**: 包含错误输入、越界等情况（如果题目要求处理）
4. **数量建议**: 至少 3 组测试用例，复杂题目建议 5~10 组

### 5.3 输入输出格式

- `input`: 程序的标准输入，**末尾必须有换行符 `\n`**
- `expected_output`: 期望的标准输出，**末尾必须有换行符 `\n`**
- 如果程序输出多行，每行之间用 `\n` 分隔

---

## 6. 对拍模式 (Fuzzing) — 必选

**所有题目必须包含对拍代码**，即同时提供 `generator_code` 和 `std_code`。

### 6.1 必选要求

- 每道题目**必须**提供 `generator_code`（随机数据生成器）
- 每道题目**必须**提供 `std_code`（标准答案程序）
- 两者同时存在时自动启用对拍模式，系统将进行 10 轮随机测试
- `judge_cases` 为可选，可作为对拍失败时的降级测试或调试用途

### 6.2 generator_code

生成随机测试数据的 C++ 程序，输出到 stdout。

```cpp
#include <iostream>
#include <cstdlib>
#include <chrono>
using namespace std;

int main() {
    unsigned seed = chrono::high_resolution_clock::now().time_since_epoch().count();
    srand(seed);
    int n = rand() % 10 + 1;
    cout << n << endl;
    for (int i = 0; i < n; i++) {
        cout << rand() % 100 << " ";
    }
    cout << endl;
    return 0;
}
```

**注意**：不要使用 `srand(time(0))`，因为 `time(0)` 精度为秒，fuzzing 的 10 轮在同一秒内完成会导致种子相同、输出重复。必须使用 `chrono::high_resolution_clock` 获取纳秒级精度种子。

### 6.3 std_code

标准答案程序，读取 stdin 并输出到 stdout。

### 6.4 对拍流程

1. 运行 generator 生成随机输入
2. 分别运行 std 和 user 程序
3. 对比输出是否一致
4. 重复 10 轮，全部通过则 AC

---

## 7. 难度标签规范

| 难度 | 说明 | 建议时间限制 |
|---|---|---|
| `Easy` | 基础语法、简单逻辑 | 1000ms |
| `Medium` | 类与对象、数据结构 | 2000ms |
| `Hard` | 复杂算法、综合应用 | 3000ms |

---

## 8. 标签规范

标签用于分类和筛选，建议包含：

- **语言**: `C++`
- **知识点**: `引用`、`指针`、`类与对象`、`排序`、`动态内存`
- **题型**: `函数对象`、`运算符重载`、`深拷贝`
- **来源**: `2025C++期中试题`、`第九周练习`

---

## 9. 上传方式

### 9.1 通过 Admin API

```python
import requests

BASE_URL = "http://43.165.172.190"

# 登录
resp = requests.post(f"{BASE_URL}/api/auth/login", 
                     json={"username": "test", "password": "123456"})
token = resp.json()["access_token"]

# 创建题目
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
resp = requests.post(f"{BASE_URL}/api/admin/problems", headers=headers, json={
    "slug": "your-problem-slug",
    "title": "题目标题",
    "statement_markdown": "# 题目描述\n\n...",
    "difficulty": "Medium",
    "tags": ["C++", "标签1", "标签2"],
    "template_files": {
        "main.cpp": "...",
        "ClassName.h": "...",
        "ClassName.cpp": "..."
    },
    "readonly_files": ["main.cpp", "ClassName.h"],
    "time_limit_ms": 2000,
    "memory_limit_kb": 32768,
    "judge_cases": [
        {"input": "...\n", "expected_output": "...\n"}
    ]
})
```

### 9.2 通过导入脚本

参考 `import_week9_practice.py` 等现有脚本，编写批量导入脚本。

---

## 10. 检查清单

上传题目前，请确认：

- [ ] Slug 唯一且符合命名规范
- [ ] 题面 Markdown 格式正确，包含输入输出说明和样例
- [ ] 模板代码可编译通过
- [ ] 只读文件已正确设置（除实现文件外全部只读）
- [ ] 测试用例覆盖正常和边界情况
- [ ] 输入输出末尾有换行符
- [ ] 时间和内存限制合理
- [ ] 标签准确描述题目知识点

---

## 11. 示例题目

### 示例1：单文件题目

```python
{
    "slug": "swap-normalize",
    "title": "引用调整中位数位置",
    "statement_markdown": "# 引用调整中位数位置\n\n请实现两个函数...",
    "difficulty": "Easy",
    "tags": ["C++", "引用", "交换"],
    "template_files": {
        "main.cpp": "#include <iostream>\nusing namespace std;\n\nvoid Swap(int &x, int &y) {\n    // TODO\n}\n\nvoid Normalize(int &a, int &b, int &c) {\n    // TODO\n}\n\nint main() {\n    int a, b, c;\n    cin >> a >> b >> c;\n    Normalize(a, b, c);\n    cout << a << \" \" << b << \" \" << c << endl;\n    return 0;\n}\n"
    },
    "readonly_files": [],
    "judge_cases": [
        {"input": "9 3 6\n", "expected_output": "3 6 9\n"},
        {"input": "-1 5 5\n", "expected_output": "-1 5 5\n"}
    ]
}
```

### 示例2：多文件题目

```python
{
    "slug": "week9-multi-comparator-sort",
    "title": "[第九周] 多条件排序器",
    "statement_markdown": "# 多条件排序器\n\n...",
    "difficulty": "Medium",
    "tags": ["C++", "函数对象", "排序"],
    "template_files": {
        "main.cpp": "...",
        "MultiComparator.h": "...",
        "MultiComparator.cpp": "// TODO: 实现MultiComparator类\n"
    },
    "readonly_files": ["main.cpp", "MultiComparator.h"],
    "judge_cases": [
        {"input": "5\n-3 1 -2 4 0\n1 0\n", "expected_output": "0 1 -2 -3 4\n"}
    ]
}
```
