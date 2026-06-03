# AI 圆桌「指定 AI 总结」实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在「AI 圆桌」下新增「指定一个 AI 总结圆桌内容」功能,覆盖全部四种玩法,总结者可为任意 AI(含第三方),输出复用「角色圆桌」总结样式(主持人总结 + 完整讨论记录),与讨论模式现有「双方对比总结」并存。

**Architecture:** 纯 sidepanel 改动。新增工具栏「总结者」单选下拉 + 「总结」按钮(仅 AI 圆桌显示,不受讨论锁定影响),点击后采集内容(讨论进行中用 `discussionState.history`,否则用各 AI 最新回复)→ 用主持人 prompt 发给指定 AI → 复用 `RESPONSE_CAPTURED` 捕获 → 渲染到新 `#ai-summary` 区块(角色圆桌同款样式)。`background.js` / content scripts / `manifest.json` 不动,消息流(`SEND_MESSAGE` / `GET_RESPONSE` / `RESPONSE_CAPTURED`)完全复用。

**Tech Stack:** Manifest V3、原生 JS、`chrome.runtime` / `chrome.tabs`、现有 `createDropdown` 组件。**本项目无构建链、无测试框架、无 lint**——验证方式是 `node --check` 语法校验 + grep 自查 + 浏览器手动验收。

**Spec:** `docs/superpowers/specs/2026-06-03-ai-roundtable-summary-design.md`

**提交策略:** 本仓库约定「仅在用户确认后提交」。Task 6 为单个 commit,**需用户批准后再执行**。

> **设计修订(2026-06-03,实现中按用户反馈调整)**:UI 入口由「工具栏独立的『总结者』下拉 + 『总结』按钮」改为:
> 1. **「总结」作为「玩法」下拉(`MODE_OPTIONS`)的第 5 个选项**,复用现有「发送」键触发(`handleSend` 在 `mode==='summary'` 时调 `generateAISummary`)。
> 2. **总结者复用「对象」下拉**——取 `ddTarget.getSelected()[0]`(第一个选中对象),不再有独立的 `#dd-summarizer` / `#summarize-btn`。
>
> 下面 Task 1/3/4 的「dd-summarizer / summarize-btn」相关步骤随之作废,**以 spec(已更新)为最终设计准绳**;`#ai-summary` 区块、CSS(Task 2)、`summaryState`/采集/prompt/捕获/渲染逻辑不变。`generateAISummary` 改用 `sendBtn` 作为在途禁用键、总结者取自 `ddTarget`。

---

## 文件改动总览

- **修改**:`sidepanel/panel.html`、`sidepanel/panel.css`、`sidepanel/panel.js`
- **不改动**:`background.js`、`content/*.js`、`manifest.json`

---

## Task 1:panel.html — 工具栏控件 + 总结输出区块

**Files:**
- Modify: `sidepanel/panel.html:76`(`#dd-action` 块之后追加 `#dd-summarizer` + `#summarize-btn`)
- Modify: `sidepanel/panel.html:191`(`#discussion-summary` 区块之后追加 `#ai-summary`)

- [ ] **Step 1:在 `#dd-action` 下拉块之后插入「总结者」下拉与「总结」按钮**

定位 `#dd-action` 块的结束 `</div>`(约第 76 行,下一行是第 78 行注释 `<!-- 嘉宾 ... -->`)。在该 `</div>` 与下一行注释之间插入:

```html

        <!-- 总结者 (单选,任意 AI;仅 AI 圆桌) -->
        <div class="dropdown" id="dd-summarizer" data-type="single">
          <button type="button" class="dropdown-trigger" aria-haspopup="true" aria-expanded="false" title="总结者(指定一个 AI 总结圆桌内容)">
            <span class="dropdown-label">总结者</span>
            <svg class="caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="dropdown-menu" role="menu"></div>
        </div>

        <!-- 总结按钮 (仅 AI 圆桌) -->
        <button id="summarize-btn" class="bar-btn ghost" title="指定 AI 总结圆桌内容">
          总结
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        </button>
```

> 说明:不加 `hidden` 类——默认 `kind='ai'`,首屏即应显示;`applyMode()` 负责进入角色圆桌时隐藏。下拉 label 初始写「总结者」,`createDropdown` 初始化后会显示当前选中项(默认 Claude)。

- [ ] **Step 2:在 `#discussion-summary` 区块之后插入 `#ai-summary` 区块**

定位 `#discussion-summary` 这个 `<section>` 的结束 `</section>`(约第 191 行,下一行是第 193 行注释 `<!-- Discussion control panel ... -->`)。在该 `</section>` 之后插入:

```html

    <!-- AI 圆桌: 指定单个 AI 的总结 (角色圆桌同款样式) -->
    <section class="discussion-summary hidden" id="ai-summary">
      <h3>圆桌总结</h3>
      <div id="ai-summary-content"></div>
      <button id="ai-summary-close-btn" class="primary-btn">关闭</button>
    </section>
```

- [ ] **Step 3:grep 自查三个新 id 都已加入**

Run:
```bash
cd /Users/chenyanan/Downloads/gitproject/mcp-server-all/ai-roundtable
grep -c 'id="dd-summarizer"' sidepanel/panel.html && \
grep -c 'id="summarize-btn"' sidepanel/panel.html && \
grep -c 'id="ai-summary"' sidepanel/panel.html && \
grep -c 'id="ai-summary-content"' sidepanel/panel.html && \
grep -c 'id="ai-summary-close-btn"' sidepanel/panel.html
```
Expected: 五行输出都是 `1`。

---

## Task 2:panel.css — 把 `#ai-summary-content` 并入角色圆桌样式分组

**Files:**
- Modify: `sidepanel/panel.css:682-683`(容器)
- Modify: `sidepanel/panel.css:695-696`(h4)
- Modify: `sidepanel/panel.css:703-704`(.round-summary)
- Modify: `sidepanel/panel.css:710-711`(.round-summary:last-child)
- Modify: `sidepanel/panel.css:744`(.role-turn)
- Modify: `sidepanel/panel.css:752`(.role-turn-name)

- [ ] **Step 1:容器规则加入 `#ai-summary-content`**

把:
```css
#summary-content,
#role-summary-content {
```
改为:
```css
#summary-content,
#role-summary-content,
#ai-summary-content {
```

- [ ] **Step 2:h4 规则加入**

把:
```css
#summary-content h4,
#role-summary-content h4 {
```
改为:
```css
#summary-content h4,
#role-summary-content h4,
#ai-summary-content h4 {
```

- [ ] **Step 3:.round-summary 规则加入**

把:
```css
#summary-content .round-summary,
#role-summary-content .round-summary {
```
改为:
```css
#summary-content .round-summary,
#role-summary-content .round-summary,
#ai-summary-content .round-summary {
```

- [ ] **Step 4:.round-summary:last-child 规则加入**

把:
```css
#summary-content .round-summary:last-child,
#role-summary-content .round-summary:last-child {
```
改为:
```css
#summary-content .round-summary:last-child,
#role-summary-content .round-summary:last-child,
#ai-summary-content .round-summary:last-child {
```

- [ ] **Step 5:.role-turn 规则加入(转录块样式,与角色圆桌一致)**

把:
```css
#role-summary-content .role-turn {
```
改为:
```css
#role-summary-content .role-turn,
#ai-summary-content .role-turn {
```

- [ ] **Step 6:.role-turn-name 规则加入**

把:
```css
#role-summary-content .role-turn-name {
```
改为:
```css
#role-summary-content .role-turn-name,
#ai-summary-content .role-turn-name {
```

- [ ] **Step 7:grep 自查**

Run:
```bash
cd /Users/chenyanan/Downloads/gitproject/mcp-server-all/ai-roundtable
grep -c 'ai-summary-content' sidepanel/panel.css
```
Expected: `6`(六处分组各 1 次)。

---

## Task 3:panel.js — 声明、下拉、连接同步、显隐接线

**Files:**
- Modify: `sidepanel/panel.js:106`(DOM 引用)
- Modify: `sidepanel/panel.js:116`(下拉控制器声明)
- Modify: `sidepanel/panel.js:144`(新增 `summaryState`)
- Modify: `sidepanel/panel.js:154`(`DOMContentLoaded` 调用 `setupSummaryControls`)
- Modify: `sidepanel/panel.js:420`(`setupDropdowns` 创建 `ddSummarizer`)
- Modify: `sidepanel/panel.js:448`(`applyMode` 显隐)
- Modify: `sidepanel/panel.js:458`(`applyMode` 隐藏 `#ai-summary`)
- Modify: `sidepanel/panel.js:855`(`refreshConnections` 同步连接态)

- [ ] **Step 1:新增两个 DOM 引用**

在第 106 行 `const roleControls = document.getElementById('role-controls');` 之后追加:

```javascript
const summarizeBtn = document.getElementById('summarize-btn');
const aiSummaryPanel = document.getElementById('ai-summary');
```

- [ ] **Step 2:新增下拉控制器声明**

在第 116 行 `let ddRoleRounds = null;  // 发言轮次` 之后追加:

```javascript
let ddSummarizer = null;  // AI 圆桌 总结者(单选,任意 AI)
```

- [ ] **Step 3:新增 `summaryState`**

在 `roleState = { ... };` 块的结束(第 144 行,`};` 之后)追加:

```javascript

// AI 圆桌 Summary State (single designated AI summarizes the roundtable)
let summaryState = {
  awaiting: false,  // summary prompt sent, waiting for capture
  ai: null,         // the AI designated to summarize
  turns: [],        // [{label, content}] gathered transcript, reused at render time
  timer: null       // capture timeout handle
};
```

- [ ] **Step 4:`DOMContentLoaded` 增加 `setupSummaryControls()` 调用**

把第 154 行 `  setupRoleRoundtable();` 之后追加一行:

```javascript
  setupSummaryControls();
```

(结果:`setupRoleRoundtable();` 与 `applyMode();` 之间多一行 `setupSummaryControls();`。)

- [ ] **Step 5:`setupDropdowns` 创建 `ddSummarizer`**

在 `ddRoleRounds = createDropdown(...)` 块结束(第 420 行 `});`)之后、`document.addEventListener('click', ...)`(第 422 行)之前,插入:

```javascript

  ddSummarizer = createDropdown(document.getElementById('dd-summarizer'), {
    type: 'single',
    options: targetOptions,
    defaultValue: AI_TYPES[0],
    connectionAware: true,
    onOpen: refreshConnections
  });
```

(`targetOptions` 已在 `setupDropdowns` 顶部第 366 行定义,作用域内可用。)

- [ ] **Step 6:`applyMode` 控制「总结者」下拉与「总结」按钮显隐**

在第 448 行 `  if (ddRoleRounds) ddRoleRounds.el.classList.toggle('hidden', !isRole);` 之后追加:

```javascript

  // 总结者下拉 + 总结按钮只在 AI 圆桌(非角色)显示
  if (ddSummarizer) ddSummarizer.el.classList.toggle('hidden', isRole);
  summarizeBtn.classList.toggle('hidden', isRole);
```

- [ ] **Step 7:`applyMode` 在模式(重)进入时隐藏 `#ai-summary`**

在第 458 行 `  discussionSummary.classList.add('hidden');` 之后追加:

```javascript
  aiSummaryPanel.classList.add('hidden');
```

- [ ] **Step 8:`refreshConnections` 同步 `ddSummarizer` 连接态**

在第 855 行 `    if (ddSource) ddSource.setConnections([...connected]);` 之后追加:

```javascript
    if (ddSummarizer) ddSummarizer.setConnections([...connected]);
```

- [ ] **Step 9:语法校验**

Run:
```bash
cd /Users/chenyanan/Downloads/gitproject/mcp-server-all/ai-roundtable
node --check sidepanel/panel.js && echo OK
```
Expected: `OK`

---

## Task 4:panel.js — 核心逻辑(采集 / prompt / 生成 / 捕获 / 渲染)

**Files:**
- Modify: `sidepanel/panel.js:824-830`(`RESPONSE_CAPTURED` 路由加最前置分支)
- Modify: `sidepanel/panel.js` 第 859 行附近(`refreshConnections` 之后新增 `isAIConnected`)
- Modify: `sidepanel/panel.js` 第 1242 行附近(`escapeHtml` 之后新增本功能全部函数)

- [ ] **Step 1:`RESPONSE_CAPTURED` 路由最前面新增总结分支**

把第 824~830 行这段:

```javascript
    } else if (message.type === 'RESPONSE_CAPTURED') {
      log(`${message.aiType}: 已捕获回复`, 'success');
      if (discussionState.active && discussionState.pendingResponses.has(message.aiType)) {
        handleDiscussionResponse(message.aiType, message.content);
      } else if (roleState.active && roleState.awaitingRole && message.aiType === roleState.ai) {
        handleRoleResponse(message.content);
      }
    }
```

改为(仅在最前面多一个 `if` 分支,其余不变):

```javascript
    } else if (message.type === 'RESPONSE_CAPTURED') {
      log(`${message.aiType}: 已捕获回复`, 'success');
      if (summaryState.awaiting && message.aiType === summaryState.ai) {
        handleAISummaryResponse(message.content);
      } else if (discussionState.active && discussionState.pendingResponses.has(message.aiType)) {
        handleDiscussionResponse(message.aiType, message.content);
      } else if (roleState.active && roleState.awaitingRole && message.aiType === roleState.ai) {
        handleRoleResponse(message.content);
      }
    }
```

- [ ] **Step 2:在 `refreshConnections` 之后新增 `isAIConnected` 辅助函数**

`refreshConnections` 函数体结束于第 859 行 `}`。在该 `}` 之后、`getAITypeFromUrl`(第 861 行)之前插入:

```javascript

// One-off connection check for the chosen summarizer (reuses URL matching).
async function isAIConnected(aiType) {
  try {
    const tabs = await chrome.tabs.query({});
    return tabs.some(t => getAITypeFromUrl(t.url) === aiType);
  } catch (err) {
    return false;
  }
}
```

- [ ] **Step 3:在 `escapeHtml` 之后新增本功能全部函数**

`escapeHtml` 函数(第 1237~1241 行)结束于第 1241 行 `}`。在该 `}` 之后插入下面整段:

```javascript

// ============================================
// AI 圆桌 Summary (designate one AI to summarize the roundtable)
// ============================================

function setupSummaryControls() {
  summarizeBtn.addEventListener('click', generateAISummary);
  document.getElementById('ai-summary-close-btn').addEventListener('click', () => {
    aiSummaryPanel.classList.add('hidden');
  });
}

// Collect what to summarize. Active discussion → full multi-round transcript;
// otherwise → each selected (or all connected) AI's latest live response.
async function gatherSummaryContent() {
  const turns = [];

  if (discussionState.active && discussionState.history.length > 0) {
    for (const entry of discussionState.history) {
      if (entry.type === 'summary') continue;
      const name = AI_META[entry.ai] ? AI_META[entry.ai].name : entry.ai;
      turns.push({ label: `第 ${entry.round} 轮 · ${name}`, content: entry.content });
    }
  } else {
    let aiList = ddTarget.getSelected();
    if (aiList.length === 0) aiList = [...AI_TYPES];
    for (const ai of aiList) {
      const content = await getLatestResponse(ai);
      if (content && content.trim().length > 0) {
        const name = AI_META[ai] ? AI_META[ai].name : ai;
        turns.push({ label: name, content });
      }
    }
  }

  const transcript = turns.map(t => `${t.label}:\n${t.content}`).join('\n\n');
  return { turns, transcript };
}

function buildSummaryPrompt(transcript) {
  let header = '以下是一场 AI 圆桌讨论的完整记录';
  if (discussionState.active && discussionState.topic) {
    header += `（主题:${discussionState.topic}）`;
  }
  return `${header}：

${transcript}

请你以中立主持人的身份，对这场讨论做总结，包含：
1. 主要共识点
2. 主要分歧点
3. 各方的核心观点
4. 综合结论`;
}

async function generateAISummary() {
  if (summarizeBtn.disabled) return; // re-entry guard

  const summarizer = ddSummarizer.getValue();
  if (!summarizer) { log('请先选择总结者 AI', 'error'); return; }

  if (!(await isAIConnected(summarizer))) {
    const name = AI_META[summarizer] ? AI_META[summarizer].name : summarizer;
    log(`${name} 未连接，请打开其标签页或改选其他 AI`, 'error');
    return;
  }

  // Round guard: never summarize while a discussion round is still awaiting a
  // participant — the summary capture would steal that round's response.
  if (discussionState.active && discussionState.pendingResponses.size > 0) {
    log('讨论轮次进行中，请等本轮结束后再总结', 'error');
    return;
  }

  const { turns, transcript } = await gatherSummaryContent();
  if (turns.length === 0) {
    log('没有可总结的内容，请先让 AI 产生回复', 'error');
    return;
  }

  summarizeBtn.disabled = true;
  const name = AI_META[summarizer] ? AI_META[summarizer].name : summarizer;
  log(`[圆桌总结] 正在请求 ${name} 生成总结...`);

  // Deliver first, then arm capture (same stale-capture guard as role mode).
  const res = await sendToAI(summarizer, buildSummaryPrompt(transcript));
  if (!res || !res.success) {
    log('[圆桌总结] 总结请求发送失败', 'error');
    summarizeBtn.disabled = false;
    return;
  }

  clearTimeout(summaryState.timer);
  summaryState = {
    awaiting: true,
    ai: summarizer,
    turns,
    timer: setTimeout(() => {
      if (summaryState.awaiting) {
        summaryState.awaiting = false;
        log('[圆桌总结] 等待超时，未收到总结', 'error');
        summarizeBtn.disabled = false;
      }
    }, ROLE_TURN_TIMEOUT_MS)
  };
}

function handleAISummaryResponse(content) {
  if (!summaryState.awaiting) return;
  clearTimeout(summaryState.timer);
  summaryState.awaiting = false;
  log('[圆桌总结] 总结已生成', 'success');
  showAISummary(content, summaryState.turns, summaryState.ai);
  summarizeBtn.disabled = false;
}

// Render in the 角色圆桌 summary style: host summary + full transcript.
function showAISummary(summary, turns, ai) {
  const name = AI_META[ai] ? AI_META[ai].name : ai;
  let html = `<div class="round-summary"><h4>主持人总结（${escapeHtml(name)}）</h4><div>${escapeHtml(summary).replace(/\n/g, '<br>')}</div></div>`;
  html += `<div class="round-summary"><h4>完整讨论记录</h4>`;
  turns.forEach(t => {
    html += `<div class="role-turn"><div class="role-turn-name">${escapeHtml(t.label)}</div><div>${escapeHtml(t.content).replace(/\n/g, '<br>')}</div></div>`;
  });
  html += `</div>`;
  document.getElementById('ai-summary-content').innerHTML = html;
  aiSummaryPanel.classList.remove('hidden');
}
```

- [ ] **Step 4:语法校验**

Run:
```bash
cd /Users/chenyanan/Downloads/gitproject/mcp-server-all/ai-roundtable
node --check sidepanel/panel.js && echo OK
```
Expected: `OK`

- [ ] **Step 5:函数完整性 grep 自查**

Run:
```bash
cd /Users/chenyanan/Downloads/gitproject/mcp-server-all/ai-roundtable
for fn in setupSummaryControls gatherSummaryContent buildSummaryPrompt generateAISummary handleAISummaryResponse showAISummary isAIConnected; do
  echo -n "$fn: "; grep -c "function $fn" sidepanel/panel.js
done
```
Expected: 每个函数输出 `1`。

---

## Task 5:浏览器手动验收

无法自动化。在 Chrome 里逐项验证;任何失败回到对应文件修正(语法问题用 `node --check` 复查)。

- [ ] **Step 1:重新加载扩展 + 准备标签页**

`chrome://extensions/` → 找到「AI 圆桌」→ 点刷新图标。打开并登录至少两个 AI 页面(如 Claude、ChatGPT),各发一句话让其产生一条回复。打开侧边栏。

- [ ] **Step 2:控件显隐**

「圆桌类型 = AI 圆桌」时,工具栏应出现「总结者」下拉(显示默认 Claude)+ 「总结」按钮。切到「角色圆桌」→ 两者消失。切回 AI 圆桌 → 重新出现。

- [ ] **Step 3:未连接报错**

把「总结者」选成一个**未打开标签页**的 AI → 点「总结」。
**期望**:日志出现「{名称} 未连接,请打开其标签页或改选其他 AI」,不发送。

- [ ] **Step 4:普通玩法总结(非讨论)**

玩法保持「普通发送」,「对象」勾选已回复的两个 AI。「总结者」选其中一个已连接 AI → 点「总结」。
**期望**:
- 日志「[圆桌总结] 正在请求 {名称} 生成总结...」;
- 该 AI 页面被填入总结 prompt 并自动发送;
- 回复稳定后日志「[圆桌总结] 总结已生成」;
- 面板出现「圆桌总结」区块:**主持人总结(含总结者名)** + **完整讨论记录**(每个 AI 一块,标题为 AI 名),样式与角色圆桌一致。
- 点「关闭」→ 区块隐藏。

**如果失败**:总结请求没发出 → 看日志是否「发送失败」(标签页/连接问题);采集不到内容 → 确认两个对象都已有回复且 `getLatestResponse` 能读到。

- [ ] **Step 5:第三方总结者**

「对象」勾 Claude + ChatGPT,「总结者」选 **Gemini 或 DeepSeek**(已连接、未参与)→ 点「总结」。
**期望**:第三方 AI 收到 Claude+ChatGPT 的最新回复并产出总结,正常渲染。

- [ ] **Step 6:讨论玩法 — 与双方总结并存**

玩法切「讨论」,对象选正好 2 个已连接 AI,输入主题 → 「开始」→ 等初始回复 → (可选)「下一轮」→ 轮末。
- 先点工具栏「总结」(指定任一 AI,含非参与方)→ **期望**:渲染「主持人总结 + 完整讨论记录(每条标题为 `第 N 轮 · AI名`)」。点「关闭」隐藏。
- 再点讨论面板里的「生成总结」→ **期望**:原「双方对比总结」照常工作,二者互不影响。
- 看完单 AI 总结后讨论仍可继续「下一轮」(若未达终态)。
- **轮次守卫**:在某轮"等待回复中"(状态行显示等待)时点工具栏「总结」→ **期望**:日志「讨论轮次进行中,请等本轮结束后再总结」,不发送,该轮回复照常被讨论流程捕获。

- [ ] **Step 7:空内容报错**

新开一个干净状态(刷新扩展,不让任何 AI 回复),普通玩法点「总结」。
**期望**:日志「没有可总结的内容,请先让 AI 产生回复」,不发送、不崩溃。

- [ ] **Step 8:零回归抽查**

普通发送 / 互评 / 交叉引用 / 讨论 / 角色圆桌 各跑一次基本流程,确认行为与改动前一致;窄面板宽度(~320px)下工具栏新增控件能正常换行不溢出。

---

## Task 6:提交(需用户批准后执行)

**Files:**
- Stage: `sidepanel/panel.html`, `sidepanel/panel.css`, `sidepanel/panel.js`, `docs/superpowers/specs/2026-06-03-ai-roundtable-summary-design.md`, `docs/superpowers/plans/2026-06-03-ai-roundtable-summary.md`

> 本仓库约定仅在用户明确同意后提交。Task 5 全部通过且用户同意后再执行本任务。

- [ ] **Step 1:确认工作区**

Run:
```bash
cd /Users/chenyanan/Downloads/gitproject/mcp-server-all/ai-roundtable
git status --short
```
Expected: 三个 `M sidepanel/panel.{html,css,js}` + 两个 `?? docs/superpowers/...`(spec 与 plan)。

- [ ] **Step 2:暂存**

Run:
```bash
git add sidepanel/panel.html sidepanel/panel.css sidepanel/panel.js docs/superpowers/specs/2026-06-03-ai-roundtable-summary-design.md docs/superpowers/plans/2026-06-03-ai-roundtable-summary.md
```

- [ ] **Step 3:提交**

Run:
```bash
git commit -m "$(cat <<'EOF'
feat: AI 圆桌指定单个 AI 总结圆桌内容(角色圆桌同款输出)

新增工具栏「总结者」单选下拉 + 「总结」按钮(仅 AI 圆桌显示,不受讨论
锁定影响)。点击后:讨论进行中用 discussionState.history,否则采集所选
(或全部已连接)AI 的最新回复,发给指定 AI(可为第三方)以中立主持人
身份总结,复用 RESPONSE_CAPTURED 捕获,渲染到新 #ai-summary 区块,
样式复用角色圆桌(主持人总结 + 完整讨论记录)。讨论模式下与现有
「双方对比总结」并存。仅改 sidepanel/*,不动 background / content /
manifest。
EOF
)"
```

- [ ] **Step 4:验证**

Run: `git log --oneline -1`
Expected: 摘要行包含 `feat: AI 圆桌指定单个 AI 总结`。

---

## 完成判据

- [ ] Task 1~4 全部打勾,`node --check sidepanel/panel.js` 通过,各 grep 自查数目正确。
- [ ] Task 5 验收 Step 2~8 全部通过。
- [ ] 用户同意后完成 Task 6 提交,工作区 clean。

---

## 故障排查提示

- **工具栏不显示新控件** → `applyMode` 显隐没接上,或 HTML id 拼错。跑 Task 1 Step 3 与 Task 3 Step 6 自查。
- **点「总结」无反应** → `setupSummaryControls` 没在 `DOMContentLoaded` 调用(Task 3 Step 4),或按钮 id 不符。
- **总结捕获不到(一直等待)** → `RESPONSE_CAPTURED` 分支没加(Task 4 Step 1),或总结者标签页未注入 content script(切到该页刷新一次)。
- **样式与角色圆桌不一致** → `panel.css` 六处分组没全加 `#ai-summary-content`(Task 2 Step 7 应为 6)。
- **讨论中点总结却用了过期内容** → 采集判据应为 `discussionState.active && history.length>0`;讨论已结束时走最新回复分支。
