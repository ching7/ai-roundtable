# AI 圆桌:指定单个 AI 总结圆桌内容

**日期**: 2026-06-03
**范围**: 仅 `sidepanel/panel.html`、`sidepanel/panel.css`、`sidepanel/panel.js`。
**不改动**: `background.js`、`content/*.js`、`manifest.json`。消息流(`SEND_MESSAGE` / `GET_RESPONSE` / `RESPONSE_CAPTURED`)完全复用。
**前提**: 现有四种 AI 圆桌玩法(普通发送 / 互评 / 交叉引用 / 讨论)与角色圆桌保留不变。本功能为**新增能力**,不替换任何现有流程。

## 目标

在「AI 圆桌」的**「玩法」下拉新增第 5 个选项「总结」**:用户在「对象」中选定参与者,由**第一个选中的对象**担任总结者,对所选各方的圆桌内容做一次**主持人式总结**,输出样式**复用「角色圆桌」总结**(主持人总结 +「完整讨论记录」分块)。

内容来源:
- 若有活跃讨论(`discussionState.active`):取自 `discussionState.history`(多轮转录)。
- 否则:取自所选「对象」各 AI 的**最新回复**(实时 DOM 读取)。

> 设计修订(2026-06-03):原方案在工具栏放独立的「总结者」下拉 + 「总结」按钮。改为:**「总结」作为「玩法」的一个选项**(复用「发送」键触发,与其它玩法分发一致);**总结者复用「对象」下拉的第一个选中项**,不再有独立的总结者下拉。讨论面板原有的「双方对比总结」(`生成总结`)不受影响,继续保留。

## 1. 入口与 UI(玩法选项方案)

- **「玩法」下拉 `#dd-mode` 新增第 5 项**:`{ value: 'summary', label: '总结' }`(`MODE_OPTIONS` 末尾)。
- **无独立的总结者下拉 / 总结按钮**。总结模式下:
  - 「对象」下拉 `#dd-target` 既选参与者、其**第一个选中项**(`ddTarget.getSelected()[0]`,按 AI_TYPES 顺序)即总结者。
  - 触发沿用现有**发送键**:`handleSend()` 按 `currentMode()` 分发,`mode === 'summary'` → `generateAISummary()`。
  - 「动作」下拉、交叉引用行隐藏(`applyMode` 既有逻辑:非 mutual/cross 即隐藏,自动满足)。
  - `MODE_PLACEHOLDERS.summary` 提示「在『对象』中选择参与者,第一个作为总结者…」;`SEND_TITLES.summary = '总结'`。输入框内容在总结模式下不参与(可留空)。
- 总结请求在途时禁用**发送键** `#send-btn`,完成/超时/失败后恢复;`handleSend` 顶部 `if (sendBtn.disabled) return` 兼任防重入。

新增**总结输出区块** `#ai-summary`(结构镜像 `#role-summary`,复用 `.discussion-summary` 容器样式),置于 `#discussion-summary` 之后:

```html
<section class="discussion-summary hidden" id="ai-summary">
  <h3>圆桌总结</h3>
  <div id="ai-summary-content"></div>
  <button id="ai-summary-close-btn" class="primary-btn">关闭</button>
</section>
```

「关闭」按钮**仅隐藏**该区块,不重置任何讨论/角色状态(保证讨论可继续)。`applyMode()` 在模式(重)进入时一并隐藏 `#ai-summary`。

## 2. 状态 `summaryState`

```
let summaryState = {
  awaiting: false,   // 已发出总结 prompt、正在等待捕获
  ai: null,          // 担任总结的 AI
  turns: [],         // [{label, content}] 采集到的转录,渲染时直接复用
  timer: null        // 捕获超时兜底
};
```

`turns` 在**发送 prompt 之前**采集并缓存,渲染时直接使用(避免捕获回来后页面 DOM 已变)。

## 3. 内容采集 `gatherSummaryContent()`(async)

返回 `{ turns, transcript }`:
- `turns`: `[{label, content}]`,供渲染「完整讨论记录」。
- `transcript`: 由 turns 按 `{label}:\n{content}\n\n` 拼接,供 prompt。

采集来源(二选一):
1. **讨论历史**:若 `discussionState.active && discussionState.history.length > 0` →
   - 遍历 `discussionState.history` 中 `type !== 'summary'` 的条目,
   - `label = 第 {round} 轮 · {AI_META[ai].name}`,`content = entry.content`。
   - (以 `active` 为判据,避免讨论已结束但 `history` 未被「新讨论」清空时误用过期转录;讨论一旦结束 `active=false` 即回退到最新回复。)
2. **最新回复**(其余情况):
   - 目标 AI 集合 = `ddTarget.getSelected()`(即总结模式下用户所选的参与者;第一个为总结者);理论上总结模式已校验非空,若为空则回退为「全部已连接 AI」作兜底。
   - 对每个目标 `await getLatestResponse(ai)`,仅保留**非空**回复,按 `AI_TYPES` 顺序。
   - `label = {AI_META[ai].name}`,`content = 回复文本`。
   - 注:总结者(第一个对象)的最新回复也会被纳入,即它在总结全场(含自己的发言)——与角色圆桌中扮演者总结全场一致。

若最终 `turns.length === 0` → 视为无可总结内容(调用方报错中止)。

## 4. 总结 prompt 模板(`buildSummaryPrompt(transcript)`)

沿用角色圆桌总结的 4 段式结构,主持人中立视角:

```
以下是一场 AI 圆桌讨论的完整记录:

{transcript}

请你以中立主持人的身份,对这场讨论做总结,包含:
1. 主要共识点
2. 主要分歧点
3. 各方的核心观点
4. 综合结论
```

(讨论玩法可在记录前附主题行 `主题: {discussionState.topic}`;非讨论玩法无主题,省略。)

## 5. 编排逻辑(复用 send + capture)

### `generateAISummary()`(由 `handleSend()` 在 `mode === 'summary'` 时调用)
1. `selected = ddTarget.getSelected()`;若 `selected.length === 0` → 日志「请在『对象』中至少选择一个 AI(第一个作为总结者)」并返回。`summarizer = selected[0]`。
2. 若 `summarizer` 未连接(`isAIConnected` 校验失败)→ 日志报错并返回。
3. **轮次守卫**:若 `discussionState.active && discussionState.pendingResponses.size > 0`(讨论本轮仍在等参与者回复)→ 日志「讨论轮次进行中,请等本轮结束后再总结」并返回。避免总结捕获抢走某参与者的本轮回复、导致该轮卡死。
4. `const { turns, transcript } = await gatherSummaryContent()`;若 `turns.length === 0` → 日志「没有可总结的内容,请先让 AI 回复」并返回。
5. 禁用**发送键** `sendBtn`;日志「正在请求 {总结者} 生成总结…」。
6. `const res = await sendToAI(summarizer, buildSummaryPrompt(transcript))`;失败 → 日志报错、恢复 `sendBtn`、返回。
7. 置 `summaryState = { awaiting: true, ai: summarizer, turns, timer: <10min 超时> }`。
8. 超时兜底(`ROLE_TURN_TIMEOUT_MS` = `10 * 60 * 1000`,与现有捕获上限一致):若仍 `awaiting` → 清 `awaiting`、日志「总结等待超时」、恢复 `sendBtn`。

> 以上 1~4 的校验 `return` 均在禁用 `sendBtn` 之前,保证校验失败不会卡死发送键。`handleAISummaryResponse` 渲染后恢复 `sendBtn`。切换模式时 `resetSummaryState()` 若发现仍 `awaiting`,亦恢复 `sendBtn` 并清 timer,避免遗留禁用态。

### `RESPONSE_CAPTURED` 路由(在 `setupMessageListener` 现有分支**最前面**新增)
```
if (summaryState.awaiting && message.aiType === summaryState.ai) {
  handleAISummaryResponse(message.content);
} else if (discussionState.active && discussionState.pendingResponses.has(message.aiType)) {
  ...                       // 现有讨论分支
} else if (roleState.active && roleState.awaitingRole && message.aiType === roleState.ai) {
  ...                       // 现有角色分支
}
```
置于最前安全:总结仅在用户显式点击时武装;此时讨论若 active 也已轮末(`pendingResponses` 为空),讨论分支不会命中同一 AI;角色模式与 AI 圆桌互斥。

### `handleAISummaryResponse(content)`
- 守卫 `summaryState.awaiting`;清超时、置 `awaiting=false`。
- 日志「圆桌总结已生成」;`showAISummary(content, summaryState.turns, summaryState.ai)`;恢复**发送键** `sendBtn`。

## 6. 渲染 `showAISummary(summary, turns, ai)`(复用角色圆桌样式)

```
#ai-summary 取消 hidden;
#ai-summary-content.innerHTML =
  <div class="round-summary">
    <h4>主持人总结（{AI_META[ai].name}）</h4>
    <div>{escapeHtml(summary).replace(\n→<br>)}</div>
  </div>
  <div class="round-summary">
    <h4>完整讨论记录</h4>
    {turns.map(t =>
      <div class="role-turn">
        <div class="role-turn-name">{escapeHtml(t.label)}</div>
        <div>{escapeHtml(t.content).replace(\n→<br>)}</div>
      </div>)}
  </div>
```

不修改任何讨论/角色状态;讨论进行中触发总结后,讨论流程不受影响,可继续「下一轮」。

## 7. CSS 改动(`panel.css`)

把 `#ai-summary-content` 并入现有针对 `#role-summary-content` 的样式分组,使其与角色圆桌**像素级一致**:
- `#summary-content, #role-summary-content` 容器规则 → 追加 `#ai-summary-content`。
- `… h4` → 追加 `#ai-summary-content h4`。
- `… .round-summary` 及 `:last-child` → 追加 `#ai-summary-content .round-summary`。
- `#role-summary-content .role-turn` / `.role-turn-name` → 追加 `#ai-summary-content .role-turn` / `.role-turn-name`。

## 8. JS 接线汇总(`panel.js`)

- 常量:`MODE_OPTIONS` 末尾加 `{ value: 'summary', label: '总结' }`;`SEND_TITLES.summary = '总结'`;`MODE_PLACEHOLDERS.summary` 给总结提示语。
- `handleSend()`:在 mode 分发里加 `if (mode === 'summary') { await generateAISummary(); return; }`(置于 discussion/role 分支同区)。
- `applyMode()`:仅需切换 `#ai-summary` 的 `hidden`(模式重进入时隐藏)+ `resetSummaryState()`。`#dd-mode` 的 summary 选项随 AI 圆桌自然显示;「动作」/交叉行已由既有逻辑在非 mutual/cross 时隐藏。**不再**有独立总结者下拉/按钮的显隐。
- 新增 `summaryState`、`resetSummaryState()`、`aiName()`、`getConnectedAISet()`、`isAIConnected()`,及 `gatherSummaryContent` / `buildSummaryPrompt` / `generateAISummary` / `handleAISummaryResponse` / `showAISummary`。`generateAISummary` 的总结者取 `ddTarget.getSelected()[0]`。
- `setupMessageListener()` 的 `RESPONSE_CAPTURED` 分支加最前置判断(`summaryState.awaiting && aiType===summaryState.ai`)。
- 接线 `#ai-summary-close-btn` → 隐藏 `#ai-summary`(`setupSummaryControls`,在 `DOMContentLoaded` 调用)。
- 顶部模块常量复用现有 `AI_TYPES` / `AI_META` / `escapeHtml`。
- **移除**(相对原方案):`#dd-summarizer` 下拉与 `#summarize-btn` 按钮(HTML + 其 `createDropdown`/`setConnections`/`applyMode` 显隐/点击接线均删除)。

## 9. 不改动范围

仅 `sidepanel/panel.{html,css,js}`。`background.js`、content scripts、`manifest.json` 不变。AI 集合仍为四个(CLAUDE.md 三处同步规则不涉及)。

## 10. 验收标准

1. 「玩法」下拉在 AI 圆桌下出现第 5 项「总结」;选中后,发送键标题变为「总结」,无独立的总结者下拉/按钮。切到「角色圆桌」时玩法下拉隐藏(既有行为)。
2. 总结模式下「对象」未选任何 AI 时按发送 → 日志报错、不发送;选了但第一个对象未连接 → 日志报错、不发送。
3. **总结所选对象的最新回复**:玩法=总结,对象勾若干已回复的 AI(第一个为总结者)→ 按发送 → 第一个对象返回总结后,渲染「主持人总结(总结者名)+ 完整讨论记录(每个对象一块)」。第一个对象可为任意已连接 AI。
4. **活跃讨论**:若讨论 active,总结取多轮 `history`(每条 `第 N 轮 · AI名`);讨论面板原「双方对比总结」不受影响、可独立使用。
5. 输出区块样式与角色圆桌总结一致(同 `.round-summary` / `.role-turn` 样式)。
6. 查看总结后点「关闭」仅隐藏总结区块,不重置任何状态。
6b. 讨论 active 且本轮仍在等待参与者回复时触发总结 → 被轮次守卫拦下并报错,不发送、不抢占该轮捕获。
7. 总结捕获有 10 分钟超时兜底,不卡死、不抛错;失败/超时后发送键恢复可点;总结在途切换玩法 → `resetSummaryState` 恢复发送键、清 timer。
8. 现有四种 AI 圆桌玩法、讨论双方总结、角色圆桌全部零回归。
9. 窄面板(~300–420px)下工具栏不溢出。
