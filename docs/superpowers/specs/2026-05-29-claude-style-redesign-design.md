# AI 圆桌侧边栏 → Claude 风格改造

**日期**: 2026-05-29
**范围**: 仅 `sidepanel/panel.html`、`sidepanel/panel.css`、`sidepanel/panel.js`。
**不改动**: `background.js`、`content/*.js`、`manifest.json`。所有 `chrome.runtime.sendMessage` 消息流(`SEND_MESSAGE` / `SEND_FILES` / `GET_RESPONSE` / `RESPONSE_CAPTURED` / `TAB_STATUS_UPDATE`)与底层处理函数(`sendToAI` / `handleMutualReview` / `handleCrossReference` / 讨论状态机)保持不变。

## 目标

1. **视觉**:深色玻璃拟态科技风 → Claude 浅色暖调。
2. **交互**:工具栏按钮(`/mutual` `/cross` `←` `@提及`)+ 顶部模式标签页 → 单一 Claude 式输入卡片 + 底部栏内联下拉。
3. 去掉 `© AXTONLIU™ & AI 精英学院™` 页脚。

## 1. 视觉设计令牌(Design Tokens)

| 用途 | 旧值 | 新值 |
|------|------|------|
| 页面背景 | `#0F172A` | `#faf9f5`(暖米色) |
| 卡片背景 | 玻璃半透明 | `#ffffff` |
| 升起背景/hover | slate | `#f0eee6` / `#ebe9e0` |
| 主色(accent) | `#0EA5E9` | `#d97757`(Claude 珊瑚) |
| 主色 hover | — | `#c25f43` |
| 正文文字 | `#CBD5E1` | `#3d3d3a` |
| 主标题文字 | `#F8FAFC` | `#1f1e1d` |
| 次要文字 | `#94A3B8` | `#6b6a65` |
| 更淡文字 | — | `#91918d` |
| 边框 | 发光 glow | `#e8e6dd` / `rgba(0,0,0,0.08)` |
| 阴影 | glow | `0 1px 2px rgba(0,0,0,.05)`、`0 4px 16px rgba(0,0,0,.08)` |
| AI 品牌色 | 保留 | Claude `#d97757`、ChatGPT `#10a37f`、Gemini `#4285f4`、DeepSeek `#4D6BFE`(用作下拉小圆点) |

- **字体**:衬线 `Lora`(Google Fonts)+ Georgia 兜底,用于 wordmark 与问候语;正文用系统无衬线栈(`-apple-system, "Segoe UI", system-ui, sans-serif`);日志时间戳用系统等宽栈(`ui-monospace, SFMono-Regular, monospace`)。移除 IBM Plex / JetBrains 远程依赖,只保留 Lora。
- **圆角**:输入卡片 `20px`,下拉/按钮 `10px`,圆形发送键 `50%`。
- 移除所有 glow 阴影、`backdrop-filter` 玻璃模糊、`prefers-reduced-motion` 保留。

## 2. 布局结构(HTML)

```
.app
 ├─ header          ✳(衬线)AI 圆桌
 ├─ .greeting       「有什么可以帮你的?」(衬线,大字)
 ├─ .composer (卡片)
 │   ├─ textarea#message-input
 │   ├─ .composer-bar
 │   │   ├─ #add-file-btn (＋)
 │   │   ├─ .dropdown#dd-target  对象 ▾   (多选)
 │   │   ├─ .dropdown#dd-mode    模式 ▾   (单选)
 │   │   ├─ .dropdown#dd-action  动作 ▾   (单选,条件显示)
 │   │   └─ #send-btn (➤ 珊瑚圆键)
 │   └─ #file-list  (文件 chips)
 ├─ #cross-row      交叉引用专用:让 [对象] 评价 [来源 ▾]  (条件显示)
 ├─ #discussion-panel  讨论控制面板 (条件显示,默认隐藏)
 │   ├─ 轮次徽章 + 参与者徽章 + 结束
 │   ├─ 状态行
 │   ├─ 插话输入 + 发送给双方
 │   └─ 下一轮 / 生成总结
 ├─ #discussion-summary  讨论总结 (条件显示)
 ├─ details.help    ⓘ 用法 (折叠,精简)
 └─ section.log     活动日志
```

顶部 `.mode-switcher` 标签页、`.targets` checkbox 区、原 `.toolbar`、`.action-bar`、`.copyright` 全部移除。讨论的 setup 区(参与者勾选 + 主题输入)被并入主输入卡:模式选「讨论」时,对象下拉限选 2 个,输入框即主题。

## 3. 下拉组件(自定义,vanilla JS)

原生 `<select>` 无法做"带品牌圆点的多选弹层",故实现一个轻量下拉控制器:

- 结构:`.dropdown > button.dropdown-trigger + .dropdown-menu`。
- `data-type="multi"`(对象)或 `"single"`(模式/动作/来源)。
- 点击 trigger 开合;点击外部关闭;`Esc` 关闭;键盘可达(`button` 元素 + `aria-expanded`)。
- 选项:多选用 checkbox 行 + 品牌圆点;单选点选即关闭并更新 trigger 文本。
- 状态读取:`dd-target` 暴露 `getSelected() → ['claude',...]`;其余暴露当前 value。

## 4. 模式联动(panel.js `handleSend` 路由)

读取 `#dd-mode` 当前值:

- **普通发送**:`targets = dd-target.getSelected()`。**保留 `parseMessage`**——若用户手打 `@Claude`、`/mutual`、`/cross`,仍按原逻辑解析(老用法不丢);否则发给选中对象。
- **互评**:`targets = dd-target.getSelected()`(需 ≥2,否则日志报错并中止);走 `handleMutualReview(targets, prompt)`,`prompt` = 输入框文字 || 动作下拉对应的 `CROSS_REF_ACTIONS[...].prompt` || 默认互评提示。
- **交叉引用**:显示 `#cross-row`;`targetAIs = dd-target.getSelected()`、`sourceAIs = [dd-source.value]`;`originalMessage` = 输入框文字 + 动作词;构造 `parsed` 对象走 `handleCrossReference(parsed)`。
- **讨论**:对象限 2;输入框文字作 topic;发送即 `startDiscussion()`(复用现有函数,参与者取自对象下拉);展开 `#discussion-panel`。讨论进行中 `#dd-mode` 锁定为讨论,直到结束/新讨论。

`动作 ▾` 仅在 互评 / 交叉引用 时显示;`#cross-row` 仅交叉引用时显示;`#discussion-panel` 仅讨论激活时显示。模式切换通过一个 `applyMode(mode)` 函数统一控制各区显隐与占位符文案。

## 5. 保留的行为(回归清单)

- 文件上传(`＋` → `selectedFiles` → `SEND_FILES`)。
- Enter 发送 / Shift+Enter 换行 / IME 合成时不发送。
- `TAB_STATUS_UPDATE` 连接指示:品牌圆点在对象下拉中显示在线/离线态。
- `RESPONSE_CAPTURED` 驱动讨论 `pendingResponses`、`handleDiscussionResponse`、`onRoundComplete`、`generateSummary`、`showSummary`。
- 插话 `handleInterject`、下一轮 `nextRound`、结束 `endDiscussion`/`resetDiscussion`。
- 活动日志 `log()`,保留最近 50 条。

## 6. 验收标准

1. 侧边栏在 ~300–420px 宽下不溢出、不错位。
2. 四种模式都能正确路由到对应底层函数,日志输出与改造前一致。
3. 讨论模式完整跑通:开始 → 下一轮 → 插话 → 生成总结 → 新讨论。
4. 所有 `getElementById` 引用的元素都存在;无指向已删除元素的悬空引用。
5. 文件上传、Enter 发送、连接指示、键盘可达性正常。
6. 页脚版权已移除;通篇为 Claude 浅色风,无残留深色 glow 样式。
