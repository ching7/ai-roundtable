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
    if (sendButton) {
      await waitForButtonEnabled(sendButton);
      sendButton.click();
      console.log('[AI Panel] DeepSeek message sent via button click');
    } else {
      // Fallback: most chat UIs submit on Enter. This also covers cases
      // where findSendButton can't identify a button in novel layouts
      // (e.g. modals open, toolbar reshuffled).
      console.log('[AI Panel] DeepSeek send button not found, falling back to Enter key');
      const kbdInit = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
      inputEl.dispatchEvent(new KeyboardEvent('keydown', kbdInit));
      inputEl.dispatchEvent(new KeyboardEvent('keypress', kbdInit));
      inputEl.dispatchEvent(new KeyboardEvent('keyup', kbdInit));
    }

    console.log('[AI Panel] DeepSeek starting response capture...');
    waitForStreamingComplete();

    return true;
  }

  function findSendButton() {
    // Named-selector fast path (in case DeepSeek adds labels later).
    const selectors = [
      'button[aria-label*="Send" i]',
      'button[aria-label*="发送"]',
      'button[data-testid*="send" i]',
      'form button[type="submit"]'
    ];

    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el) return el.closest('button') || el;
      } catch (e) {
        // ignore and continue
      }
    }

    // DeepSeek uses <div role="button"> with no aria-label / data-testid.
    // The send button is the rightmost icon-only button either inside the
    // input's vertical span (home screen, small input) or just below it
    // (conversation screen where the textarea auto-grows when holding a
    // long /mutual prompt — observed input height up to ~336px).
    const inputEl = document.querySelector(
      'textarea[placeholder*="DeepSeek" i], textarea#chat-input, ' +
      'textarea[placeholder*="message" i], ' +
      'div[contenteditable="true"][role="textbox"], ' +
      'div[contenteditable="true"], textarea'
    );
    const inputRect = inputEl ? inputEl.getBoundingClientRect() : null;

    const all = document.querySelectorAll('button, [role="button"]');
    let best = null;
    let bestRight = -Infinity;
    const skipLog = [];
    for (const el of all) {
      const rect = el.getBoundingClientRect();
      const text = (el.textContent || '').trim();
      let skip = null;
      if (!el.querySelector('svg')) skip = 'no-svg';
      else if (text.length > 0) skip = `has-text:${text.slice(0, 10)}`;
      else if (!isVisible(el)) skip = 'not-visible';
      else if (rect.width === 0 || rect.height === 0) skip = 'zero-size';
      else if (inputRect) {
        // Accept if button's top is within the input's vertical span,
        // or within 100 px below the input's bottom.
        const withinInputRow = rect.top >= inputRect.top - 20 &&
                               rect.top <= inputRect.bottom + 100;
        if (!withinInputRow) {
          skip = `out-of-row top=${Math.round(rect.top)} inputTop=${Math.round(inputRect.top)} inputBottom=${Math.round(inputRect.bottom)}`;
        }
      } else if (rect.top < 80) {
        skip = `top-header top=${Math.round(rect.top)}`;
      }

      if (skip) {
        skipLog.push({ top: Math.round(rect.top), right: Math.round(rect.right), skip });
        continue;
      }
      if (rect.right > bestRight) {
        best = el;
        bestRight = rect.right;
      }
    }

    if (!best) {
      console.log('[AI Panel] DeepSeek findSendButton: no candidate. inputRect=',
        inputRect ? `${Math.round(inputRect.top)}-${Math.round(inputRect.bottom)}` : null);
      console.table(skipLog);
    } else {
      console.log('[AI Panel] DeepSeek findSendButton: picked right=', bestRight);
    }
    return best;
  }

  async function waitForButtonEnabled(button, maxWait = 2000) {
    const start = Date.now();
    const isDisabled = () =>
      !!button.disabled ||
      button.getAttribute('aria-disabled') === 'true';
    while (isDisabled() && Date.now() - start < maxWait) {
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

  console.log('[AI Panel] DeepSeek content script loaded (2026-04-24 r4)');
})();
