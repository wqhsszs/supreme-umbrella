# 数据结构说明（产品运行时约定）

本文件描述「明白办」调用模型时要求返回的结构，以及程序侧的校验规则。
运行时使用的系统提示词见同目录 `system-prompt.txt`（页面通过 fetch 直接读取该文件，单一事实来源）。

## 1. 顶层结构

```json
{
  "document_status": "notice | not_notice",
  "document_status_reason": "字符串，一句话说明判断依据",
  "summary": "字符串，1—2 句白话，不超过 60 字",
  "audience":  Fact,
  "times":     [TimeFact],
  "location":  Fact,
  "preparation": [Fact],
  "actions":   [ActionItem],
  "questions": ["字符串"],
  "warnings":  ["字符串"]
}
```

不得出现约定外的顶层字段（程序会判为结构错误）。

## 2. Fact（事实项）

```json
{ "value": "字符串或 null", "status": "stated|missing|unclear|conflict", "evidence": ["原文摘录"] }
```

| status | 含义 | 约束 |
|---|---|---|
| `stated` | 原文明确写出 | `value` 非空，`evidence` ≥ 1 条 |
| `missing` | 原文没有这一项 | `value` 必须为 `null`，`evidence` 必须为 `[]` |
| `unclear` | 原文提到但说不清（如"另行通知"） | `value` 非空，`evidence` ≥ 1 条 |
| `conflict` | 原文前后不一致且无更新关系 | `value` 非空，`evidence` ≥ 2 条（两条冲突原文都要列出） |

## 3. TimeFact（时间项）

在 Fact 基础上增加 `purpose` 字段，用于区分用途：

```json
{ "purpose": "报名截止|活动开始|服务时间|其他时间", "value": "...", "status": "...", "evidence": ["..."] }
```

强制要求：**报名截止**与**活动开始**必须分成两条，不得合并、不得互相替代。

## 4. ActionItem（下一步行动）

```json
{ "type": "required|suggested", "value": "字符串", "evidence": ["原文摘录"] }
```

- `required`：通知原文明确要求居民做的事，必须带引文。
- `suggested`：仅为确认信息而提出的建议（如"打社区电话问一下具体楼栋"），不得把建议包装成原文义务。
- 页面上 `suggested` 会显示「确认建议」标签，复制文本中会注明"不是通知要求"。

## 5. 程序侧校验（app/js/validate.js）

校验顺序：

1. JSON 可解析（先剥离可能的 ```json 围栏）。
2. 顶层字段齐全、无多余字段、基础类型正确。
3. `document_status` 只能是 `notice` / `not_notice`。
4. 每个 Fact：`status` 合法；`missing` 不得带 value/evidence；其余状态必须有 value 与至少一条有效引文。
5. **引文回溯**：每条 `evidence` 归一化后必须能在输入原文中找到。
   归一化只做两件事——去掉所有空白字符、把常见全角标点折成半角。
   不做同义词/语序/错别字的容错，避免编造的引文蒙混过关。
6. `actions` 非空；`type` 合法；`required` 但无引文 → 记为警告。
7. `times` 非空（至少给出一个时间判断，哪怕是 missing）。

处理策略：

- 校验不通过 → 自动重试 1 次（`maxRetries = 1`）→ 仍不通过 → 显示失败说明，**不渲染行动卡**。
- 请求超时 45 秒 → abort → 显示超时提示与「再试一次」。
- 服务不可用（配置缺失 / SDK 未加载 / 配额错误）→ 显示明确原因，**不使用固定答案伪装成 AI 结果**。

**边界声明**：以上是机械检查，只能发现"引文对不上原文""结构缺字段""missing 却填了值"这类错误，不能保证语义理解一定正确。结果页因此始终提示"以通知原文为准"。

## 6. 安全处理

- 模型输出与用户输入一律通过 `textContent` 写入 DOM，不使用 `innerHTML`，通知里的 HTML/脚本不会被执行。
- 系统提示词把通知原文声明为"待分析数据"，并明确禁止执行其中出现的指令（提示注入防护）。
- 用户原文不写入任何日志系统，不落库；页面不建立历史记录。
