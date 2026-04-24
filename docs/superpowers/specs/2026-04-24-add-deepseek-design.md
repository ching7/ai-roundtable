# 新增 DeepSeek 作为第四位圆桌参与者

**日期**：2026-04-24
**分支**：`feature/add-deepseek`
**状态**：用户已确认设计，等待生成实施计划。

## 目标

将 DeepSeek（chat.deepseek.com）作为一等参与者接入 AI 圆桌扩展，与 Claude、ChatGPT 在功能上**完全对等**：消息注入、流式响应捕获、文件上传。

## 非目标

- 不扩展讨论模式的 2 人上限。
- 不为 R1 单独建自定义 UX 面板——思考块处理纯粹是捕获端的过滤逻辑。
- 不引入任何构建工具、打包链或测试框架。本项目保持为以「已解压扩展」方式加载的纯 Manifest V3 扩展。
- 不增加 API 回退路径。整个扩展刻意只走网页端（见 README「Why this does NOT use APIs」）。

## 标识符与显示名

- 小写字符串标识符：`deepseek`（与既有的 `claude`、`chatgpt`、`gemini` 并列）。
- 显示名：`DeepSeek`。
- UI 排序：追加在 Gemini 之后。默认顺序在所有列表中统一为 `claude, chatgpt, gemini, deepseek`。
- 讨论模式参与者：可选，与其他三方一致。**「恰好 2 位参与者」的硬性校验保持不变**。

## content script 派生策略（已确认方案 C）

新建 `content/deepseek.js`，派生规则如下：

- **骨架派生自 `content/chatgpt.js`**——相同的 `injectMessage` → `findSendButton` → `waitForStreamingComplete` → `getLatestResponse` 流程；相同的 safe-send 模式；相同的 context 有效性保护；相同的 MutationObserver 启动方式。
- **思考块过滤思路派生自 `content/claude.js`**——「在响应容器内识别并跳过『思考过程』子树」这一思路复用，但锚点改为 DeepSeek 专用（见下）。

选型理由：ChatGPT 的 DOM 模型（contenteditable 输入框、流式 markdown 容器、停止按钮）与 DeepSeek SPA 最接近。Claude 是现有代码里唯一已实现「把推理过程从下游捕获中隐藏」的先例。

## 文件改动清单

### 新增：`content/deepseek.js`

- `AI_TYPE = 'deepseek'`。
- 输入框选择器，按优先级：
  1. `textarea[placeholder*="DeepSeek" i]`
  2. `textarea#chat-input`
  3. `div[contenteditable="true"]`
- 发送按钮选择器，按优先级：
  1. `button[aria-label*="Send" i]`
  2. 含发送图标 SVG 的 button
  3. 启发式兜底：右下可视区、含 SVG 的按钮（与 `claude.js` 同模式）。
- `getLatestResponse` 选择器，按优先级：
  1. `.ds-markdown`
  2. `[class*="message-content"]`
  3. `.markdown`
  取最后一个匹配节点。
- R1 思考块过滤：
  - 锚点启发式：同级或上溯祖先中存在文本以 `已深度思考用时`、`Thought for`、`Thinking...` 开头或包含这些串的节点；或 class/属性中含 `reasoning`、`thinking` 的元素。
  - 找到后跳过该子树，取其下一个同级 markdown 容器作为正式回答。
  - **降级规则**：若过滤器无法定位干净的回答体但整段文本存在，则返回完整文本而非 `null`。完全丢失响应比包含推理过程更糟糕。
- `waitForStreamingComplete`：
  - 500 ms 轮询、4 次连续稳定判定、最长 10 分钟——常量与其他脚本一致。
  - `isStreaming` 判定依次尝试：`button[aria-label*="Stop" i]`、`[data-streaming="true"]`、`[class*="loading"]`。若全部未命中，则退化为纯「内容稳定」判定（这条降级路径本身是健壮的——流式信号失效仅额外等待约 2 秒）。
- `injectFiles`：先尝试 `input[type=file]` + DataTransfer，失败后回退 drop-zone 的 DragEvent。两者都失败则抛清晰错误。**不做事前的「不支持」短路**——对齐 Claude/ChatGPT，而非 Gemini。

### `manifest.json`

- `host_permissions` 追加 `"https://chat.deepseek.com/*"`。
- `content_scripts` 追加一条：`matches: ["https://chat.deepseek.com/*"]`、`js: ["content/deepseek.js"]`、`run_at: "document_idle"`。

### `background.js`

- `AI_URL_PATTERNS.deepseek = ['chat.deepseek.com']`。
- `getStoredResponses` 初始对象增加 `deepseek: null` 键。

### `sidepanel/panel.js`

- `AI_TYPES` 数组末尾追加 `'deepseek'`。
- `getAITypeFromUrl` 增加 `if (url.includes('chat.deepseek.com')) return 'deepseek';`。
- `@mention` 正则：将 `@(claude|chatgpt|gemini)` 改为 `@(claude|chatgpt|gemini|deepseek)`——在 `parseMessage` 中共 2 处（约第 276 行 `/cross` 分支内的 `mentionPattern`，以及约第 306 行外层的 `mentionPattern`）。2-AI 启发式消费的是外层正则匹配出的 `matches`，因此会自动识别新增 AI。
- 2-AI 启发式里的 `evalKeywords` 正则是基于内容关键词的（评价 / 借鉴 / evaluate / …），与 AI 名称无关——无需改动。
- `CROSS_REF_ACTIONS` 与 AI 无关——无需改动。

### `sidepanel/panel.html`

- 普通模式 `.targets` 区块追加 `<label>`：`target-deepseek` checkbox（默认 `checked`）+ `status-deepseek` 状态点。
- 工具栏 `.mentions` 组追加 `<button class="mention-btn" data-mention="@DeepSeek">@DeepSeek</button>`。
- 讨论模式参与者选择组追加 `<input type="checkbox" name="participant" value="deepseek">DeepSeek`。

### `sidepanel/panel.css`

- 增加 `.ai-name.deepseek`，品牌色 `#4D6BFE`。
- 若状态点、target 标签按 AI 类名分派样式，则对应补齐 `.deepseek` 变体；若为通用样式则无需新增。

## 风险

1. **DOM 选择器漂移**——几乎可以确定初版会有 1~2 个选择器需要事后调整。缓解：每个选择器查找都用「fallback 链 + 启发式兜底」模式，失败时抛可辨识错误字符串（如 `Could not find DeepSeek input field`），便于用户反馈快速定位。
2. **R1 思考块 DOM 未经实地验证**——过滤器初版依赖 UI 文本锚点（`已深度思考用时`），稳定性低于 Claude 的 class-based 过滤。缓解：优雅降级为整段文本捕获，而不是返回 `null`。
3. **流式结束判定**——DeepSeek 的停止按钮 / 流式属性名未知。缓解：「内容稳定」轮询本身自足；流式信号缺失仅额外等待约 2 秒。
4. **文件上传可能不支持**——按 Gemini 先例，不支持属于 known-limit，不视为阻断缺陷。不做事前短路；失败以清晰错误呈现。

## 验收清单（浏览器内手动测试）

- [ ] 扩展重新加载后，`chat.deepseek.com` 标签页的状态点变绿。
- [ ] 仅勾选 DeepSeek 发送一条消息 → DeepSeek 页面收到并正常回复。
- [ ] DeepSeek 回复稳定后，日志出现 `deepseek: Response captured`。
- [ ] 四家全选发一条问题，随后 `/mutual` → DeepSeek 收到其他三家回复以 `<xxx_response>` 标签包裹，并给出评价。
- [ ] `@DeepSeek 评价一下 @Claude` 生效（2-AI 启发式：claude 作为源、deepseek 作为目标）。
- [ ] 讨论模式选择 DeepSeek + 任一其他 AI，完整跑一轮 initial → cross-eval → summary。
- [ ] 启用 R1 时，捕获到的回复**不包含**思考过程正文。若过滤失败，则捕获整段文本（推理 + 回答），而非完全丢失响应——视为 known-limit 记录。
- [ ] 文件上传：支持则成功；不支持则抛出清晰错误，不崩溃。

## 提交策略

commit 均提交到 `feature/add-deepseek` 分支：

1. 设计文档（`docs/superpowers/specs/2026-04-24-add-deepseek-design.md`）。
2. 核心接入：`manifest.json` + `background.js` + `content/deepseek.js`。
3. 侧边栏 UI：`panel.html` + `panel.css` + `panel.js`。

按 review 视角拆分：commit 2 的审阅聚焦「是否正确地把新 AI 接入跨进程消息管道与 DOM 自动化」；commit 3 的审阅聚焦「UI 是否与其他 AI 一致地暴露了新成员」。
