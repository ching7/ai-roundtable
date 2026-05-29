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

const MODE_OPTIONS = [
  { value: 'normal', label: '普通发送' },
  { value: 'mutual', label: '互评' },
  { value: 'cross', label: '交叉引用' },
  { value: 'discussion', label: '讨论' }
];

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
  discussion: '输入讨论主题…（需在“对象”中选择 2 位参与者）'
};

const SEND_TITLES = {
  normal: '发送',
  mutual: '发送互评',
  cross: '发送交叉引用',
  discussion: '开始讨论'
};

// DOM Elements
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const logContainer = document.getElementById('log-container');
const fileInput = document.getElementById('file-input');
const addFileBtn = document.getElementById('add-file-btn');
const fileList = document.getElementById('file-list');
const crossRow = document.getElementById('cross-row');
const discussionPanel = document.getElementById('discussion-panel');
const discussionSummary = document.getElementById('discussion-summary');

// Dropdown controllers (assigned in setupDropdowns)
let ddTarget = null;
let ddMode = null;
let ddAction = null;
let ddSource = null;

// Selected files storage
let selectedFiles = [];

// Track connected tabs
const connectedTabs = {
  claude: null,
  chatgpt: null,
  gemini: null,
  deepseek: null
};

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


// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupMessageListener();
  setupDropdowns();
  checkConnectedTabs();
  setupComposer();
  setupDiscussionControls();
  setupFileUpload();
  applyMode('normal');
});

// ============================================
// Dropdown Component
// ============================================

const dropdownRegistry = [];

function closeAllDropdowns(exceptRoot) {
  dropdownRegistry.forEach(api => {
    if (api.el !== exceptRoot) api.close();
  });
}

function createDropdown(root, { type, options, defaultSelected, defaultValue, onChange }) {
  const trigger = root.querySelector('.dropdown-trigger');
  const menu = root.querySelector('.dropdown-menu');
  const labelEl = trigger.querySelector('.dropdown-label');

  const selected = new Set(type === 'multi' ? (defaultSelected || []) : []);
  let value = type === 'single' ? (defaultValue ?? (options[0] && options[0].value)) : null;
  let disabled = false;

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
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'dropdown-item';
      item.setAttribute('role', 'menuitem');
      item.dataset.value = opt.value;

      let inner = '';
      if (opt.color) {
        inner += `<span class="brand-dot" data-ai="${opt.value}" style="--dot:${opt.color}"></span>`;
      }
      inner += `<span class="item-label"></span>`;
      if (type === 'multi') inner += `<span class="check">✓</span>`;
      item.innerHTML = inner;
      item.querySelector('.item-label').textContent = opt.label;

      const isSel = type === 'multi' ? selected.has(opt.value) : value === opt.value;
      item.classList.toggle('selected', isSel);

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (type === 'multi') {
          if (selected.has(opt.value)) selected.delete(opt.value);
          else selected.add(opt.value);
          item.classList.toggle('selected');
          updateLabel();
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
    setStatus: (ai, connected) => {
      const dot = menu.querySelector(`.brand-dot[data-ai="${ai}"]`);
      if (dot) dot.classList.toggle('offline', !connected);
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
    defaultSelected: [...AI_TYPES]
  });

  ddMode = createDropdown(document.getElementById('dd-mode'), {
    type: 'single',
    options: MODE_OPTIONS,
    defaultValue: 'normal',
    onChange: (v) => applyMode(v)
  });

  ddAction = createDropdown(document.getElementById('dd-action'), {
    type: 'single',
    options: ACTION_OPTIONS,
    defaultValue: ''
  });

  ddSource = createDropdown(document.getElementById('dd-source'), {
    type: 'single',
    options: targetOptions,
    defaultValue: AI_TYPES[0]
  });

  document.addEventListener('click', () => closeAllDropdowns());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllDropdowns();
  });
}

function applyMode(mode) {
  const isMutualOrCross = mode === 'mutual' || mode === 'cross';
  ddAction.el.classList.toggle('hidden', !isMutualOrCross);
  crossRow.classList.toggle('hidden', mode !== 'cross');

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

async function maybeSendFiles(recipients) {
  const filesToSend = [...selectedFiles];
  if (filesToSend.length === 0) return;
  log(`正在上传 ${filesToSend.length} 个文件...`);
  for (const target of recipients) {
    await sendFilesToAI(target, filesToSend);
  }
  clearFiles();
  // Wait a bit for files to be processed before sending message
  await new Promise(r => setTimeout(r, 500));
}

function resetComposerHeight() {
  messageInput.style.height = 'auto';
}

async function handleSend() {
  // Prevent re-entry (e.g. a second Enter press) while a send is already in flight.
  if (sendBtn.disabled) return;

  const mode = ddMode.getValue();

  if (mode === 'discussion') {
    await startDiscussionFromComposer();
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
    await maybeSendFiles(selected);
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
    await maybeSendFiles(targetAIs);
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

  // Validate before uploading files so an aborted review keeps the attachments.
  if (parsed.mutual && targets.length < 2) {
    log('互评需要至少选择 2 个 AI', 'error');
    return;
  }

  // Files go only to AIs that receive the prompt; a /cross source is read, not sent files.
  const fileRecipients = parsed.crossRef ? parsed.targetAIs : targets;

  sendBtn.disabled = true;
  messageInput.value = '';
  resetComposerHeight();
  await maybeSendFiles(fileRecipients);

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
      updateTabStatus(message.aiType, message.connected);
    } else if (message.type === 'RESPONSE_CAPTURED') {
      log(`${message.aiType}: 已捕获回复`, 'success');
      if (discussionState.active && discussionState.pendingResponses.has(message.aiType)) {
        handleDiscussionResponse(message.aiType, message.content);
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

async function checkConnectedTabs() {
  try {
    const tabs = await chrome.tabs.query({});

    for (const tab of tabs) {
      const aiType = getAITypeFromUrl(tab.url);
      if (aiType) {
        connectedTabs[aiType] = tab.id;
        updateTabStatus(aiType, true);
      }
    }
  } catch (err) {
    log('检查标签页出错: ' + err.message, 'error');
  }
}

function getAITypeFromUrl(url) {
  if (!url) return null;
  if (url.includes('claude.ai')) return 'claude';
  if (url.includes('chat.openai.com') || url.includes('chatgpt.com')) return 'chatgpt';
  if (url.includes('gemini.google.com')) return 'gemini';
  if (url.includes('chat.deepseek.com')) return 'deepseek';
  return null;
}

function updateTabStatus(aiType, connected) {
  if (connected) connectedTabs[aiType] = true;
  // Reflect status on the dropdown brand dots (target + source menus)
  if (ddTarget) ddTarget.setStatus(aiType, connected);
  if (ddSource) ddSource.setStatus(aiType, connected);
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
  ddMode.setDisabled(locked);
  ddTarget.setDisabled(locked);
  ddAction.setDisabled(locked);
  messageInput.disabled = locked;
  sendBtn.disabled = locked;
  addFileBtn.disabled = locked;
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
  discussionPanel.classList.add('hidden');
  discussionSummary.classList.remove('hidden');

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
  ddMode.setValue('normal');
  applyMode('normal');
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
  ddMode.setValue('normal');
  applyMode('normal');

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
// File Upload
// ============================================

function setupFileUpload() {
  addFileBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    files.forEach(file => addFile(file));
    fileInput.value = '';
  });
}

function addFile(file) {
  if (file.size > 10 * 1024 * 1024) {
    log(`文件 ${file.name} 超过 10MB 限制`, 'error');
    return;
  }

  if (selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
    return;
  }

  selectedFiles.push(file);
  renderFileList();
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderFileList();
}

function renderFileList() {
  fileList.innerHTML = '';

  selectedFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'file-item';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'file-name';
    nameSpan.title = file.name;
    nameSpan.textContent = file.name;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-file';
    removeBtn.title = '移除';
    removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', () => removeFile(index));
    item.appendChild(nameSpan);
    item.appendChild(removeBtn);
    fileList.appendChild(item);
  });
}

function clearFiles() {
  selectedFiles = [];
  renderFileList();
}

async function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        base64
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function sendFilesToAI(aiType, files) {
  log(`${aiType}: 准备上传 ${files.length} 个文件...`);
  const fileDataArray = await Promise.all(files.map(readFileAsBase64));
  log(`${aiType}: 文件已编码，正在发送...`);

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'SEND_FILES', aiType, files: fileDataArray },
      (response) => {
        if (response?.success) {
          log(`${aiType}: 文件上传成功 (${files.length} 个)`, 'success');
        } else {
          log(`${aiType}: 文件上传失败 - ${response?.error || 'Unknown'}`, 'error');
        }
        resolve(response);
      }
    );
  });
}
