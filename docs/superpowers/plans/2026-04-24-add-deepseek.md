# 新增 DeepSeek 圆桌参与者 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 DeepSeek（chat.deepseek.com）接入为圆桌第四位参与者，与 Claude、ChatGPT 能力对等（消息注入 / 流式响应捕获 / 文件上传 / 2-AI 启发式 / `/mutual` / `/cross` / 讨论模式）。

**Architecture:** 沿用现有三进程消息架构。新增一个 `content/deepseek.js`（骨架派生自 `chatgpt.js`，R1 思考块过滤思路借鉴 `claude.js`）；`manifest.json` 注册新 host + content script；`background.js` 在 URL 路由表加入 `deepseek`；sidepanel 三个文件（html/css/js）把 DeepSeek 暴露到 UI、`@mention` 正则、讨论模式参与者。

**Tech Stack:** Manifest V3、原生 JS、`chrome.runtime` / `chrome.tabs` / `chrome.storage.session` API、`MutationObserver`、`DataTransfer`。**本项目无构建链、无测试框架、无 lint**——验证方式是浏览器手动测试 + 纯语法检查（`node --check`）。

**Branch:** `feature/add-deepseek`（已创建，spec doc 已落入 commit `d20e74b`）。

---

## 文件改动总览

- **新增**：`content/deepseek.js`
- **修改**：`manifest.json`、`background.js`、`sidepanel/panel.js`、`sidepanel/panel.html`、`sidepanel/panel.css`

提交分 3 个 commit（按 spec 提交策略）：
- Commit A（本计划任务 1~4 产出）：`manifest.json` + `background.js` + `content/deepseek.js`
- Commit B（本计划任务 5~8 产出）：`sidepanel/panel.js` + `sidepanel/panel.html` + `sidepanel/panel.css`
- Commit C（本计划任务 9 产出，视验收情况可选）：DOM 选择器调优补丁

---

## Task 1：manifest.json 注册 DeepSeek

**Files:**
- Modify: `manifest.json`（追加两处配置项）

- [ ] **Step 1：修改 `manifest.json`**

把下面两处修改到位（两处分别是 `host_permissions` 和 `content_scripts` 数组）。`host_permissions` 追加一个字符串，`content_scripts` 追加一个完整对象。

```json
"host_permissions": [
  "https://claude.ai/*",
  "https://chat.openai.com/*",
  "https://chatgpt.com/*",
  "https://gemini.google.com/*",
  "https://chat.deepseek.com/*"
],
```

```json
"content_scripts": [
  {
    "matches": ["https://claude.ai/*"],
    "js": ["content/claude.js"],
    "run_at": "document_idle"
  },
  {
    "matches": ["https://chat.openai.com/*", "https://chatgpt.com/*"],
    "js": ["content/chatgpt.js"],
    "run_at": "document_idle"
  },
  {
    "matches": ["https://gemini.google.com/*"],
    "js": ["content/gemini.js"],
    "run_at": "document_idle"
  },
  {
    "matches": ["https://chat.deepseek.com/*"],
    "js": ["content/deepseek.js"],
    "run_at": "document_idle"
  }
],
```

- [ ] **Step 2：JSON 语法校验**

Run: `python3 -m json.tool manifest.json > /dev/null && echo OK`
Expected: `OK`

---

## Task 2：background.js 加入 deepseek 路由

**Files:**
- Modify: `background.js:4-8`（`AI_URL_PATTERNS` 常量）
- Modify: `background.js:11-14`（`getStoredResponses` 初始对象）

- [ ] **Step 1：在 `AI_URL_PATTERNS` 里加一行**

把 `background.js` 开头的 `AI_URL_PATTERNS` 改成：

```javascript
const AI_URL_PATTERNS = {
  claude: ['claude.ai'],
  chatgpt: ['chat.openai.com', 'chatgpt.com'],
  gemini: ['gemini.google.com'],
  deepseek: ['chat.deepseek.com']
};
```

- [ ] **Step 2：在 `getStoredResponses` 默认对象里加 `deepseek` 键**

把函数体改成：

```javascript
async function getStoredResponses() {
  const result = await chrome.storage.session.get('latestResponses');
  return result.latestResponses || { claude: null, chatgpt: null, gemini: null, deepseek: null };
}
```

- [ ] **Step 3：语法校验**

Run: `node --check background.js && echo OK`
Expected: `OK`

---

## Task 3：新建 content/deepseek.js（完整实现）

**Files:**
- Create: `content/deepseek.js`

- [ ] **Step 1：创建 `content/deepseek.js`，内容如下**

完整代码。骨架沿用 `chatgpt.js`，在 `getLatestResponse` 内新增 R1 思考块过滤，在选择器清单上换成 DeepSeek 候选。

```javascript
// AI Panel - DeepSeek Content Script

(function() {
  'use strict';

  const AI_TYPE = 'deepseek';

  // Check if extension context is still valid
  function isContextValid() {
    return chrome.runtime && chrome.runtime.id;
  }

  // Safe message sender that checks context first
  function safeSendMessage(message, callback) {
    if (!isContextValid()) {
      console.log('[AI Panel] Extension context invalidated, skipping message');
      return;
    }
    try {
      chrome.runtime.sendMessage(message, callback);
    } catch (e) {
      console.log('[AI Panel] Failed to send message:', e.message);
    }
  }

  // Notify background that content script is ready
  safeSendMessage({ type: 'CONTENT_SCRIPT_READY', aiType: AI_TYPE });

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'INJECT_MESSAGE') {
      injectMessage(message.message)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (message.type === 'INJECT_FILES') {
      injectFiles(message.files)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;
    }

    if (message.type === 'GET_LATEST_RESPONSE') {
      const response = getLatestResponse();
      sendResponse({ content: response });
      return true;
    }
  });

  // Setup response observer for cross-reference feature
  setupResponseObserver();

  async function injectMessage(text) {
    // DeepSeek uses a textarea or contenteditable div depending on UI variant
    const inputSelectors = [
      'textarea[placeholder*="DeepSeek" i]',
      'textarea#chat-input',
      'textarea[placeholder*="message" i]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      'textarea'
    ];

    let inputEl = null;
    for (const selector of inputSelectors) {
      inputEl = document.querySelector(selector);
      if (inputEl) break;
    }

    if (!inputEl) {
      throw new Error('Could not find DeepSeek input field');
    }

    inputEl.focus();

    if (inputEl.tagName === 'TEXTAREA') {
      inputEl.value = text;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      inputEl.innerHTML = `<p>${escapeHtml(text)}</p>`;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    await sleep(100);

    const sendButton = findSendButton();
    if (!sendButton) {
      throw new Error('Could not find DeepSeek send button');
    }

    await waitForButtonEnabled(sendButton);
    sendButton.click();

    console.log('[AI Panel] DeepSeek message sent, starting response capture...');
    waitForStreamingComplete();

    return true;
  }

  function findSendButton() {
    const selectors = [
      'button[aria-label*="Send" i]',
      'button[data-testid*="send" i]',
      'form button[type="submit"]',
      'button:has(svg)'
    ];

    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el) return el.closest('button') || el;
      } catch (e) {
        // :has() may not be supported in some contexts; ignore and continue
      }
    }

    // Fallback: find last visible button near the input, containing an SVG
    const buttons = document.querySelectorAll('button');
    const candidates = [];
    for (const btn of buttons) {
      if (btn.querySelector('svg') && isVisible(btn)) {
        const rect = btn.getBoundingClientRect();
        if (rect.bottom > window.innerHeight - 200) {
          candidates.push(btn);
        }
      }
    }
    return candidates[candidates.length - 1] || null;
  }

  async function waitForButtonEnabled(button, maxWait = 2000) {
    const start = Date.now();
    while (button.disabled && Date.now() - start < maxWait) {
      await sleep(50);
    }
  }

  function setupResponseObserver() {
    const observer = new MutationObserver((mutations) => {
      if (!isContextValid()) {
        observer.disconnect();
        return;
      }
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              checkForResponse(node);
            }
          }
        }
      }
    });

    const startObserving = () => {
      if (!isContextValid()) return;
      const mainContent = document.querySelector('main') || document.body;
      observer.observe(mainContent, {
        childList: true,
        subtree: true
      });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserving);
    } else {
      startObserving();
    }
  }

  let lastCapturedContent = '';
  let isCapturing = false;

  function checkForResponse(node) {
    if (isCapturing) return;

    const responseSelectors = [
      '.ds-markdown',
      '[class*="message-content"]',
      '[class*="assistant"]'
    ];

    for (const selector of responseSelectors) {
      if (node.matches?.(selector) || node.querySelector?.(selector)) {
        console.log('[AI Panel] DeepSeek detected new response...');
        waitForStreamingComplete();
        break;
      }
    }
  }

  async function waitForStreamingComplete() {
    if (isCapturing) {
      console.log('[AI Panel] DeepSeek already capturing, skipping...');
      return;
    }
    isCapturing = true;
    console.log('[AI Panel] DeepSeek starting capture loop...');

    let previousContent = '';
    let stableCount = 0;
    const maxWait = 600000;  // 10 minutes
    const checkInterval = 500;
    const stableThreshold = 4;  // 2 seconds of stable content

    const startTime = Date.now();

    try {
      while (Date.now() - startTime < maxWait) {
        if (!isContextValid()) {
          console.log('[AI Panel] Context invalidated, stopping capture');
          return;
        }

        await sleep(checkInterval);

        const isStreaming = !!(
          document.querySelector('button[aria-label*="Stop" i]') ||
          document.querySelector('[data-streaming="true"]') ||
          document.querySelector('[class*="streaming"]')
        );

        const currentContent = getLatestResponse() || '';

        const contentStable = currentContent === previousContent && currentContent.length > 0;

        if (!isStreaming && contentStable) {
          stableCount++;
          if (stableCount >= stableThreshold) {
            if (currentContent !== lastCapturedContent) {
              lastCapturedContent = currentContent;
              console.log('[AI Panel] DeepSeek capturing response, length:', currentContent.length);
              safeSendMessage({
                type: 'RESPONSE_CAPTURED',
                aiType: AI_TYPE,
                content: currentContent
              });
            }
            return;
          }
        } else {
          stableCount = 0;
        }

        previousContent = currentContent;
      }
      console.log('[AI Panel] DeepSeek capture timeout after', maxWait / 1000, 'seconds');
    } finally {
      isCapturing = false;
    }
  }

  // Strip R1 thinking-process blocks from the captured text.
  // Anchor heuristics: text-based ("已深度思考用时" / "Thought for" / "Thinking..." / "思考"),
  // and class-based (elements whose class contains "reasoning" or "thinking").
  // Degradation: if we cannot isolate a clean answer body, return the original text
  // rather than null — a full capture (thinking + answer) beats losing the response entirely.
  function stripThinkingBlock(container) {
    if (!container) return null;

    const clone = container.cloneNode(true);

    // 1) Remove class-based thinking/reasoning subtrees
    const classMatches = clone.querySelectorAll('[class*="reasoning"], [class*="thinking"]');
    classMatches.forEach(el => el.remove());

    // 2) Remove text-anchor thinking containers
    const anchors = [/已深度思考用时/, /思考完成/, /Thought for /i, /Thinking\.\.\./i];
    const allEls = clone.querySelectorAll('*');
    for (const el of allEls) {
      const text = (el.textContent || '').slice(0, 200); // only scan the head
      if (anchors.some(rx => rx.test(text))) {
        // Remove this element's nearest "collapsible-looking" ancestor; fall back to itself
        const collapsible = el.closest('[class*="collapse"], [class*="accordion"], [class*="details"], details');
        (collapsible || el).remove();
        break; // one block is enough
      }
    }

    const cleaned = (clone.innerText || '').trim();
    const original = (container.innerText || '').trim();

    // Degradation: if stripping produced empty or near-empty text, return the original.
    if (!cleaned || cleaned.length < Math.min(20, original.length * 0.2)) {
      return original || null;
    }
    return cleaned;
  }

  function getLatestResponse() {
    const containerSelectors = [
      '.ds-markdown',
      '[class*="message-content"]',
      '[class*="assistant"]',
      '.markdown'
    ];

    let containers = [];
    for (const selector of containerSelectors) {
      containers = document.querySelectorAll(selector);
      if (containers.length > 0) break;
    }

    if (containers.length === 0) return null;

    const lastContainer = containers[containers.length - 1];
    return stripThinkingBlock(lastContainer);
  }

  // Utility functions
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0';
  }

  // File injection using DataTransfer API
  async function injectFiles(filesData) {
    console.log('[AI Panel] DeepSeek injecting files:', filesData.length);

    const files = filesData.map(fileData => {
      const byteCharacters = atob(fileData.base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: fileData.type });
      return new File([blob], fileData.name, { type: fileData.type });
    });

    const fileInput = document.querySelector('input[type="file"]');

    if (fileInput) {
      const dataTransfer = new DataTransfer();
      files.forEach(file => dataTransfer.items.add(file));
      fileInput.files = dataTransfer.files;
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('[AI Panel] DeepSeek files injected via input');
      await sleep(800);
      return true;
    }

    const dropZone = document.querySelector('div[contenteditable="true"]') ||
                     document.querySelector('textarea') ||
                     document.querySelector('form');

    if (dropZone) {
      const dataTransfer = new DataTransfer();
      files.forEach(file => dataTransfer.items.add(file));

      const events = ['dragenter', 'dragover', 'drop'];
      for (const eventType of events) {
        const event = new DragEvent(eventType, {
          bubbles: true,
          cancelable: true,
          dataTransfer: dataTransfer
        });
        dropZone.dispatchEvent(event);
        await sleep(50);
      }

      console.log('[AI Panel] DeepSeek files injected via drop');
      await sleep(800);
      return true;
    }

    throw new Error('Could not find DeepSeek file input or drop zone');
  }

  console.log('[AI Panel] DeepSeek content script loaded');
})();
```

- [ ] **Step 2：语法校验**

Run: `node --check content/deepseek.js && echo OK`
Expected: `OK`

---

## Task 4：提交 Commit A（核心接入）

**Files:**
- Stage: `manifest.json`, `background.js`, `content/deepseek.js`

- [ ] **Step 1：确认工作区状态**

Run: `git status --short`
Expected: 看到 3 行（`M manifest.json`、`M background.js`、`?? content/deepseek.js`），无其他条目。

- [ ] **Step 2：暂存这 3 个文件**

Run: `git add manifest.json background.js content/deepseek.js`

- [ ] **Step 3：提交 Commit A**

Run:

```bash
git commit -m "$(cat <<'EOF'
feat: wire DeepSeek into manifest, background routing, and content script

Adds https://chat.deepseek.com/* host permission, a dedicated content
script (skeleton derived from chatgpt.js, with an R1 thinking-block
filter adapted from claude.js), and the URL-pattern / storage key entry
in the background service worker.

UI wiring (sidepanel checkboxes, @mention regex, discussion-mode
participant) lands in the next commit.
EOF
)"
```

- [ ] **Step 4：验证 commit**

Run: `git log --oneline -1`
Expected: 新 commit 摘要行包含 `feat: wire DeepSeek`。

---

## Task 5：panel.js 把 DeepSeek 纳入常量表与 `@mention` 正则

**Files:**
- Modify: `sidepanel/panel.js:3`（`AI_TYPES`）
- Modify: `sidepanel/panel.js:156-162`（`getAITypeFromUrl`）
- Modify: `sidepanel/panel.js:276`（`/cross` 分支 `mentionPattern`）
- Modify: `sidepanel/panel.js:306`（外层 `mentionPattern`）

- [ ] **Step 1：把 `AI_TYPES` 加上 `deepseek`**

把 `const AI_TYPES = ['claude', 'chatgpt', 'gemini'];` 改为：

```javascript
const AI_TYPES = ['claude', 'chatgpt', 'gemini', 'deepseek'];
```

- [ ] **Step 2：`getAITypeFromUrl` 增加 deepseek 分支**

把函数改为：

```javascript
function getAITypeFromUrl(url) {
  if (!url) return null;
  if (url.includes('claude.ai')) return 'claude';
  if (url.includes('chat.openai.com') || url.includes('chatgpt.com')) return 'chatgpt';
  if (url.includes('gemini.google.com')) return 'gemini';
  if (url.includes('chat.deepseek.com')) return 'deepseek';
  return null;
}
```

- [ ] **Step 3：把两处 `mentionPattern` 都加入 deepseek**

文件里共有 **两处** `const mentionPattern = /@(claude|chatgpt|gemini)/gi;`——约第 276 行（在 `/cross` 分支内）和第 306 行（外层）。两处都改为：

```javascript
const mentionPattern = /@(claude|chatgpt|gemini|deepseek)/gi;
```

- [ ] **Step 4：确认不多不少只改了两处正则**

Run: `grep -n 'claude|chatgpt|gemini' sidepanel/panel.js`
Expected: 看到两行，且两行都包含 `|deepseek`（即 `/@(claude|chatgpt|gemini|deepseek)/gi`）。如果还能看到任何不带 `|deepseek` 的行，回到 Step 3 修。

- [ ] **Step 5：语法校验**

Run: `node --check sidepanel/panel.js && echo OK`
Expected: `OK`

---

## Task 6：panel.html 加入 DeepSeek 复选框、@ 按钮、讨论参与者

**Files:**
- Modify: `sidepanel/panel.html:48-52`（`.targets` 区块，在 Gemini 标签之后追加）
- Modify: `sidepanel/panel.html:73-76`（`.mentions` 工具栏组末尾追加）
- Modify: `sidepanel/panel.html:134-137`（讨论模式参与者组末尾追加）

- [ ] **Step 1：在 `.targets` 里追加 DeepSeek 复选框**

把 Gemini 的 `<label>` 块之后追加下面这段（默认 `checked`、状态点容器结构一致）：

```html
      <label class="target-label">
        <input type="checkbox" id="target-deepseek" checked>
        <span class="target-name">DeepSeek</span>
        <span class="status" id="status-deepseek"></span>
      </label>
```

最终 `.targets` 区块有四个 `<label>`。

- [ ] **Step 2：在工具栏 `.mentions` 组里追加 `@DeepSeek` 按钮**

把 `<button class="mention-btn" data-mention="@Gemini" title="引用 Gemini">@Gemini</button>` 下一行追加：

```html
          <button class="mention-btn" data-mention="@DeepSeek" title="引用 DeepSeek">@DeepSeek</button>
```

- [ ] **Step 3：在讨论模式参与者组里追加 DeepSeek**

把 Gemini 的 `<label class="participant-option">` 块之后追加：

```html
            <label class="participant-option">
              <input type="checkbox" name="participant" value="deepseek">
              <span class="target-name deepseek">DeepSeek</span>
            </label>
```

注意：`<span>` 上带 `deepseek` 类，这是为了让 `#summary-content .ai-name.deepseek` 等 AI 着色规则能命中同一类名（与 claude/chatgpt/gemini 的写法一致）。

- [ ] **Step 4：用 grep 验证三处都改到**

Run:
```bash
grep -c 'target-deepseek' sidepanel/panel.html && \
grep -c 'data-mention="@DeepSeek"' sidepanel/panel.html && \
grep -c 'value="deepseek"' sidepanel/panel.html
```
Expected: 三行输出都是 `1`。

---

## Task 7：panel.css 增加 DeepSeek 品牌色与 `.ai-name.deepseek` 颜色规则

**Files:**
- Modify: `sidepanel/panel.css:43-46`（`--ai-*` 变量定义区）
- Modify: `sidepanel/panel.css:1111-1113`（`#summary-content .ai-name.*` 规则区）

- [ ] **Step 1：在 `--ai-*` 变量组里加 `--ai-deepseek`**

把现有的三行：

```css
  --ai-claude: #F97316;           /* Orange */
  --ai-chatgpt: #22C55E;          /* Green */
  --ai-gemini: #3B82F6;           /* Blue */
```

改成四行：

```css
  --ai-claude: #F97316;           /* Orange */
  --ai-chatgpt: #22C55E;          /* Green */
  --ai-gemini: #3B82F6;           /* Blue */
  --ai-deepseek: #4D6BFE;         /* DeepSeek Blue */
```

- [ ] **Step 2：在 `.ai-name.*` 颜色规则区新增一行**

在 `#summary-content .ai-name.gemini { color: var(--ai-gemini); }` 这一行之后追加：

```css
#summary-content .ai-name.deepseek { color: var(--ai-deepseek); }
```

- [ ] **Step 3：grep 验证**

Run:
```bash
grep -c 'ai-deepseek' sidepanel/panel.css
```
Expected: `2`（变量定义 1 处 + 使用 1 处）。

---

## Task 8：提交 Commit B（UI 接入）

**Files:**
- Stage: `sidepanel/panel.js`, `sidepanel/panel.html`, `sidepanel/panel.css`

- [ ] **Step 1：确认工作区**

Run: `git status --short`
Expected: 恰好三行 `M sidepanel/panel.{js,html,css}`。

- [ ] **Step 2：暂存三个 UI 文件**

Run: `git add sidepanel/panel.js sidepanel/panel.html sidepanel/panel.css`

- [ ] **Step 3：提交 Commit B**

Run:

```bash
git commit -m "$(cat <<'EOF'
feat: expose DeepSeek in sidepanel UI, mentions, and discussion mode

Adds the DeepSeek target checkbox, @DeepSeek mention button, discussion
participant option, brand color (#4D6BFE), and summary-name color rule.
Updates AI_TYPES, getAITypeFromUrl, and both @mention regexes in
panel.js so DeepSeek participates in /mutual, /cross, 2-AI heuristics,
and discussion mode identically to the other three AIs.
EOF
)"
```

- [ ] **Step 4：验证 branch 状态**

Run: `git log --oneline main..HEAD`
Expected: 看到 3 行——spec 提交（已存在）+ Commit A + Commit B。

---

## Task 9：浏览器手动验收 + 选择器漂移修复

这是**人工测试阶段**，无法自动化。按验收清单逐项验证；任何失败项都在浏览器 DevTools 里拿到真实 DOM，回到 `content/deepseek.js` 调选择器，最后作为 Commit C 提交。

- [ ] **Step 1：在 Chrome 里重新加载扩展**

Chrome 菜单栏 → `chrome://extensions/` → 找到「AI 圆桌」→ 点刷新图标。

- [ ] **Step 2：刷新 DeepSeek 页面**

在已登录的 `chat.deepseek.com` 标签页按 Cmd+R。若之前没开过这个标签页，先打开并登录。

- [ ] **Step 3：打开侧边栏 → 目视确认 DeepSeek 状态点变绿**

点击扩展图标 → 目标区应看到第四项「DeepSeek」，旁边的状态点颜色与其他三项一致（表示 `TAB_STATUS_UPDATE` 已送达）。

- [ ] **Step 4：单独对 DeepSeek 发一条消息**

取消勾选前三项，只勾 DeepSeek，在输入框里输入 `你好，用一句话自我介绍`，点击「发送」。

**期望**：
- 日志出现 `Sent to deepseek`。
- DeepSeek 页面输入框被填入文本并自动发送。
- 回复稳定后 2 秒内，日志出现 `deepseek: Response captured`。

**如果失败**：
- 没发送成功 → 选择器问题在 `injectMessage` / `findSendButton`。打开 DeepSeek 页 DevTools，定位真实输入框和发送按钮的唯一选择器，回到 `content/deepseek.js` Task 3 的 `inputSelectors` / `findSendButton()` 数组**顶部**插入新选择器（不要删除旧的——保留 fallback）。
- 发送了但捕获不到回复 → `getLatestResponse()` 选择器错。在 DevTools 里对最后一条 AI 回复框 `$0 = <选中>`，尝试 `$0.closest('.ds-markdown')` 等命令确认真实 class 名，把正确选择器插入 `containerSelectors` 顶部。

- [ ] **Step 5：R1 思考块过滤验证**

在 DeepSeek 页面启用「深度思考」（R1），提问同一句话，等待完整回复。

**期望**：捕获到的内容**不包含**思考过程正文。

**验证方式**：
1. 在 sidepanel 的日志区找到最新的 `deepseek: Response captured`。
2. 进入讨论模式（临时），选 DeepSeek + 任意另一方，用同一问题启动 → 第二轮（cross-eval）里另一方收到的 `<deepseek_response>` 包裹内容应只包含正式回答。

**如果失败（捕获到了思考块文本）**：
- 在 DeepSeek 页面 DevTools 里定位思考块容器的独特 class 或属性（如 `<div class="...reasoning-content...">`）。
- 回到 `stripThinkingBlock()` 把真实 class 加进 `classMatches` 的 CSS 选择器；若是文本锚点不够稳定，把精确的 UI 文案加进 `anchors` 数组。
- 重新测试。

- [ ] **Step 6：`/mutual` 四家互评验证**

勾选四家 → 输入 `用三句话解释闭包` 发送 → 等四家都回复且都出现 `Response captured` → 清空输入框 → 点 `/mutual` 按钮 → 发送。

**期望**：四家各自收到以 `<{ai}_response>` 标签包裹的其他三家回复，并返回评价。日志出现 `[Mutual] Sending to deepseek` 和其他三家。

- [ ] **Step 7：2-AI 启发式验证**

输入 `@DeepSeek 评价一下 @Claude` → 发送。

**期望**：只有 DeepSeek 收到消息，且消息中包含 `<claude_response>` 包裹的 Claude 最新回复。日志显示 `Cross-reference: deepseek <- claude`。

- [ ] **Step 8：讨论模式跑完整流程**

切到讨论模式 → 参与者勾 DeepSeek + ChatGPT（或其他任一方）→ 输入主题 `Monolith vs Microservices` → 点「开始讨论」→ 等初始回复 → 点「下一轮」→ 等交叉评价 → 点「生成总结」→ 观察总结区两家输出。

**期望**：每步状态切换正常，DeepSeek 的总结在总结区以 `--ai-deepseek` 蓝色高亮名称显示。

- [ ] **Step 9：文件上传尝试**

在普通模式下选 DeepSeek，点回形针加一张小图，发一句 `描述这张图`。

**期望（支持上传时）**：日志出现 `deepseek: 文件上传成功`，图片在 DeepSeek 页面进入输入区，随后消息发送。

**期望（不支持时）**：日志出现 `deepseek: 文件上传失败 - Could not find DeepSeek file input or drop zone`（或类似），不崩溃，其他功能依然可用——记录为 known-limit，本次不修。

- [ ] **Step 10：如有修复，提交 Commit C**

只在 Step 4/5 有任何选择器修改时才执行。否则跳过本步。

```bash
git add content/deepseek.js
git commit -m "$(cat <<'EOF'
fix(deepseek): tune DOM selectors against live chat.deepseek.com

Replaces initial guess selectors with verified values observed in the
production DeepSeek UI for: <input-field | send-button | response
container | R1 thinking-block> (edit this list to match what changed).
EOF
)"
```

- [ ] **Step 11：最终 branch 状态**

Run: `git log --oneline main..HEAD`
Expected: 3 或 4 个 commit（spec + Commit A + Commit B，以及可选的 Commit C）。

---

## 完成判据

- [ ] Task 1~8 全部打勾并各自完成了对应 commit。
- [ ] Task 9 里的验收清单 Step 3~8 全部通过（Step 9 可视为 known-limit 不阻塞）。
- [ ] `git log --oneline main..HEAD` 显示 3~4 个 commit。
- [ ] 工作区 clean（`git status` 无未提交项）。

---

## 故障排查提示

- **DeepSeek 页面没变绿** → content script 没注入。检查 `manifest.json` 的 `content_scripts.matches` 模式是否精确（注意尾斜杠）；重启扩展；查看 DevTools Console 是否有 `[AI Panel] DeepSeek content script loaded`。
- **Sent 但没捕获** → 回复稳定判定失败或选择器错。打开 DeepSeek 页面 DevTools Console 观察是否有 `DeepSeek capturing response, length: ...`。没有的话说明 `getLatestResponse()` 返回 `null`。
- **捕获但 `/mutual` 跳过 DeepSeek** → 大概率 `AI_TYPES` 或 `mentionPattern` 没改全。重跑 Task 5 Step 4 的 grep 自查。
- **讨论模式总结里 DeepSeek 名称不带颜色** → `panel.css` 的 `.ai-name.deepseek` 规则没加。跑 Task 7 Step 3 的 grep。
