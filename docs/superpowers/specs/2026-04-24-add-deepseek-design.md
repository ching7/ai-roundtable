# Add DeepSeek as a fourth roundtable participant

**Date**: 2026-04-24
**Branch**: `feature/add-deepseek`
**Status**: Approved by user, pending implementation plan.

## Goal

Add DeepSeek (chat.deepseek.com) as a first-class participant in the AI Roundtable extension, with full functional parity to Claude and ChatGPT: message injection, streaming response capture, and file upload.

## Non-goals

- Not extending discussion mode beyond its current 2-participant limit.
- Not building a custom R1-specific UX surface — thinking-block handling is purely a capture-side filter.
- Not adding any tooling, build step, or test harness. This project remains a vanilla Manifest V3 extension loaded unpacked.
- Not adding a fallback API path. The whole extension is intentionally UI-only (see README "Why this does NOT use APIs").

## Identifier and display name

- Lowercase string identifier: `deepseek` (joins the existing `claude`, `chatgpt`, `gemini`).
- Display name: `DeepSeek`.
- UI ordering: appended after Gemini. Default sort across all lists becomes `claude, chatgpt, gemini, deepseek`.
- Discussion-mode participant: yes, selectable like the other three. The hard "exactly 2 participants" validation stays.

## Content script derivation (decision C)

`content/deepseek.js` is a new file derived as follows:

- **Skeleton from `content/chatgpt.js`** — same `injectMessage` → `findSendButton` → `waitForStreamingComplete` → `getLatestResponse` shape; same safe-send pattern, same context-validity guards, same MutationObserver bootstrap.
- **Thinking-block filter adapted from `content/claude.js`** — the idea of walking up to the response container and skipping a "thought process" subtree is reused, but the anchors are DeepSeek-specific (see below).

Rationale: ChatGPT's DOM model (contenteditable input, streaming markdown container, stop button) is the closest match for DeepSeek's SPA. Claude's filter logic is the only existing precedent for hiding a reasoning block from downstream captures.

## File changes

### New: `content/deepseek.js`

- `AI_TYPE = 'deepseek'`.
- Input-field selectors, in priority order:
  1. `textarea[placeholder*="DeepSeek" i]`
  2. `textarea#chat-input`
  3. `div[contenteditable="true"]`
- Send-button selectors, in priority order:
  1. `button[aria-label*="Send" i]`
  2. Button containing a send-shaped SVG
  3. Heuristic last-resort: bottom-right visible button containing an SVG (same pattern as `claude.js`).
- `getLatestResponse` selectors, in priority order:
  1. `.ds-markdown`
  2. `[class*="message-content"]`
  3. `.markdown`
  Take the last matching node.
- R1 thinking-block filter:
  - Anchor heuristic: a sibling/ancestor node whose text starts with or contains `已深度思考用时`, `Thought for`, or `Thinking...`, or an element with a class or attribute containing `reasoning` or `thinking`.
  - If such a node is found, skip it; take the next sibling markdown container as the answer body.
  - **Degradation rule**: if the filter cannot locate a clean answer body but a full text node exists, return the full text rather than `null`. Dropping a response entirely is worse than including reasoning verbatim.
- `waitForStreamingComplete`:
  - 500 ms poll, 4 consecutive stable samples, max wait 10 minutes — same constants as the other scripts.
  - `isStreaming` detection tries, in order: `button[aria-label*="Stop" i]`, `[data-streaming="true"]`, `[class*="loading"]`. If none found, falls through to pure content-stability detection (the fallback is intentionally robust — losing the streaming signal just adds ~2 s of waiting).
- `injectFiles`: attempt `input[type=file]` + DataTransfer first, drop-zone DragEvent fallback second. If both fail, throw a clear error. No preemptive "unsupported" short-circuit — mirrors Claude/ChatGPT, not Gemini.

### `manifest.json`

- Append `"https://chat.deepseek.com/*"` to `host_permissions`.
- Append a new `content_scripts` entry: `matches: ["https://chat.deepseek.com/*"]`, `js: ["content/deepseek.js"]`, `run_at: "document_idle"`.

### `background.js`

- `AI_URL_PATTERNS.deepseek = ['chat.deepseek.com']`.
- `getStoredResponses` initial object gains a `deepseek: null` key.

### `sidepanel/panel.js`

- `AI_TYPES` array: append `'deepseek'`.
- `getAITypeFromUrl`: add `if (url.includes('chat.deepseek.com')) return 'deepseek';`.
- `@mention` regexes: update `@(claude|chatgpt|gemini)` to `@(claude|chatgpt|gemini|deepseek)` — two occurrences in `parseMessage` (the `/cross` branch `mentionPattern` at ~line 276 and the outer `mentionPattern` at ~line 306). The 2-AI heuristic consumes the `matches` produced by the outer regex, so it picks up the new AI automatically.
- The `evalKeywords` regex in the 2-AI heuristic is content-based (评价 / 借鉴 / evaluate / …) and is not AI-name-bound — no change.
- `CROSS_REF_ACTIONS` is AI-agnostic — no change.

### `sidepanel/panel.html`

- Normal-mode `.targets` block: append a `<label>` with `target-deepseek` checkbox (default `checked`) and `status-deepseek` dot.
- Toolbar `.mentions` group: append `<button class="mention-btn" data-mention="@DeepSeek">@DeepSeek</button>`.
- Discussion-mode participants group: append `<input type="checkbox" name="participant" value="deepseek">DeepSeek`.

### `sidepanel/panel.css`

- Add `.ai-name.deepseek` with brand color `#4D6BFE`.
- If status dots or target labels have per-AI class variants, add matching `.deepseek` variants; if rendering is class-agnostic, nothing to add.

## Risks

1. **DOM selector drift** — near-certain that 1–2 selectors need post-install tuning. Mitigation: every selector lookup uses a fallback chain ending in a heuristic, and failure paths throw identifiable error strings (`Could not find DeepSeek input field`, etc.) for fast user-reported triage.
2. **R1 thinking-block DOM unverified** — the filter initially relies on UI-text anchors (`已深度思考用时`), which are less stable than class-based anchors. Mitigation: graceful degradation to full-text capture rather than `null`.
3. **Streaming-end detection** — DeepSeek's stop-button / streaming attribute names are unknown. Mitigation: content-stability polling is self-sufficient; losing the streaming signal only costs ~2 s.
4. **File upload may be unsupported** — per Gemini precedent, unsupported upload is a known-limit, not a blocker. No preemptive short-circuit; failures surface as clean errors.

## Acceptance checklist (manual browser test)

- [ ] After extension reload, the `chat.deepseek.com` tab's status dot turns green.
- [ ] Selecting only DeepSeek in the sidebar and sending a message → DeepSeek page receives it and replies.
- [ ] After DeepSeek's reply stabilizes, the log shows `deepseek: Response captured`.
- [ ] All four selected, send a question, then `/mutual` → DeepSeek receives the other three AIs' replies wrapped in `<xxx_response>` tags and answers.
- [ ] `@DeepSeek 评价一下 @Claude` works (2-AI heuristic: claude as source, deepseek as target).
- [ ] Discussion mode: DeepSeek + one other, full run through initial → cross-eval → summary.
- [ ] With R1 enabled, captured reply does **not** contain the thinking-process body. If filter fails, the full text (reasoning + answer) is captured instead of nothing — logged as a known-limit.
- [ ] File upload: succeeds if supported; if unsupported, surfaces a clear error without crashing.

## Commit strategy

Commits land on the `feature/add-deepseek` branch:

1. Spec document (`docs/superpowers/specs/2026-04-24-add-deepseek-design.md`).
2. Core integration: `manifest.json` + `background.js` + `content/deepseek.js`.
3. Sidepanel UI: `panel.html` + `panel.css` + `panel.js`.

Split by review-surface: commit 2 is reviewed against "does this correctly wire a new AI into the cross-process message pipeline and DOM automation"; commit 3 is reviewed against "does the UI expose this AI consistently with the others".
