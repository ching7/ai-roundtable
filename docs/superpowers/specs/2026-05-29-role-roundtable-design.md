# 角色圆桌:单 AI 多内置角色互评

**日期**: 2026-05-29
**范围**: 仅 `sidepanel/panel.html`、`sidepanel/panel.css`、`sidepanel/panel.js`。
**不改动**: `background.js`、`content/*.js`、`manifest.json`。消息流(`SEND_MESSAGE` / `GET_RESPONSE` / `RESPONSE_CAPTURED`)完全复用。
**前提**: 多 AI 圆桌(普通发送 / 互评 / 交叉引用 / 讨论)四种现有模式保留不变。本功能为**新增第 5 模式**。

## 目标

让**单个 AI** 依次扮演**多个内置角色**,围绕一个话题进行多轮圆桌讨论/互评。沿用现有"发送 + 捕获 + 轮次推进"的主逻辑。

## 1. 入口与 UI

- 「模式」下拉新增第 5 项 **角色圆桌**(value `role`)。
- 选中 `role` 模式时(`applyMode`):
  - 复用输入框 `#message-input` 作为**讨论话题**输入(占位符改为 `输入讨论话题…例如:微服务拆分的最佳实践`)。
  - 复用底部「对象」下拉 `#dd-target` 选**扮演的 AI**——此模式下强制**单选**(`ddTarget.setSingleSelect(true)`),只能选已连接的;离开该模式恢复多选。
  - 隐藏底部栏的「动作」下拉、发送键、添加文件按钮(角色圆桌不发普通消息/文件)。
  - 在输入卡下方展开**专用设置面板** `#role-setup`:
    - 一行两个下拉:**讨论风格** `#dd-role-style`(辩论/圆桌/问答,默认圆桌)+ **发言轮数** `#dd-role-rounds`(每人 1/2/3 轮,默认 2)。
    - **角色卡网格** `#role-grid`:6 张卡,多选(≥2),选中加蓝色高亮边;每卡含图标字徽章(实/构/疑/望/安/运,各自配色)、名称、一句话说明。
    - **开始圆桌讨论** 按钮 `#start-role-btn`(≥2 角色 + 话题非空 + 选定 1 个已连接 AI 才可用)。
- 讨论进行中显示**角色活动面板** `#role-active`(复用 `#discussion-panel` 同款样式):轮次徽章、参与角色徽章、状态行、`下一轮`/`生成总结`/`结束` 控件。
- 结束后渲染**转录/总结** `#role-summary`(复用 `#discussion-summary` 同款样式)。

## 2. 内置 6 角色(`ROLE_PRESETS`)

每个角色:`{ id, name, glyph, tagline, color, persona }`。

| id | name | glyph | tagline | color |
|----|------|-------|---------|-------|
| pragmatist | 务实派工程师 | 实 | 优先可落地方案 | `#3b82f6` |
| architect | 系统架构师 | 构 | 关注全局设计 | `#14b8a6` |
| critic | 批判性思考者 | 疑 | 质疑假设前提 | `#22c55e` |
| futurist | 技术前瞻者 | 望 | 着眼未来趋势 | `#f59e0b` |
| security | 安全专家 | 安 | 关注风险合规 | `#ec4899` |
| devops | DevOps 工程师 | 运 | CI/CD 与运维 | `#10b981` |

persona(内置,作为每条 prompt 的角色设定):
- pragmatist:你是一名务实派工程师,关注方案能否快速落地、工程成本与可维护性,倾向简单成熟、风险可控的方案,警惕过度设计。
- architect:你是一名系统架构师,从全局与长期演进角度思考,关注模块边界、可扩展性、一致性与系统级权衡,愿为长期收益接受前期复杂度。
- critic:你是一名批判性思考者,擅长质疑隐含假设与前提,主动指出论证漏洞、被忽略的风险与反例,推动论点更严谨。
- futurist:你是一名技术前瞻者,关注行业趋势与新兴技术,从未来数年的演进评估方案,提示可能被颠覆或更优的新路径。
- security:你是一名安全专家,关注安全、隐私、合规与风险,从威胁建模、数据保护与攻击面审视方案,指出潜在隐患。
- devops:你是一名 DevOps 工程师,关注可部署性、可观测性、CI/CD 与线上运维,从交付效率、监控告警、故障恢复评估方案。

## 3. 3 种讨论风格(`ROLE_STYLES`)

`{ id, label, instruction }`,默认 `roundtable`:
- debate / 辩论风格(各执一词) / `请坚持你的立场,针对其他角色的观点提出反驳和不同见解,明确指出他们的不足或盲点。`
- roundtable / 圆桌讨论(互相补充) / `请在他人观点的基础上做补充与完善,指出可以结合之处,推动讨论走向共识与更完整的方案。`
- qa / 问答风格(互相追问) / `请针对其他角色的观点提出有针对性的追问与质疑,促使其澄清前提、补全论据或暴露问题。`

## 4. 编排逻辑(沿用现有 send + capture;新增单 AI 顺序编排器)

单个 AI 标签页,**顺序**进行。一个**轮次**内,选定的各角色**依次自动**发言一次(发言时看到目前为止的完整转录);轮次之间**手动**点「下一轮」推进(逐轮手动,沿用现有讨论模式的轮次门控)。`发言轮数 N`(1/2/3)= 总轮次上限。

### 状态机 `roleState`
```
{
  active: false,
  ai: null,              // 扮演的 AI(取自 #dd-target 单选)
  topic: '',
  style: 'roundtable',
  totalRounds: 2,
  roles: [],             // 选定的 role id,按 ROLE_PRESETS 顺序
  currentRound: 0,
  turnQueue: [],         // 本轮待发言的 role id 队列
  awaitingRole: null,    // 已发出 prompt、正在等待捕获的 role
  history: [],           // [{round, role, content}]
  turnTimer: null,       // 单条发言超时兜底
  summaryTimer: null
}
```

### 单条 prompt 模板(`buildRolePrompt(role)`)
```
你正在参加一场围绕以下话题的多角色圆桌讨论。本轮你只扮演【{name}】这一个角色,不要扮演或代表其他角色。

# 你的角色设定
{persona}

# 讨论话题
{topic}

# 目前为止的发言
{transcript || （你是第一位发言者，暂无其他发言。）}

# 本轮要求
{styleInstruction}
请以【{name}】的身份发言（约 200–400 字），不要复述他人原文，直接给出你的观点。
```
`transcript` = `history` 全部条目按 `【{name}】:\n{content}\n\n` 拼接。模板统一,无需为第 1 轮特判(首位发言者 transcript 为空提示语)。

### 事件驱动流程(复用 `RESPONSE_CAPTURED`)
- `startRoleRoundtable()`:校验(≥2 角色、话题非空、`#dd-target` 选中且单个 AI 已连接)→ 初始化 `roleState`(currentRound=1, turnQueue=[...roles])→ 锁定输入卡(同讨论)→ 显示 `#role-active` → `runNextTurn()`。
- `runNextTurn()`:turnQueue 为空 → `onRoleRoundComplete()`;否则取队首 role,设 `awaitingRole`,状态显示"第 X 轮 · {name} 发言中…",`sendToAI(ai, buildRolePrompt(role))`,启动单条超时。
- `RESPONSE_CAPTURED` 监听新增分支:`roleState.active && roleState.awaitingRole && message.aiType === roleState.ai` → `handleRoleResponse(content)`:记入 history、清 `awaitingRole`/超时、`runNextTurn()`。
- `onRoleRoundComplete()`:状态"第 X 轮完成";`currentRound < totalRounds` 时启用「下一轮」;启用「生成总结」。
- `nextRoleRound()`:`currentRound++`,turnQueue=[...roles],禁用按钮,`runNextTurn()`。
- `generateRoleSummary()`:向同一 AI 发"以中立主持人身份总结:共识/分歧/各角色核心观点/综合结论",事件驱动等待捕获(带超时),完成后 `showRoleSummary()`。
- `endRoleRoundtable()` / `resetRoleRoundtable()`:清超时/计时器,复位 `roleState`,解锁输入卡,模式回到设置态。
- 单条/总结超时:记录错误日志、解除按钮禁用,允许重试或结束(参考现有 summary 超时兜底)。

### 与现有讨论互斥
`roleState` 与 `discussionState` 不会同时 active(分属不同模式)。`RESPONSE_CAPTURED` 先判讨论分支、再判角色分支。

## 5. 复用的现有能力
- `sendToAI` / `getLatestResponse` / `RESPONSE_CAPTURED` / `log`。
- 输入卡锁定 `lockComposerForDiscussion`(扩展为也锁角色模式,或并行一个 `lockComposer`)。
- 下拉组件 `createDropdown`(新增 `setSingleSelect`,供 `#dd-target` 在角色模式临时单选;`#dd-role-style`、`#dd-role-rounds` 为普通 single 下拉)。
- 转录/总结渲染复用 `#discussion-summary` 同款样式与 `escapeHtml`。

## 6. 不改动范围
仅 `sidepanel/panel.{html,css,js}`。`background.js`、content scripts、`manifest.json` 不变。AI 集合仍为四个,不新增 AI(CLAUDE.md 的三处同步规则不涉及)。

## 7. 验收标准
1. 模式下拉出现「角色圆桌」;选中后显示设置面板,离开后恢复普通输入栏与「对象」多选。
2. 需 ≥2 角色 + 话题 + 1 个已连接 AI 才能开始;否则日志报错并中止。
3. 单 AI 顺序发言,不串话;每个角色 prompt 含正确 persona、话题、累积转录与风格要求。
4. 逐轮手动:一轮内各角色自动依次发言,轮末可「下一轮」(未达 N 轮)/「生成总结」;达 N 轮后「下一轮」禁用。
5. 可随时「结束」中止;单条/总结超时有兜底,不卡死、不抛错。
6. 结束/总结后渲染按角色分组的转录;现有四模式与讨论零回归。
7. 窄面板(~300–420px)不溢出;角色卡网格自适应换行。
