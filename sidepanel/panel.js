// AI Panel - Side Panel Controller (Claude-style UI)

const AI_TYPES = ['claude', 'chatgpt', 'gemini', 'deepseek'];

// AI brand metadata (display name + dropdown dot color)
const AI_META = {
  claude:   { name: 'Claude',   color: 'var(--ai-claude)' },
  chatgpt:  { name: 'ChatGPT',  color: 'var(--ai-chatgpt)' },
  gemini:   { name: 'Gemini',   color: 'var(--ai-gemini)' },
  deepseek: { name: 'DeepSeek', color: 'var(--ai-deepseek)' }
};

// Cross-reference action keywords (used as default prompt in 互评 / 交叉引用)
const CROSS_REF_ACTIONS = {
  evaluate: { prompt: '评价一下' },
  learn: { prompt: '有什么值得借鉴的' },
  critique: { prompt: '批评一下，指出问题' },
  supplement: { prompt: '有什么遗漏需要补充' },
  compare: { prompt: '对比一下你的观点' }
};

// Top-level roundtable kind (peers); the AI-roundtable sub-modes live under 'ai'.
const KIND_OPTIONS = [
  { value: 'ai', label: 'AI 圆桌' },
  { value: 'role', label: '角色圆桌' }
];

// AI 圆桌 sub-modes (玩法)
const MODE_OPTIONS = [
  { value: 'normal', label: '普通发送' },
  { value: 'mutual', label: '互评' },
  { value: 'cross', label: '交叉引用' },
  { value: 'discussion', label: '讨论' },
  { value: 'summary', label: '总结' }
];

// ===== Role roundtable (single AI plays multiple built-in roles) =====
// Default-selected: the first 3 (批判 / 系统 / 落地).
const ROLE_PRESETS = [
  { id: 'critic', name: '批判性思考者', tagline: '挑刺·找漏洞与隐藏假设', color: '#22c55e',
    persona: '你是批判性思考者(挑刺的人)，专门寻找漏洞、反例与隐藏假设。你不为反对而反对，而是用追问让论点更严谨——例如"降低的是哪部分成本""有没有算迁移成本""流量大幅波动时还成立吗"。' },
  { id: 'architect', name: '系统设计者', tagline: '结构化·模块化', color: '#14b8a6',
    persona: '你是系统设计者(架构师)，擅长把一个观点拆解成一个系统。你关注模块划分、组件边界与整体布局，把笼统的想法结构化为清晰的模块、流程与兜底机制。' },
  { id: 'builder', name: '落地执行者', tagline: '能不能做·怎么做', color: '#3b82f6',
    persona: '你是落地执行者(工程实现派)，只关心现实约束与可实现性：多久能做出来、数据从哪来、延迟和成本能否达标。你拒绝空想，聚焦能不能落地、具体怎么做。' },
  { id: 'analyst', name: '数据分析师', tagline: '用证据与数据说话', color: '#6366f1',
    persona: '你是数据分析师(证据派)，只相信证据与数据。你会追问是否有 A/B 测试、历史数据是否支持、是否存在统计偏差或幸存者偏差，反对凭感觉下结论。' },
  { id: 'pm', name: '产品经理', tagline: '用户价值视角', color: '#ec4899',
    persona: '你是产品经理(用户代言人)，把一切拉回用户价值：用户是否真的需要、痛点是否被高估、用户是否愿意为此付费。你始终代表真实用户的需求与体验。' },
  { id: 'risk', name: '风险控制者', tagline: '最坏情况·反脆弱', color: '#ef4444',
    persona: '你是风险控制者(反脆弱角色)，专门设想最坏情况：模型输出错误怎么办、数据泄露与合规风险、系统崩溃由谁负责。你为方案做风险审视与兜底设计。' },
  { id: 'innovator', name: '创新发散者', tagline: '脑洞·非主流方案', color: '#8b5cf6',
    persona: '你是创新发散者(脑洞角色)，提出非主流、反直觉的方案：能不能不用常规组件、能不能反过来设计、有没有完全不同的路径。你负责打开可能性空间。' },
  { id: 'historian', name: '历史对照者', tagline: '经验复盘·案例对照', color: '#f59e0b',
    persona: '你是历史对照者(经验复盘者)，用过去的案例对照当前问题：这像不像早期某类产品的演进、与以往的推荐/搜索系统有何相似、过去失败的同类项目是怎么挂的。你用历史经验提供参照与教训。' }
];

const ROLE_STYLES = [
  { value: 'debate', label: '辩论风格(各执一词)', instruction: '请坚持你的立场，针对其他角色的观点提出反驳和不同见解，明确指出他们的不足或盲点。' },
  { value: 'roundtable', label: '圆桌讨论(互相补充)', instruction: '请在他人观点的基础上做补充与完善，指出可以结合之处，推动讨论走向共识与更完整的方案。' },
  { value: 'qa', label: '问答风格(互相追问)', instruction: '请针对其他角色的观点提出有针对性的追问与质疑，促使其澄清前提、补全论据或暴露问题。' }
];

const ROLE_ROUNDS = [
  { value: '1', label: '每人发言 1 轮' },
  { value: '2', label: '每人发言 2 轮' },
  { value: '3', label: '每人发言 3 轮' }
];

const ROLE_TURN_TIMEOUT_MS = 10 * 60 * 1000; // per-turn capture wait, matches content-script max

const ACTION_OPTIONS = [
  { value: '', label: '动作(可选)' },
  { value: 'evaluate', label: '评价' },
  { value: 'learn', label: '借鉴' },
  { value: 'critique', label: '批评' },
  { value: 'supplement', label: '补充' },
  { value: 'compare', label: '对比' }
];

const MODE_PLACEHOLDERS = {
  normal: '输入消息…（可用 @Claude、/mutual 等命令）',
  mutual: '互评提示（可留空，默认让各方互相评价）…',
  cross: '附加提示（可留空）…',
  discussion: '输入讨论主题…（需在“对象”中选择 2 位参与者）',
  summary: '总结模式：在「对象」中选择参与者，第一个作为总结者；点发送生成总结',
  role: '输入讨论话题…例如：微服务拆分的最佳实践'
};

const SEND_TITLES = {
  normal: '发送',
  mutual: '发送互评',
  cross: '发送交叉引用',
  discussion: '开始讨论',
  summary: '总结',
  role: '开始圆桌讨论'
};

// DOM Elements
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const logContainer = document.getElementById('log-container');
const crossRow = document.getElementById('cross-row');
const discussionPanel = document.getElementById('discussion-panel');
const discussionSummary = document.getElementById('discussion-summary');
const roleActive = document.getElementById('role-active');
const roleSummaryPanel = document.getElementById('role-summary');
const startRoleBtn = document.getElementById('start-role-btn');
const roleControls = document.getElementById('role-controls');
const aiSummaryPanel = document.getElementById('ai-summary');

// Dropdown controllers (assigned in setupDropdowns)
let ddTarget = null;
let ddKind = null;   // top-level: AI 圆桌 / 角色圆桌
let ddMode = null;   // AI 圆桌 sub-mode (玩法)
let ddAction = null;
let ddSource = null;
let ddRoles = null;       // 嘉宾 (role multi-select)
let ddRoleStyle = null;   // 讨论模式
let ddRoleRounds = null;  // 发言轮次

// Discussion Mode State
let discussionState = {
  active: false,
  topic: '',
  participants: [],  // [ai1, ai2]
  currentRound: 0,
  history: [],  // [{round, ai, type, content}]
  pendingResponses: new Set(),
  roundType: null,  // 'initial' | 'cross-eval' | 'summary'
  summaryTimer: null  // setInterval handle for generateSummary polling
};

// Role Roundtable State
let roleState = {
  active: false,
  ai: null,            // the AI tab that plays all roles
  topic: '',
  style: 'roundtable',
  totalRounds: 2,
  roles: [],           // selected role ids, in ROLE_PRESETS order
  currentRound: 0,
  turnQueue: [],       // role ids still to speak this round
  awaitingRole: null,  // role whose response we're waiting to capture
  history: [],         // [{round, role, content}]
  turnTimer: null,     // per-turn capture timeout
  summaryTimer: null   // summary capture timeout
};

// AI 圆桌 Summary State (single designated AI summarizes the roundtable)
let summaryState = {
  awaiting: false,  // summary prompt sent, waiting for capture
  ai: null,         // the AI designated to summarize
  turns: [],        // [{label, content}] gathered transcript, reused at render time
  timer: null       // capture timeout handle
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupMessageListener();
  setupDropdowns();
  refreshConnections();
  setupComposer();
  setupDiscussionControls();
  setupRoleRoundtable();
  setupSummaryControls();
  applyMode();
});

// Mode/state-aware composer action area:
// 'ai' → send button · 'role-setup' → 开始 · 'role-active' → 下一轮/总结/结束 · 'role-summary' → none
function setComposerAction(state) {
  sendBtn.classList.toggle('hidden', state !== 'ai');
  startRoleBtn.classList.toggle('hidden', state !== 'role-setup');
  roleControls.classList.toggle('hidden', state !== 'role-active');
}

// ============================================
// Dropdown Component
// ============================================

const dropdownRegistry = [];

function closeAllDropdowns(exceptRoot) {
  dropdownRegistry.forEach(api => {
    if (api.el !== exceptRoot) api.close();
  });
}

function createDropdown(root, { type, options, defaultSelected, defaultValue, onChange, connectionAware, onOpen }) {
  const trigger = root.querySelector('.dropdown-trigger');
  const menu = root.querySelector('.dropdown-menu');
  const labelEl = trigger.querySelector('.dropdown-label');

  const selected = new Set(type === 'multi' ? (defaultSelected || []) : []);
  let value = type === 'single' ? (defaultValue ?? (options[0] && options[0].value)) : null;
  let disabled = false;
  let forceSingle = false; // when true, a 'multi' dropdown behaves as single-select
  // Connection-aware dropdowns: which option values are currently reachable.
  // Start optimistic (all) so the first paint isn't all-grey before the first re-check.
  let connectedSet = new Set(options.map(o => o.value));

  function isConnected(v) {
    return !connectionAware || connectedSet.has(v);
  }

  function getSelected() {
    return options.map(o => o.value).filter(v => selected.has(v));
  }

  function updateLabel() {
    if (type === 'multi') {
      const arr = getSelected();
      if (arr.length === 0) {
        labelEl.textContent = '未选';
      } else if (arr.length === options.length) {
        labelEl.textContent = '全部';
      } else {
        const first = options.find(o => o.value === arr[0]);
        labelEl.textContent = arr.length === 1 ? first.label : `${first.label} +${arr.length - 1}`;
      }
    } else {
      const opt = options.find(o => o.value === value);
      labelEl.textContent = opt ? opt.label : '';
    }
  }

  function renderMenu() {
    menu.innerHTML = '';
    options.forEach(opt => {
      const connected = isConnected(opt.value);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'dropdown-item' + (connected ? '' : ' disabled-option');
      item.setAttribute('role', 'menuitem');
      item.dataset.value = opt.value;
      if (opt.tagline) item.title = opt.tagline; // hover hint (e.g. role focus)
      if (!connected) {
        item.setAttribute('aria-disabled', 'true');
        item.tabIndex = -1; // skip non-actionable rows in keyboard tab order
      }

      let inner = '';
      if (opt.color) {
        inner += `<span class="brand-dot" data-ai="${opt.value}" style="--dot:${opt.color}"></span>`;
      }
      inner += `<span class="item-label"></span>`;
      if (connectionAware) inner += `<span class="item-status"></span>`;
      if (type === 'multi') inner += `<span class="check">✓</span>`;
      item.innerHTML = inner;
      item.querySelector('.item-label').textContent = opt.label;
      if (connectionAware) {
        const st = item.querySelector('.item-status');
        st.textContent = connected ? '在线' : '未连接';
        st.classList.toggle('online', connected);
      }

      const isSel = type === 'multi' ? selected.has(opt.value) : value === opt.value;
      item.classList.toggle('selected', isSel);

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (connectionAware && !connected) return; // a disconnected AI can't be selected
        if (type === 'multi') {
          if (forceSingle) {
            selected.clear();
            selected.add(opt.value);
            menu.querySelectorAll('.dropdown-item').forEach(i =>
              i.classList.toggle('selected', i.dataset.value === opt.value)
            );
            updateLabel();
            close();
          } else {
            if (selected.has(opt.value)) selected.delete(opt.value);
            else selected.add(opt.value);
            item.classList.toggle('selected');
            updateLabel();
          }
          if (onChange) onChange(getSelected());
        } else {
          value = opt.value;
          menu.querySelectorAll('.dropdown-item').forEach(i =>
            i.classList.toggle('selected', i.dataset.value === value)
          );
          updateLabel();
          close();
          if (onChange) onChange(value);
        }
      });

      menu.appendChild(item);
    });
  }

  function open() {
    if (disabled) return;
    if (onOpen) onOpen(); // e.g. re-check live connection status before showing
    closeAllDropdowns(root);
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const menuWidth = 176; // min-width 160 + padding/border
    root.classList.toggle('drop-up', spaceBelow < 300 && rect.top > 300);
    root.classList.toggle('drop-right', rect.left + menuWidth > window.innerWidth - 8);
    root.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
  }

  function close() {
    root.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  }

  function toggle() {
    root.classList.contains('open') ? close() : open();
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle();
  });
  menu.addEventListener('click', (e) => e.stopPropagation());
  // Close when keyboard focus leaves the dropdown entirely (Tab-away).
  // Guard on relatedTarget so mouse clicks (null relatedTarget) don't pre-close.
  root.addEventListener('focusout', (e) => {
    if (e.relatedTarget && !root.contains(e.relatedTarget)) close();
  });

  renderMenu();
  updateLabel();

  const api = {
    el: root,
    getSelected,
    getValue: () => value,
    setValue: (v) => { value = v; renderMenu(); updateLabel(); },
    setSelected: (arr) => { selected.clear(); arr.forEach(v => selected.add(v)); renderMenu(); updateLabel(); },
    setDisabled: (d) => {
      disabled = d;
      root.classList.toggle('disabled', d);
      trigger.disabled = d;
      if (d) close();
    },
    setConnections: (arr) => {
      if (!connectionAware) return;
      connectedSet = new Set(arr);
      if (type === 'multi') {
        // A disconnected AI can no longer remain selected.
        [...selected].forEach(v => { if (!connectedSet.has(v)) selected.delete(v); });
      }
      renderMenu();
      updateLabel();
    },
    // Make a 'multi' dropdown behave single-select (used by 对象 in 角色圆桌 mode).
    setSingleSelect: (on) => {
      if (type !== 'multi') return;
      forceSingle = on;
      if (on) {
        const cur = getSelected();
        selected.clear();
        if (cur.length > 0) {
          selected.add(cur[0]);
        } else {
          const firstConn = options.find(o => isConnected(o.value));
          if (firstConn) selected.add(firstConn.value);
        }
      }
      renderMenu();
      updateLabel();
    },
    close
  };

  dropdownRegistry.push(api);
  return api;
}

function setupDropdowns() {
  const targetOptions = AI_TYPES.map(ai => ({ value: ai, label: AI_META[ai].name, color: AI_META[ai].color }));

  ddTarget = createDropdown(document.getElementById('dd-target'), {
    type: 'multi',
    options: targetOptions,
    defaultSelected: [...AI_TYPES],
    connectionAware: true,
    onOpen: refreshConnections
  });

  ddKind = createDropdown(document.getElementById('dd-kind'), {
    type: 'single',
    options: KIND_OPTIONS,
    defaultValue: 'ai',
    onChange: () => applyMode()
  });

  ddMode = createDropdown(document.getElementById('dd-mode'), {
    type: 'single',
    options: MODE_OPTIONS,
    defaultValue: 'normal',
    onChange: () => applyMode()
  });

  ddAction = createDropdown(document.getElementById('dd-action'), {
    type: 'single',
    options: ACTION_OPTIONS,
    defaultValue: ''
  });

  ddSource = createDropdown(document.getElementById('dd-source'), {
    type: 'single',
    options: targetOptions,
    defaultValue: AI_TYPES[0],
    connectionAware: true,
    onOpen: refreshConnections
  });

  ddRoles = createDropdown(document.getElementById('dd-roles'), {
    type: 'multi',
    options: ROLE_PRESETS.map(r => ({ value: r.id, label: r.name, color: r.color, tagline: r.tagline })),
    defaultSelected: ROLE_PRESETS.slice(0, 3).map(r => r.id)
  });

  ddRoleStyle = createDropdown(document.getElementById('dd-role-style'), {
    type: 'single',
    options: ROLE_STYLES,
    defaultValue: 'roundtable'
  });

  ddRoleRounds = createDropdown(document.getElementById('dd-role-rounds'), {
    type: 'single',
    options: ROLE_ROUNDS,
    defaultValue: '2'
  });

  document.addEventListener('click', () => closeAllDropdowns());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllDropdowns();
  });
}

// Effective mode = 'role' when 角色圆桌 is chosen, else the AI-roundtable sub-mode.
function currentMode() {
  return ddKind.getValue() === 'role' ? 'role' : ddMode.getValue();
}

function applyMode() {
  const isRole = ddKind.getValue() === 'role';
  const subMode = ddMode.getValue(); // normal | mutual | cross | discussion
  const mode = isRole ? 'role' : subMode;
  const isMutualOrCross = !isRole && (subMode === 'mutual' || subMode === 'cross');

  // 玩法 sub-mode dropdown only applies to AI 圆桌
  ddMode.el.classList.toggle('hidden', isRole);
  ddAction.el.classList.toggle('hidden', !isMutualOrCross);
  crossRow.classList.toggle('hidden', isRole || subMode !== 'cross');

  // 角色圆桌 controls (嘉宾 / 讨论模式 / 发言轮次) share the same bottom bar as the
  // AI 圆桌 dropdowns and only show in role mode.
  if (ddRoles) ddRoles.el.classList.toggle('hidden', !isRole);
  if (ddRoleStyle) ddRoleStyle.el.classList.toggle('hidden', !isRole);
  if (ddRoleRounds) ddRoleRounds.el.classList.toggle('hidden', !isRole);

  // Role mode reuses the topic input + single-AI picker; the active/summary
  // panels are shown imperatively by the orchestration. A mode (re)entry resets.
  roleActive.classList.add('hidden');
  roleSummaryPanel.classList.add('hidden');
  // A mode (re)entry also clears any leftover discussion panels. (During an
  // active discussion the dropdowns are locked, so applyMode isn't reached;
  // show* functions reveal their panel after calling applyMode.)
  discussionPanel.classList.add('hidden');
  discussionSummary.classList.add('hidden');
  aiSummaryPanel.classList.add('hidden');
  resetSummaryState();
  setComposerAction(isRole ? 'role-setup' : 'ai');
  if (ddTarget) ddTarget.setSingleSelect(isRole);

  messageInput.placeholder = MODE_PLACEHOLDERS[mode] || '输入消息…';
  sendBtn.title = SEND_TITLES[mode] || '发送';
  sendBtn.setAttribute('aria-label', SEND_TITLES[mode] || '发送');
}

// ============================================
// Composer / Send Routing
// ============================================

function setupComposer() {
  sendBtn.addEventListener('click', handleSend);

  // Enter to send, Shift+Enter for new line; ignore during IME composition
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      handleSend();
    }
  });

  // Auto-grow textarea
  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 220) + 'px';
  });
}

function resetComposerHeight() {
  messageInput.style.height = 'auto';
}

async function handleSend() {
  // Prevent re-entry (e.g. a second Enter press) while a send is already in flight.
  if (sendBtn.disabled) return;

  const mode = currentMode();

  if (mode === 'discussion') {
    await startDiscussionFromComposer();
    return;
  }

  if (mode === 'role') {
    // Enter in 角色圆桌 mode starts the roundtable (the 开始 button does the same).
    await startRoleRoundtable();
    return;
  }

  if (mode === 'summary') {
    await generateAISummary();
    return;
  }

  const rawMessage = messageInput.value.trim();
  const selected = ddTarget.getSelected();
  const action = ddAction.getValue();
  const actionPrompt = (action && CROSS_REF_ACTIONS[action]) ? CROSS_REF_ACTIONS[action].prompt : '';

  // ----- 互评 -----
  if (mode === 'mutual') {
    if (selected.length < 2) {
      log('互评需要至少选择 2 个 AI', 'error');
      return;
    }
    sendBtn.disabled = true;
    messageInput.value = '';
    resetComposerHeight();
    const prompt = rawMessage || actionPrompt || '请评价以上观点。你同意什么？不同意什么？有什么补充？';
    try {
      log(`互评: ${selected.join(', ')}`);
      await handleMutualReview(selected, prompt);
    } catch (err) {
      log('Error: ' + err.message, 'error');
    }
    sendBtn.disabled = false;
    messageInput.focus();
    return;
  }

  // ----- 交叉引用 -----
  if (mode === 'cross') {
    const sourceAI = ddSource.getValue();
    const targetAIs = selected.filter(a => a !== sourceAI);
    if (!sourceAI) {
      log('交叉引用:请选择来源 AI', 'error');
      return;
    }
    if (targetAIs.length === 0) {
      log('交叉引用:请在“对象”里选择至少一个评价方(不能只选来源)', 'error');
      return;
    }
    sendBtn.disabled = true;
    messageInput.value = '';
    resetComposerHeight();
    const text = [rawMessage, actionPrompt].filter(Boolean).join(' ').trim() || '请参考以下回复并给出你的看法';
    const parsed = {
      crossRef: true,
      targetAIs,
      sourceAIs: [sourceAI],
      originalMessage: text,
      mentions: [...targetAIs, sourceAI]
    };
    try {
      log(`交叉引用: ${targetAIs.join(', ')} <- ${sourceAI}`);
      await handleCrossReference(parsed);
    } catch (err) {
      log('Error: ' + err.message, 'error');
    }
    sendBtn.disabled = false;
    messageInput.focus();
    return;
  }

  // ----- 普通发送 (preserve typed @mention / slash commands) -----
  if (!rawMessage) return;

  const parsed = parseMessage(rawMessage);

  let targets;
  if (parsed.mentions && parsed.mentions.length > 0) {
    targets = parsed.mentions;
  } else {
    targets = selected;
  }

  if (targets.length === 0) {
    log('没有选择目标 AI', 'error');
    return;
  }

  if (parsed.mutual && targets.length < 2) {
    log('互评需要至少选择 2 个 AI', 'error');
    return;
  }

  sendBtn.disabled = true;
  messageInput.value = '';
  resetComposerHeight();

  try {
    if (parsed.mutual) {
      log(`互评: ${targets.join(', ')}`);
      await handleMutualReview(targets, parsed.prompt);
    } else if (parsed.crossRef) {
      log(`交叉引用: ${parsed.targetAIs.join(', ')} <- ${parsed.sourceAIs.join(', ')}`);
      await handleCrossReference(parsed);
    } else {
      log(`发送至: ${targets.join(', ')}`);
      for (const target of targets) {
        await sendToAI(target, rawMessage);
      }
    }
  } catch (err) {
    log('Error: ' + err.message, 'error');
  }

  sendBtn.disabled = false;
  messageInput.focus();
}

function parseMessage(message) {
  // /mutual [optional prompt] — mutual review based on current responses
  const trimmedMessage = message.trim();
  if (trimmedMessage.toLowerCase() === '/mutual' || trimmedMessage.toLowerCase().startsWith('/mutual ')) {
    const prompt = trimmedMessage.length > 7 ? trimmedMessage.substring(7).trim() : '';
    return {
      mutual: true,
      prompt: prompt || '请评价以上观点。你同意什么？不同意什么？有什么补充？',
      crossRef: false,
      mentions: [],
      originalMessage: message
    };
  }

  // /cross @targets <- @sources message
  if (message.trim().toLowerCase().startsWith('/cross ')) {
    const arrowIndex = message.indexOf('<-');
    if (arrowIndex === -1) {
      return { crossRef: false, mentions: [], originalMessage: message };
    }

    const beforeArrow = message.substring(7, arrowIndex).trim();
    const afterArrow = message.substring(arrowIndex + 2).trim();

    const mentionPattern = /@(claude|chatgpt|gemini|deepseek)/gi;
    const targetMatches = [...beforeArrow.matchAll(mentionPattern)];
    const targetAIs = [...new Set(targetMatches.map(m => m[1].toLowerCase()))];

    const sourceMatches = [...afterArrow.matchAll(mentionPattern)];
    const sourceAIs = [...new Set(sourceMatches.map(m => m[1].toLowerCase()))];

    let actualMessage = afterArrow;
    if (sourceMatches.length > 0) {
      const lastMatch = sourceMatches[sourceMatches.length - 1];
      const lastMentionEnd = lastMatch.index + lastMatch[0].length;
      actualMessage = afterArrow.substring(lastMentionEnd).trim();
    }

    if (targetAIs.length > 0 && sourceAIs.length > 0) {
      return {
        crossRef: true,
        mentions: [...targetAIs, ...sourceAIs],
        targetAIs,
        sourceAIs,
        originalMessage: actualMessage
      };
    }
  }

  // @ mentions
  const mentionPattern = /@(claude|chatgpt|gemini|deepseek)/gi;
  const matches = [...message.matchAll(mentionPattern)];
  const mentions = [...new Set(matches.map(m => m[1].toLowerCase()))];

  // Exactly 2 AIs + eval keyword → 2-AI cross-reference shortcut
  if (mentions.length === 2) {
    const evalKeywords = /评价|看看|怎么样|怎么看|如何|讲的|说的|回答|赞同|同意|分析|认为|观点|看法|意见|借鉴|批评|补充|对比|evaluate|think of|opinion|review|agree|analysis|compare|learn from/i;

    if (evalKeywords.test(message)) {
      const sourceAI = matches[matches.length - 1][1].toLowerCase();
      const targetAI = matches[0][1].toLowerCase();

      return {
        crossRef: true,
        mentions,
        targetAIs: [targetAI],
        sourceAIs: [sourceAI],
        originalMessage: message
      };
    }
  }

  return {
    crossRef: false,
    mentions,
    originalMessage: message
  };
}

async function handleCrossReference(parsed) {
  const sourceResponses = [];

  for (const sourceAI of parsed.sourceAIs) {
    const response = await getLatestResponse(sourceAI);
    if (!response) {
      log(`无法获取 ${sourceAI} 的回复`, 'error');
      return;
    }
    sourceResponses.push({ ai: sourceAI, content: response });
  }

  let fullMessage = parsed.originalMessage + '\n';

  for (const source of sourceResponses) {
    fullMessage += `
<${source.ai}_response>
${source.content}
</${source.ai}_response>`;
  }

  for (const targetAI of parsed.targetAIs) {
    await sendToAI(targetAI, fullMessage);
  }
}

// ============================================
// Mutual Review
// ============================================

async function handleMutualReview(participants, prompt) {
  const responses = {};

  log(`[互评] 正在获取 ${participants.join(', ')} 的回复...`);

  for (const ai of participants) {
    const response = await getLatestResponse(ai);
    if (!response || response.trim().length === 0) {
      log(`[互评] 无法获取 ${ai} 的回复 - 请确认 ${ai} 已先回复`, 'error');
      return;
    }
    responses[ai] = response;
    log(`[互评] 已获取 ${ai} 的回复 (${response.length} 字)`);
  }

  log(`[互评] 全部回复已收集，正在发送交叉评价...`);

  for (const targetAI of participants) {
    const otherAIs = participants.filter(ai => ai !== targetAI);

    let evalMessage = `以下是其他 AI 的观点：\n`;

    for (const sourceAI of otherAIs) {
      evalMessage += `
<${sourceAI}_response>
${responses[sourceAI]}
</${sourceAI}_response>
`;
    }

    evalMessage += `\n${prompt}`;

    log(`[互评] 发送给 ${targetAI}: ${otherAIs.join('+')} 的回复 + 提示`);
    await sendToAI(targetAI, evalMessage);
  }

  log(`[互评] 完成！${participants.length} 个 AI 已收到交叉评价`, 'success');
}

async function getLatestResponse(aiType) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'GET_RESPONSE', aiType },
      (response) => {
        resolve(response?.content || null);
      }
    );
  });
}

async function sendToAI(aiType, message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'SEND_MESSAGE', aiType, message },
      (response) => {
        if (response?.success) {
          log(`已发送至 ${aiType}`, 'success');
        } else {
          log(`发送至 ${aiType} 失败: ${response?.error || 'Unknown error'}`, 'error');
        }
        resolve(response);
      }
    );
  });
}

function log(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = 'log-entry' + (type !== 'info' ? ` ${type}` : '');

  const time = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  entry.innerHTML = `<span class="time"></span><span class="msg"></span>`;
  entry.querySelector('.time').textContent = time;
  entry.querySelector('.msg').textContent = message;
  logContainer.insertBefore(entry, logContainer.firstChild);

  while (logContainer.children.length > 50) {
    logContainer.removeChild(logContainer.lastChild);
  }
}

// ============================================
// Connection Status
// ============================================

// Registered synchronously at boot (before any await) so boot-time broadcasts
// from background — e.g. TAB_STATUS_UPDATE / RESPONSE_CAPTURED — are not missed.
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TAB_STATUS_UPDATE') {
      // A push arrived — re-query authoritatively rather than trust a single flag.
      refreshConnections();
    } else if (message.type === 'RESPONSE_CAPTURED') {
      log(`${message.aiType}: 已捕获回复`, 'success');
      if (summaryState.awaiting && message.aiType === summaryState.ai) {
        handleAISummaryResponse(message.content);
      } else if (discussionState.active && discussionState.pendingResponses.has(message.aiType)) {
        handleDiscussionResponse(message.aiType, message.content);
      } else if (roleState.active && roleState.awaitingRole && message.aiType === roleState.ai) {
        handleRoleResponse(message.content);
      }
    } else if (message.type === 'SEND_RESULT') {
      if (message.success) {
        log(`${message.aiType}: 消息已发送`, 'success');
      } else {
        log(`${message.aiType}: 失败 - ${message.error}`, 'error');
      }
    }
  });
}

// Authoritatively re-check which AI tabs are open and push the result into the
// connection-aware dropdowns. Called at boot, on each target/source dropdown
// open, and whenever background broadcasts a TAB_STATUS_UPDATE.
async function refreshConnections() {
  try {
    const tabs = await chrome.tabs.query({});
    const connected = new Set();
    for (const tab of tabs) {
      const aiType = getAITypeFromUrl(tab.url);
      if (aiType) {
        connected.add(aiType);
      }
    }
    if (ddTarget) ddTarget.setConnections([...connected]);
    if (ddSource) ddSource.setConnections([...connected]);
  } catch (err) {
    log('检查连接出错: ' + err.message, 'error');
  }
}

// 当前已连接的 AI 集合(复用 URL 匹配)。
async function getConnectedAISet() {
  try {
    const tabs = await chrome.tabs.query({});
    return new Set(tabs.map(t => getAITypeFromUrl(t.url)).filter(Boolean));
  } catch (err) {
    return new Set();
  }
}

// One-off connection check for the chosen summarizer (reuses URL matching).
async function isAIConnected(aiType) {
  return (await getConnectedAISet()).has(aiType);
}

function getAITypeFromUrl(url) {
  if (!url) return null;
  if (url.includes('claude.ai')) return 'claude';
  if (url.includes('chat.openai.com') || url.includes('chatgpt.com')) return 'chatgpt';
  if (url.includes('gemini.google.com')) return 'gemini';
  if (url.includes('chat.deepseek.com')) return 'deepseek';
  return null;
}

// ============================================
// Discussion Mode
// ============================================

function setupDiscussionControls() {
  document.getElementById('next-round-btn').addEventListener('click', nextRound);
  document.getElementById('end-discussion-btn').addEventListener('click', endDiscussion);
  document.getElementById('generate-summary-btn').addEventListener('click', generateSummary);
  document.getElementById('new-discussion-btn').addEventListener('click', resetDiscussion);
  document.getElementById('interject-btn').addEventListener('click', handleInterject);
}

function lockComposerForDiscussion(locked) {
  ddKind.setDisabled(locked);
  ddMode.setDisabled(locked);
  ddTarget.setDisabled(locked);
  ddAction.setDisabled(locked);
  if (ddRoles) ddRoles.setDisabled(locked);
  if (ddRoleStyle) ddRoleStyle.setDisabled(locked);
  if (ddRoleRounds) ddRoleRounds.setDisabled(locked);
  messageInput.disabled = locked;
  sendBtn.disabled = locked;
}

async function startDiscussionFromComposer() {
  if (discussionState.active) {
    log('讨论进行中，请使用下方控制面板，或先结束当前讨论', 'error');
    return;
  }

  const topic = messageInput.value.trim();
  const selected = ddTarget.getSelected();

  if (selected.length !== 2) {
    log('讨论需要正好选择 2 位参与者', 'error');
    return;
  }
  if (!topic) {
    log('请输入讨论主题', 'error');
    return;
  }

  if (discussionState.summaryTimer) clearInterval(discussionState.summaryTimer);
  discussionState = {
    active: true,
    topic: topic,
    participants: selected,
    currentRound: 1,
    history: [],
    pendingResponses: new Set(selected),
    roundType: 'initial',
    summaryTimer: null
  };

  messageInput.value = '';
  resetComposerHeight();
  lockComposerForDiscussion(true);

  // Show discussion panel
  discussionSummary.classList.add('hidden');
  discussionPanel.classList.remove('hidden');
  document.getElementById('round-badge').textContent = '第 1 轮';
  document.getElementById('participants-badge').textContent =
    `${AI_META[selected[0]].name} vs ${AI_META[selected[1]].name}`;
  document.getElementById('topic-display').textContent = topic;
  updateDiscussionStatus('waiting', `等待 ${selected.map(s => AI_META[s].name).join(' 和 ')} 的初始回复...`);

  document.getElementById('next-round-btn').disabled = true;
  document.getElementById('generate-summary-btn').disabled = true;

  log(`讨论开始: ${selected.join(' vs ')}`, 'success');

  for (const ai of selected) {
    await sendToAI(ai, `Please share your thoughts on the following topic:\n\n${topic}`);
  }
}

function handleDiscussionResponse(aiType, content) {
  if (!discussionState.active) return;

  discussionState.history.push({
    round: discussionState.currentRound,
    ai: aiType,
    type: discussionState.roundType,
    content: content
  });

  discussionState.pendingResponses.delete(aiType);

  log(`讨论: ${aiType} 已回复 (第 ${discussionState.currentRound} 轮)`, 'success');

  if (discussionState.pendingResponses.size === 0) {
    onRoundComplete();
  } else {
    const remaining = Array.from(discussionState.pendingResponses).join(', ');
    updateDiscussionStatus('waiting', `等待 ${remaining}...`);
  }
}

function onRoundComplete() {
  // During summary generation the poller (generateSummary) owns the terminal
  // transition to showSummary — don't flash a "round complete" status or
  // re-enable round controls for the summary responses.
  if (discussionState.roundType === 'summary') return;

  log(`第 ${discussionState.currentRound} 轮完成`, 'success');
  updateDiscussionStatus('ready', `第 ${discussionState.currentRound} 轮完成，可以进入下一轮`);

  document.getElementById('next-round-btn').disabled = false;
  document.getElementById('generate-summary-btn').disabled = false;
}

async function nextRound() {
  const [ai1, ai2] = discussionState.participants;

  // Read the just-completed round's responses BEFORE mutating any UI/state,
  // so a missing-response abort leaves the panel usable (buttons stay enabled).
  const prevRound = discussionState.currentRound;
  const ai1Response = discussionState.history.find(h => h.round === prevRound && h.ai === ai1)?.content;
  const ai2Response = discussionState.history.find(h => h.round === prevRound && h.ai === ai2)?.content;

  if (!ai1Response || !ai2Response) {
    log('缺少上一轮的回复', 'error');
    return;
  }

  discussionState.currentRound++;
  document.getElementById('round-badge').textContent = `第 ${discussionState.currentRound} 轮`;
  document.getElementById('next-round-btn').disabled = true;
  document.getElementById('generate-summary-btn').disabled = true;

  discussionState.pendingResponses = new Set([ai1, ai2]);
  discussionState.roundType = 'cross-eval';

  updateDiscussionStatus('waiting', `交叉评价: ${ai1} 评价 ${ai2}，${ai2} 评价 ${ai1}...`);

  log(`第 ${discussionState.currentRound} 轮: 交叉评价开始`);

  const msg1 = `Here is ${capitalize(ai2)}'s response to the topic "${discussionState.topic}":

<${ai2}_response>
${ai2Response}
</${ai2}_response>

Please evaluate this response. What do you agree with? What do you disagree with? What would you add or change?`;

  const msg2 = `Here is ${capitalize(ai1)}'s response to the topic "${discussionState.topic}":

<${ai1}_response>
${ai1Response}
</${ai1}_response>

Please evaluate this response. What do you agree with? What do you disagree with? What would you add or change?`;

  await sendToAI(ai1, msg1);
  await sendToAI(ai2, msg2);
}

async function handleInterject() {
  const input = document.getElementById('interject-input');
  const message = input.value.trim();

  if (!message) {
    log('请输入要发送的消息', 'error');
    return;
  }

  if (!discussionState.active || discussionState.participants.length === 0) {
    log('当前没有进行中的讨论', 'error');
    return;
  }

  const btn = document.getElementById('interject-btn');
  btn.disabled = true;

  const [ai1, ai2] = discussionState.participants;

  log(`[插话] 正在获取双方最新回复...`);

  const ai1Response = await getLatestResponse(ai1);
  const ai2Response = await getLatestResponse(ai2);

  if (!ai1Response || !ai2Response) {
    log(`[插话] 无法获取回复，请确保双方都已回复`, 'error');
    btn.disabled = false;
    return;
  }

  log(`[插话] 已获取双方回复，正在发送...`);

  const msg1 = `${message}

以下是 ${capitalize(ai2)} 的最新回复：

<${ai2}_response>
${ai2Response}
</${ai2}_response>`;

  const msg2 = `${message}

以下是 ${capitalize(ai1)} 的最新回复：

<${ai1}_response>
${ai1Response}
</${ai1}_response>`;

  await sendToAI(ai1, msg1);
  await sendToAI(ai2, msg2);

  log(`[插话] 已发送给双方（含对方回复）`, 'success');

  input.value = '';
  btn.disabled = false;
}

async function generateSummary() {
  document.getElementById('generate-summary-btn').disabled = true;
  document.getElementById('next-round-btn').disabled = true;
  updateDiscussionStatus('waiting', '正在请求双方生成总结...');

  const [ai1, ai2] = discussionState.participants;

  let historyText = `主题: ${discussionState.topic}\n\n`;

  for (let round = 1; round <= discussionState.currentRound; round++) {
    historyText += `=== 第 ${round} 轮 ===\n\n`;
    const roundEntries = discussionState.history.filter(h => h.round === round);
    for (const entry of roundEntries) {
      historyText += `[${capitalize(entry.ai)}]:\n${entry.content}\n\n`;
    }
  }

  const summaryPrompt = `请对以下 AI 之间的讨论进行总结。请包含：
1. 主要共识点
2. 主要分歧点
3. 各方的核心观点
4. 总体结论

讨论历史：
${historyText}`;

  discussionState.roundType = 'summary';
  discussionState.pendingResponses = new Set([ai1, ai2]);

  log(`[总结] 正在请求双方生成总结...`);
  await sendToAI(ai1, summaryPrompt);
  await sendToAI(ai2, summaryPrompt);

  // Poll until both summaries are captured. Guards prevent throwing or polling
  // forever if the discussion is reset, or a capture never arrives.
  let ticks = 0;
  const maxTicks = 1200; // 1200 × 500ms = 10 min, matches capture max wait
  const checkForSummary = setInterval(() => {
    ticks++;
    if (discussionState.roundType !== 'summary' || discussionState.participants.length !== 2) {
      clearInterval(checkForSummary);
      return;
    }
    if (discussionState.pendingResponses.size === 0) {
      clearInterval(checkForSummary);
      const summaries = discussionState.history.filter(h => h.type === 'summary');
      const ai1Summary = summaries.find(s => s.ai === ai1)?.content || '';
      const ai2Summary = summaries.find(s => s.ai === ai2)?.content || '';
      log(`[总结] 双方总结已生成`, 'success');
      showSummary(ai1Summary, ai2Summary);
    } else if (ticks >= maxTicks) {
      clearInterval(checkForSummary);
      log('[总结] 等待超时，未收到双方完整总结', 'error');
      updateDiscussionStatus('ready', '总结等待超时，可重试或结束讨论');
      document.getElementById('generate-summary-btn').disabled = false;
      document.getElementById('next-round-btn').disabled = false;
    }
  }, 500);
  discussionState.summaryTimer = checkForSummary;
}

function showSummary(ai1Summary, ai2Summary) {
  const [ai1, ai2] = discussionState.participants;

  if (!ai1Summary && !ai2Summary) {
    log('警告: 未收到 AI 的总结内容', 'error');
  }

  let html = `<div class="round-summary">
    <h4>双方总结对比</h4>
    <div class="summary-comparison">
      <div class="ai-response">
        <div class="ai-name ${ai1}">${capitalize(ai1)} 的总结：</div>
        <div>${escapeHtml(ai1Summary).replace(/\n/g, '<br>')}</div>
      </div>
      <div class="ai-response">
        <div class="ai-name ${ai2}">${capitalize(ai2)} 的总结：</div>
        <div>${escapeHtml(ai2Summary).replace(/\n/g, '<br>')}</div>
      </div>
    </div>
  </div>`;

  html += `<div class="round-summary"><h4>完整讨论历史</h4>`;
  for (let round = 1; round <= discussionState.currentRound; round++) {
    const roundEntries = discussionState.history.filter(h => h.round === round && h.type !== 'summary');
    if (roundEntries.length > 0) {
      html += `<div style="margin-top:12px"><strong>第 ${round} 轮</strong></div>`;
      for (const entry of roundEntries) {
        const preview = entry.content.substring(0, 200) + (entry.content.length > 200 ? '...' : '');
        html += `<div class="ai-response">
          <div class="ai-name ${entry.ai}">${capitalize(entry.ai)}:</div>
          <div>${escapeHtml(preview).replace(/\n/g, '<br>')}</div>
        </div>`;
      }
    }
  }
  html += `</div>`;

  document.getElementById('summary-content').innerHTML = html;
  discussionState.active = false;
  // Summary is terminal — free the composer so the user can keep working while
  // reading it. The 新讨论 button clears the summary when they're done.
  lockComposerForDiscussion(false);
  ddKind.setValue('ai');
  ddMode.setValue('normal');
  applyMode();                                  // resets composer + hides all mode panels
  discussionSummary.classList.remove('hidden'); // reveal the summary AFTER applyMode
  log('讨论总结已生成', 'success');
}

function endDiscussion() {
  if (confirm('确定结束讨论吗？建议先生成总结。')) {
    resetDiscussion();
  }
}

function resetDiscussion() {
  if (discussionState.summaryTimer) clearInterval(discussionState.summaryTimer);
  discussionState = {
    active: false,
    topic: '',
    participants: [],
    currentRound: 0,
    history: [],
    pendingResponses: new Set(),
    roundType: null,
    summaryTimer: null
  };

  discussionPanel.classList.add('hidden');
  discussionSummary.classList.add('hidden');
  document.getElementById('next-round-btn').disabled = true;
  document.getElementById('generate-summary-btn').disabled = true;

  lockComposerForDiscussion(false);
  ddKind.setValue('ai');
  ddMode.setValue('normal');
  applyMode();

  log('讨论已结束');
}

function updateDiscussionStatus(state, text) {
  const statusEl = document.getElementById('discussion-status');
  statusEl.textContent = text;
  statusEl.className = 'discussion-status ' + state;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// AI 圆桌 Summary (designate one AI to summarize the roundtable)
// ============================================

function resetSummaryState() {
  if (summaryState.awaiting) sendBtn.disabled = false;
  clearTimeout(summaryState.timer);
  summaryState = { awaiting: false, ai: null, turns: [], timer: null };
}

function aiName(ai) {
  return AI_META[ai] ? AI_META[ai].name : ai;
}

function setupSummaryControls() {
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
      const name = aiName(entry.ai);
      turns.push({ label: `第 ${entry.round} 轮 · ${name}`, content: entry.content });
    }
  } else {
    let aiList = ddTarget.getSelected();
    if (aiList.length === 0) {
      // 回退为全部「已连接」AI(而非全部 AI),避免纳入已关闭标签页的过期缓存响应
      const connected = await getConnectedAISet();
      aiList = AI_TYPES.filter(a => connected.has(a));
    }
    for (const ai of aiList) {
      const content = await getLatestResponse(ai);
      if (content && content.trim().length > 0) {
        const name = aiName(ai);
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
  const selected = ddTarget.getSelected();
  if (selected.length === 0) { log('请在「对象」中至少选择一个 AI(第一个作为总结者)', 'error'); return; }
  const summarizer = selected[0];

  if (!(await isAIConnected(summarizer))) {
    const name = aiName(summarizer);
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

  sendBtn.disabled = true;
  const name = aiName(summarizer);
  log(`[圆桌总结] 正在请求 ${name} 生成总结...`);

  // Deliver first, then arm capture (same stale-capture guard as role mode).
  const res = await sendToAI(summarizer, buildSummaryPrompt(transcript));
  if (!res || !res.success) {
    log('[圆桌总结] 总结请求发送失败', 'error');
    sendBtn.disabled = false;
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
        sendBtn.disabled = false;
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
  sendBtn.disabled = false;
}

// Render in the 角色圆桌 summary style: host summary + full transcript.
function showAISummary(summary, turns, ai) {
  const name = aiName(ai);
  let html = `<div class="round-summary"><h4>主持人总结（${escapeHtml(name)}）</h4><div>${escapeHtml(summary).replace(/\n/g, '<br>')}</div></div>`;
  html += `<div class="round-summary"><h4>完整讨论记录</h4>`;
  turns.forEach(t => {
    html += `<div class="role-turn"><div class="role-turn-name">${escapeHtml(t.label)}</div><div>${escapeHtml(t.content).replace(/\n/g, '<br>')}</div></div>`;
  });
  html += `</div>`;
  document.getElementById('ai-summary-content').innerHTML = html;
  aiSummaryPanel.classList.remove('hidden');
}

// ============================================
// Role Roundtable (single AI plays multiple built-in roles, sequentially)
// ============================================

const SUMMARY_SENTINEL = '__summary__';

function roleById(id) {
  return ROLE_PRESETS.find(r => r.id === id);
}

function setupRoleRoundtable() {
  document.getElementById('start-role-btn').addEventListener('click', startRoleRoundtable);
  document.getElementById('role-next-btn').addEventListener('click', nextRoleRound);
  document.getElementById('role-summary-btn').addEventListener('click', generateRoleSummary);
  document.getElementById('role-end-btn').addEventListener('click', endRoleRoundtable);
  document.getElementById('role-new-btn').addEventListener('click', resetRoleRoundtable);
}

async function startRoleRoundtable() {
  if (roleState.active) {
    log('角色圆桌进行中，请使用控制面板，或先结束当前圆桌', 'error');
    return;
  }

  const topic = messageInput.value.trim();
  const roles = ddRoles.getSelected(); // 嘉宾 dropdown (role ids, in preset order)
  const ai = ddTarget.getSelected()[0]; // 对象 is single-select in role mode

  if (roles.length < 2) { log('请至少选择 2 个嘉宾(角色)', 'error'); return; }
  if (!topic) { log('请输入讨论话题', 'error'); return; }
  if (!ai) { log('请在“对象”中选择一个已连接的 AI 作为扮演者', 'error'); return; }

  const totalRounds = parseInt(ddRoleRounds.getValue(), 10) || 2;
  const style = ddRoleStyle.getValue() || 'roundtable';

  roleState = {
    active: true, ai, topic, style, totalRounds, roles,
    currentRound: 1, turnQueue: [...roles], awaitingRole: null,
    history: [], turnTimer: null, summaryTimer: null
  };

  messageInput.value = '';
  resetComposerHeight();
  lockComposerForDiscussion(true);

  roleSummaryPanel.classList.add('hidden');
  roleActive.classList.remove('hidden');
  setComposerAction('role-active'); // 下一轮 / 总结 / 结束 in the send slot
  document.getElementById('role-round-badge').textContent = '第 1 轮';
  document.getElementById('role-participants').textContent = roles.map(id => roleById(id).name).join(' · ');
  document.getElementById('role-topic-display').textContent = topic;
  document.getElementById('role-next-btn').disabled = true;
  document.getElementById('role-summary-btn').disabled = true;

  const aiName = AI_META[ai] ? AI_META[ai].name : ai;
  log(`角色圆桌开始: ${aiName} 扮演 ${roles.length} 个角色，共 ${totalRounds} 轮`, 'success');

  runNextRoleTurn();
}

async function runNextRoleTurn() {
  if (!roleState.active) return;

  if (roleState.turnQueue.length === 0) {
    onRoleRoundComplete();
    return;
  }

  const roleId = roleState.turnQueue.shift();
  const role = roleById(roleId);
  updateRoleStatus('waiting', `第 ${roleState.currentRound} 轮 · ${role.name} 发言中…`);

  // Deliver the prompt FIRST, then arm capture. While the send is in flight
  // awaitingRole stays null, so a stale/late capture of the previous turn
  // cannot be misattributed to this role.
  const res = await sendToAI(roleState.ai, buildRolePrompt(role));
  if (!roleState.active) return; // ended/reset during the send

  if (!res || !res.success) {
    log(`角色圆桌: 发送给 ${role.name} 失败`, 'error');
    updateRoleStatus('ready', '发送失败，可点“结束”或“生成总结”');
    document.getElementById('role-next-btn').disabled = roleState.currentRound >= roleState.totalRounds;
    document.getElementById('role-summary-btn').disabled = false;
    return;
  }

  roleState.awaitingRole = roleId;
  clearTimeout(roleState.turnTimer);
  roleState.turnTimer = setTimeout(() => {
    if (roleState.active && roleState.awaitingRole === roleId) {
      roleState.awaitingRole = null;
      log(`角色圆桌: 等待 ${role.name} 回复超时`, 'error');
      updateRoleStatus('ready', `${role.name} 回复超时，可点“结束”或“生成总结”`);
      document.getElementById('role-next-btn').disabled = roleState.currentRound >= roleState.totalRounds;
      document.getElementById('role-summary-btn').disabled = false;
    }
  }, ROLE_TURN_TIMEOUT_MS);
}

function handleRoleResponse(content) {
  if (!roleState.active || !roleState.awaitingRole) return;

  if (roleState.awaitingRole === SUMMARY_SENTINEL) {
    clearTimeout(roleState.summaryTimer);
    roleState.awaitingRole = null;
    log('角色圆桌: 总结已生成', 'success');
    showRoleSummary(content);
    return;
  }

  clearTimeout(roleState.turnTimer);
  const roleId = roleState.awaitingRole;
  roleState.history.push({ round: roleState.currentRound, role: roleId, content });
  roleState.awaitingRole = null;
  log(`角色圆桌: ${roleById(roleId).name} 已发言 (第 ${roleState.currentRound} 轮)`, 'success');
  runNextRoleTurn();
}

function onRoleRoundComplete() {
  updateRoleStatus('ready', `第 ${roleState.currentRound} 轮完成`);
  document.getElementById('role-next-btn').disabled = roleState.currentRound >= roleState.totalRounds;
  document.getElementById('role-summary-btn').disabled = false;
}

function nextRoleRound() {
  if (!roleState.active || roleState.currentRound >= roleState.totalRounds) return;
  roleState.currentRound++;
  roleState.turnQueue = [...roleState.roles];
  document.getElementById('role-round-badge').textContent = `第 ${roleState.currentRound} 轮`;
  document.getElementById('role-next-btn').disabled = true;
  document.getElementById('role-summary-btn').disabled = true;
  log(`角色圆桌: 第 ${roleState.currentRound} 轮开始`);
  runNextRoleTurn();
}

function buildRoleTranscript() {
  if (roleState.history.length === 0) return '（你是第一位发言者，暂无其他发言。）';
  return roleState.history
    .map(h => `【${roleById(h.role).name}】:\n${h.content}`)
    .join('\n\n');
}

function buildRolePrompt(role) {
  const style = ROLE_STYLES.find(s => s.value === roleState.style) || ROLE_STYLES[1];
  return `你正在参加一场围绕以下话题的多角色圆桌讨论。本轮你只扮演【${role.name}】这一个角色，不要扮演或代表其他角色。

# 你的角色设定
${role.persona}

# 讨论话题
${roleState.topic}

# 目前为止的发言
${buildRoleTranscript()}

# 本轮要求
${style.instruction}
请以【${role.name}】的身份发言（约 200–400 字），不要复述他人原文，直接给出你的观点。`;
}

async function generateRoleSummary() {
  if (!roleState.active) return;
  document.getElementById('role-summary-btn').disabled = true;
  document.getElementById('role-next-btn').disabled = true;
  updateRoleStatus('waiting', '正在请求生成总结...');

  const summaryPrompt = `以上是一场围绕“${roleState.topic}”的多角色圆桌讨论的完整记录：

${buildRoleTranscript()}

请你以中立主持人的身份，对这场讨论做总结，包含：
1. 主要共识点
2. 主要分歧点
3. 各角色的核心观点
4. 综合结论`;

  log('角色圆桌: 正在请求生成总结...');

  // Deliver first, then arm capture (same stale-capture guard as a turn).
  const res = await sendToAI(roleState.ai, summaryPrompt);
  if (!roleState.active) return;

  if (!res || !res.success) {
    log('角色圆桌: 总结请求发送失败', 'error');
    updateRoleStatus('ready', '发送失败，可重试或结束');
    document.getElementById('role-summary-btn').disabled = false;
    return;
  }

  roleState.awaitingRole = SUMMARY_SENTINEL;
  clearTimeout(roleState.summaryTimer);
  roleState.summaryTimer = setTimeout(() => {
    if (roleState.active && roleState.awaitingRole === SUMMARY_SENTINEL) {
      roleState.awaitingRole = null;
      log('角色圆桌: 总结等待超时', 'error');
      updateRoleStatus('ready', '总结等待超时，可重试或结束');
      document.getElementById('role-summary-btn').disabled = false;
    }
  }, ROLE_TURN_TIMEOUT_MS);
}

function showRoleSummary(summaryContent) {
  roleActive.classList.add('hidden');
  roleSummaryPanel.classList.remove('hidden');
  setComposerAction('role-summary'); // hide all action buttons; use 新的角色圆桌

  let html = `<div class="round-summary"><h4>主持人总结</h4><div>${escapeHtml(summaryContent).replace(/\n/g, '<br>')}</div></div>`;
  html += `<div class="round-summary"><h4>完整讨论记录</h4>`;
  roleState.history.forEach(h => {
    const role = roleById(h.role);
    html += `<div class="role-turn"><div class="role-turn-name">第 ${h.round} 轮 · ${escapeHtml(role.name)}</div><div>${escapeHtml(h.content).replace(/\n/g, '<br>')}</div></div>`;
  });
  html += `</div>`;
  document.getElementById('role-summary-content').innerHTML = html;

  // Terminal: free the composer; stay in role mode with the summary visible.
  roleState.active = false;
  lockComposerForDiscussion(false);
  log('角色圆桌总结已生成', 'success');
}

function endRoleRoundtable() {
  if (confirm('确定结束角色圆桌吗？建议先生成总结。')) {
    resetRoleRoundtable();
  }
}

function resetRoleRoundtable() {
  clearTimeout(roleState.turnTimer);
  clearTimeout(roleState.summaryTimer);
  roleState = {
    active: false, ai: null, topic: '', style: 'roundtable', totalRounds: 2, roles: [],
    currentRound: 0, turnQueue: [], awaitingRole: null, history: [], turnTimer: null, summaryTimer: null
  };
  document.getElementById('role-next-btn').disabled = true;
  document.getElementById('role-summary-btn').disabled = true;
  lockComposerForDiscussion(false);
  ddKind.setValue('role');
  applyMode(); // back to the role setup panel
  log('角色圆桌已结束');
}

function updateRoleStatus(state, text) {
  const el = document.getElementById('role-status');
  el.textContent = text;
  el.className = 'discussion-status ' + state;
}
