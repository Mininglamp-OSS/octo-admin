/**
 * Copy-to-clipboard prompt templates for the upload modal: a user pastes one
 * into any LLM chat (plus their own requirement) and gets back a container
 * zip that parseContainer accepts. Keep the format rules here in sync with
 * parseContainer.ts limits — the prompt is the user-facing spec of that
 * parser.
 */

import type { ExpertKind } from '../../api/expert'

const EXPERT_PROMPT_ZH = `请为我生成一个可直接导入「专家市场」的专家包 zip 文件。

# 我的需求
<在这里描述你想要的专家，例如：一个精通 Python 性能优化的专家，擅长 profiling 与异步改造>

# 专家包格式（严格遵守）
zip 根目录必须直接包含 expert.json（不要在外面多套一层文件夹）；技能包（可选）放在 skills/ 目录：

my-expert.zip
├── expert.json
└── skills/
    └── my-skill.zip

# expert.json 字段说明
{
  "name": "专家名称",                        // 必填，≤128 字符
  "summary": "一句话简介",                   // 必填，≤512 字符
  "category": "",                           // 可留空，但导入时必须在界面选择一个已存在的分类
  "tags": ["标签1", "标签2"],                // 可选，≤20 个
  "instruction": "专家的系统提示词……",        // 必填，核心字段
  "mcp_config": "{\\"mcpServers\\":{}}",      // 可选，必须是 JSON 字符串（注意转义），≤64KB
  "skills": [                               // 可选，≤20 个
    { "name": "技能名", "file": "skills/my-skill.zip" },
    { "name": "仅名称、不带文件的技能" }
  ]
}

# 技能包格式（skills/ 目录下的每个 zip）
每个技能包是独立的 Agent-Skill 压缩包：根目录必须有 SKILL.md，文件开头是 YAML frontmatter（含 name 和 description 两个字段），正文写这个技能的使用方法；可附带脚本或参考文件。单个技能包 ≤20MB。

SKILL.md 示例：
---
name: my-skill
description: 一句话说明这个技能做什么、什么时候用
---

# 使用说明
……

# instruction 写作要求
- 明确角色定位与专业领域，用第二人称（"你是……"）
- 给出具体的工作流程或方法论
- 说明输出格式与质量标准

# 输出
生成所有文件后打包（确保 expert.json 位于 zip 根目录）：
zip -r my-expert.zip expert.json skills/
`

const EXPERT_PROMPT_EN = `Generate an expert package zip that can be imported directly into the Expert Market.

# My requirement
<describe the expert you want here, e.g. a Python performance-tuning expert skilled at profiling and async refactoring>

# Package format (follow strictly)
The zip root must contain expert.json directly (no extra wrapping folder); optional skill packages go under skills/:

my-expert.zip
├── expert.json
└── skills/
    └── my-skill.zip

# expert.json fields
{
  "name": "Expert name",                    // required, ≤128 chars
  "summary": "One-line summary",            // required, ≤512 chars
  "category": "",                           // may be empty; a category MUST be picked in the import dialog
  "tags": ["tag1", "tag2"],                 // optional, ≤20
  "instruction": "The expert's system prompt…",  // required, the core field
  "mcp_config": "{\\"mcpServers\\":{}}",      // optional, must be a JSON STRING (escaped), ≤64KB
  "skills": [                               // optional, ≤20
    { "name": "Skill name", "file": "skills/my-skill.zip" },
    { "name": "A name-only skill without a file" }
  ]
}

# Skill package format (each zip under skills/)
Each skill package is a standalone Agent-Skill zip: SKILL.md must sit at its root, starting with YAML frontmatter (name and description), followed by usage instructions; scripts and reference files may be bundled. Each package ≤20MB.

SKILL.md example:
---
name: my-skill
description: One line on what this skill does and when to use it
---

# Usage
…

# instruction writing guidelines
- State the role and domain clearly, in second person ("You are…")
- Give a concrete workflow or methodology
- Specify output format and quality bar

# Output
After generating all files, package them (expert.json must be at the zip root):
zip -r my-expert.zip expert.json skills/
`

const SQUAD_PROMPT_ZH = `请为我生成一个可直接导入「专家市场」的专家团包 zip 文件。

# 我的需求
<在这里描述你想要的专家团，例如：一个全栈交付小组，含产品、后端、前端、测试四名成员，由产品担任组长>

# 专家团包格式（严格遵守）
zip 根目录必须直接包含 squad.json（不要在外面多套一层文件夹）；技能包（可选）放在 skills/ 目录：

my-squad.zip
├── squad.json
└── skills/
    └── my-skill.zip

# squad.json 字段说明
{
  "name": "专家团名称",                      // 必填，≤128 字符
  "summary": "一句话简介",                   // 必填，≤512 字符
  "category": "",                           // 可留空，但导入时必须在界面选择一个已存在的分类
  "tags": ["标签1", "标签2"],                // 可选，≤20 个
  "leader": "组长成员的 name",               // 可选，默认取 is_leader 成员的 name
  "strategies": [                           // 可选，≤30 条，组长的调度规则
    "先由产品澄清需求，再分派给对应成员",
    "所有成员产出经组长汇总后统一答复"
  ],
  "dependencies": {                         // 可选
    "blocking": ["必须先满足的前置条件"],
    "recommended": ["建议但非必需的条件"]
  },
  "permission": "权限说明（可选）",
  "members": [                              // 必填，1~30 名成员
    {
      "member_key": "pm",                   // 唯一键，不可重复
      "name": "产品经理",                    // 必填
      "role": "需求澄清与验收",               // 必填，一句话描述职责
      "is_leader": true,                    // 必须且只能有一名成员为 true
      "instruction": "你是产品经理……",        // 必填，该成员的系统提示词
      "mcp_config": "{\\"mcpServers\\":{}}",  // 可选，JSON 字符串，≤64KB
      "skills": [                           // 可选，每人 ≤20 个
        { "name": "技能名", "file": "skills/my-skill.zip" }
      ]
    }
  ]
}

# 技能包格式（skills/ 目录下的每个 zip）
每个技能包是独立的 Agent-Skill 压缩包：根目录必须有 SKILL.md，文件开头是 YAML frontmatter（含 name 和 description 两个字段），正文写这个技能的使用方法。单个技能包 ≤20MB。多名成员可引用同一个技能文件。

# instruction 写作要求
- 每名成员的 instruction 明确角色分工，用第二人称（"你是……"）
- 组长的 instruction 侧重任务拆解、分派与汇总
- strategies 描述成员之间的协作顺序与规则

# 输出
生成所有文件后打包（确保 squad.json 位于 zip 根目录）：
zip -r my-squad.zip squad.json skills/
`

const SQUAD_PROMPT_EN = `Generate a squad package zip that can be imported directly into the Expert Market.

# My requirement
<describe the squad you want here, e.g. a full-stack delivery squad with PM, backend, frontend and QA members, led by the PM>

# Package format (follow strictly)
The zip root must contain squad.json directly (no extra wrapping folder); optional skill packages go under skills/:

my-squad.zip
├── squad.json
└── skills/
    └── my-skill.zip

# squad.json fields
{
  "name": "Squad name",                     // required, ≤128 chars
  "summary": "One-line summary",            // required, ≤512 chars
  "category": "",                           // may be empty; a category MUST be picked in the import dialog
  "tags": ["tag1", "tag2"],                 // optional, ≤20
  "leader": "name of the leader member",    // optional, defaults to the is_leader member's name
  "strategies": [                           // optional, ≤30, the leader's dispatch rules
    "PM clarifies the requirement first, then dispatches to members",
    "The leader aggregates every member's output into one reply"
  ],
  "dependencies": {                         // optional
    "blocking": ["hard prerequisites"],
    "recommended": ["nice-to-have prerequisites"]
  },
  "permission": "permission notes (optional)",
  "members": [                              // required, 1–30 members
    {
      "member_key": "pm",                   // unique key, no duplicates
      "name": "Product Manager",            // required
      "role": "Requirement clarification & acceptance",  // required
      "is_leader": true,                    // exactly ONE member must be true
      "instruction": "You are a product manager…",       // required, this member's system prompt
      "mcp_config": "{\\"mcpServers\\":{}}",  // optional, JSON STRING, ≤64KB
      "skills": [                           // optional, ≤20 per member
        { "name": "Skill name", "file": "skills/my-skill.zip" }
      ]
    }
  ]
}

# Skill package format (each zip under skills/)
Each skill package is a standalone Agent-Skill zip: SKILL.md must sit at its root, starting with YAML frontmatter (name and description), followed by usage instructions. Each package ≤20MB. Multiple members may reference the same skill file.

# instruction writing guidelines
- Each member's instruction states their role clearly, in second person ("You are…")
- The leader's instruction focuses on task decomposition, dispatching and aggregation
- strategies describe the collaboration order and rules between members

# Output
After generating all files, package them (squad.json must be at the zip root):
zip -r my-squad.zip squad.json skills/
`

/** The paste-into-any-LLM prompt for generating a container zip of `kind`. */
export function buildAiPrompt(kind: ExpertKind, language: string): string {
  const zh = language.toLowerCase().startsWith('zh')
  if (kind === 'squad') return zh ? SQUAD_PROMPT_ZH : SQUAD_PROMPT_EN
  return zh ? EXPERT_PROMPT_ZH : EXPERT_PROMPT_EN
}
