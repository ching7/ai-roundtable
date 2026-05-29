// AI Panel - Gemini Content Script

(function() {
  'use strict';

  // Idempotency: on-demand injection (background.js sendToContentScript)
  // may re-run this IIFE in a tab where it already loaded. Without this
  // guard, we would register chrome.runtime.onMessage twice and process
  // every incoming message in duplicate.
  if (window.__AI_PANEL_CONTENT_SCRIPT_LOADED__) return;
  window.__AI_PANEL_CONTENT_SCRIPT_LOADED__ = true;

  const AI_TYPE = 'gemini';

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
      console.log('[AI Panel] Gemini received INJECT_FILES message, files:', message.files?.length);
      injectFiles(message.files)
        .then(() => {
          console.log('[AI Panel] Gemini injectFiles completed successfully');
          sendResponse({ success: true });
        })
        .catch(err => {
          console.log('[AI Panel] Gemini injectFiles failed:', err.message);
          sendResponse({ success: false, error: err.message });
        });
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
    // After a previous response, Gemini's send control briefly stays the "stop
    // generating" button and the editor re-initializes. Sending now would click
    // the stop button (or hit a not-yet-ready editor) and nothing gets sent — so
    // wait for the previous generation to finish, then let the editor settle.
    // This is what makes back-to-back messages (e.g. role roundtable) reliable.
    await waitForSendReady();
    await sleep(700);

    // Gemini uses a rich text editor (contenteditable or textarea)
    const inputSelectors = [
      '.ql-editor',
      'div[contenteditable="true"]',
      'rich-textarea textarea',
      'textarea[aria-label*="prompt"]',
      'textarea[placeholder*="Enter"]',
      '.input-area textarea',
      'textarea'
    ];

    let inputEl = null;
    for (const selector of inputSelectors) {
      inputEl = document.querySelector(selector);
      if (inputEl && isVisible(inputEl)) break;
    }

    if (!inputEl) {
      throw new Error('Could not find input field');
    }

    // Focus the input
    inputEl.focus();

    // Handle different input types
    if (inputEl.tagName === 'TEXTAREA') {
      inputEl.value = text;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // Contenteditable div (Quill editor or similar)
      inputEl.innerHTML = `<p>${escapeHtml(text)}</p>`;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Small delay to let the UI process
    await sleep(150);

    // Find and click the send button
    const sendButton = findSendButton();
    if (sendButton) {
      await waitForButtonEnabled(sendButton);
      sendButton.click();
      console.log('[AI Panel] Gemini message sent via button click');
    } else {
      // Fallback: Gemini's input sends on Enter. Avoids clicking the
      // wrong toolbar button (e.g. the "+" attach button) when the send
      // button can't be confidently identified.
      console.log('[AI Panel] Gemini send button not found, falling back to Enter key');
      const kbdInit = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
      inputEl.dispatchEvent(new KeyboardEvent('keydown', kbdInit));
      inputEl.dispatchEvent(new KeyboardEvent('keypress', kbdInit));
      inputEl.dispatchEvent(new KeyboardEvent('keyup', kbdInit));
    }

    // Start capturing response after sending
    console.log('[AI Panel] Gemini message sent, starting response capture...');
    waitForStreamingComplete();

    return true;
  }

  // aria-label patterns of buttons we must NEVER click as the "send" button.
  // Gemini's input toolbar holds an "Add file" / "+" button on the LEFT;
  // a buggy fallback used to pick it up and trigger the file picker.
  const ATTACH_LABEL_RE = /add|attach|upload|file|image|photo|audio|microphone|\bmic\b|camera|gallery|drive|上传|添加|附件|文件|图片|照片|麦克风|相机/i;

  function looksLikeAttachButton(btn) {
    const aria = btn.getAttribute('aria-label') || '';
    return ATTACH_LABEL_RE.test(aria);
  }

  function findSendButton() {
    // Named-selector fast path. Covers English/Chinese aria-labels and
    // common test-id conventions. We still validate the match isn't an
    // attach button before returning.
    const namedSelectors = [
      'button[aria-label*="Send" i]',
      'button[aria-label*="发送"]',
      'button[data-test-id*="send" i]',
      'button[data-testid*="send" i]',
      'button.send-button',
      'button mat-icon[data-mat-icon-name="send"]',
      'form button[type="submit"]'
    ];

    for (const selector of namedSelectors) {
      try {
        const el = document.querySelector(selector);
        if (!el) continue;
        const btn = el.closest('button') || el;
        if (isVisible(btn) && !looksLikeAttachButton(btn)) return btn;
      } catch (e) {
        // ignore unsupported selectors and continue
      }
    }

    // Fallback: anchor to the input row and pick the rightmost icon-only
    // button with no text. This mirrors the strategy that fixed the same
    // class of bug in DeepSeek (commits 83eb177, 8b2e76f).
    const inputEl = document.querySelector(
      '.ql-editor, rich-textarea textarea, ' +
      'textarea[aria-label*="prompt" i], textarea[placeholder*="Enter" i], ' +
      'div[contenteditable="true"], textarea'
    );
    const inputRect = inputEl ? inputEl.getBoundingClientRect() : null;

    const all = document.querySelectorAll('button, [role="button"]');
    let best = null;
    let bestRight = -Infinity;
    for (const el of all) {
      if (!el.querySelector('svg, mat-icon')) continue;
      const text = (el.textContent || '').trim();
      if (text.length > 0) continue;
      if (!isVisible(el)) continue;
      if (looksLikeAttachButton(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (inputRect) {
        const withinInputRow = rect.top >= inputRect.top - 20 &&
                               rect.top <= inputRect.bottom + 120;
        if (!withinInputRow) continue;
      } else if (rect.bottom < window.innerHeight - 200) {
        continue;
      }
      if (rect.right > bestRight) {
        best = el;
        bestRight = rect.right;
      }
    }

    if (best) {
      console.log('[AI Panel] Gemini findSendButton: picked right=', Math.round(bestRight));
    } else {
      console.log('[AI Panel] Gemini findSendButton: no candidate');
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

  // While Gemini is generating, the send control is a "stop" button. Detecting
  // it lets us (a) avoid capturing a half-finished response and (b) avoid
  // sending the next message onto the stop button.
  function findStopButton() {
    const selectors = [
      'button[aria-label*="Stop" i]',
      'button[aria-label*="停止"]',
      'button[aria-label*="stop response" i]',
      'mat-icon[data-mat-icon-name="stop"]'
    ];
    for (const selector of selectors) {
      try {
        const el = document.querySelector(selector);
        if (el && isVisible(el)) return el.closest('button') || el;
      } catch (e) {
        // ignore unsupported selectors
      }
    }
    return null;
  }

  // Wait until Gemini has finished the previous generation (no stop button),
  // so the next send lands on the real send button and a ready editor.
  async function waitForSendReady(maxWait = 12000) {
    const start = Date.now();
    while (findStopButton() && Date.now() - start < maxWait) {
      await sleep(200);
    }
  }

  function setupResponseObserver() {
    const observer = new MutationObserver((mutations) => {
      // Check context validity in observer callback
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
      const mainContent = document.querySelector('main, .conversation-container') || document.body;
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
  let isCapturing = false;  // Prevent multiple captures

  function checkForResponse(node) {
    // Skip if already capturing
    if (isCapturing) return;

    // Check if this node or its children contain a model response
    const isResponse = node.matches?.('.model-response-text, message-content') ||
                      node.querySelector?.('.model-response-text, message-content') ||
                      node.classList?.contains('model-response-text');

    if (isResponse) {
      console.log('[AI Panel] Gemini detected new response, waiting for completion...');
      waitForStreamingComplete();
    }
  }

  async function waitForStreamingComplete() {
    // Prevent multiple simultaneous captures
    if (isCapturing) {
      console.log('[AI Panel] Gemini already capturing, skipping...');
      return;
    }
    isCapturing = true;

    let previousContent = '';
    let stableCount = 0;
    const maxWait = 600000;  // 10 minutes - AI responses can be very long
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

        const currentContent = getLatestResponse() || '';

        // Require NEW content (≠ already-captured) so a back-to-back message to
        // the same tab waits for the new answer instead of "completing" on the
        // still-visible previous one (which orphaned the new response's capture).
        if (currentContent === previousContent && currentContent.length > 0 && currentContent !== lastCapturedContent) {
          stableCount++;
          if (stableCount >= stableThreshold) {
            lastCapturedContent = currentContent;
            safeSendMessage({
              type: 'RESPONSE_CAPTURED',
              aiType: AI_TYPE,
              content: currentContent
            });
            console.log('[AI Panel] Gemini response captured, length:', currentContent.length);
            return;
          }
        } else {
          stableCount = 0;
        }

        previousContent = currentContent;
      }
    } finally {
      isCapturing = false;
    }
  }

  function getLatestResponse() {
    // Gemini uses .model-response-text for AI responses
    const messages = document.querySelectorAll('.model-response-text');

    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      // Use innerText to preserve line breaks
      const content = lastMessage.innerText.trim();
      console.log('[AI Panel] Gemini response found, length:', content.length);
      return content;
    }

    // Fallback to message-content
    const fallback = document.querySelectorAll('message-content');
    if (fallback.length > 0) {
      const lastMessage = fallback[fallback.length - 1];
      const content = lastMessage.innerText.trim();
      console.log('[AI Panel] Gemini response (fallback), length:', content.length);
      return content;
    }

    console.log('[AI Panel] Gemini: no response found');
    return null;
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
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0';
  }

  // File injection for Gemini
  // Note: Gemini has strict security measures and may not support programmatic file upload
  async function injectFiles(filesData) {
    console.log('[AI Panel] Gemini injecting files:', filesData.length);

    // Convert base64 to File objects
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

    // Find all file inputs
    const fileInputs = document.querySelectorAll('input[type="file"]');
    console.log('[AI Panel] Gemini found', fileInputs.length, 'file inputs');

    if (fileInputs.length === 0) {
      // Try to find and click the upload button to reveal file input
      const uploadButtonSelectors = [
        'button[aria-label*="Upload"]',
        'button[aria-label*="upload"]',
        'button[aria-label*="Add"]',
        'button[aria-label*="Attach"]',
        'button[aria-label*="image"]',
        'button[aria-label*="file"]'
      ];

      for (const selector of uploadButtonSelectors) {
        const btn = document.querySelector(selector);
        if (btn && isVisible(btn)) {
          console.log('[AI Panel] Gemini found upload button:', selector);
          btn.click();
          await sleep(500);
          break;
        }
      }
    }

    // Try again after clicking button
    const allInputs = document.querySelectorAll('input[type="file"]');
    console.log('[AI Panel] Gemini file inputs after button click:', allInputs.length);

    for (const fileInput of allInputs) {
      try {
        const dataTransfer = new DataTransfer();
        files.forEach(file => dataTransfer.items.add(file));
        fileInput.files = dataTransfer.files;

        // Dispatch events
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        fileInput.dispatchEvent(new Event('input', { bubbles: true }));

        console.log('[AI Panel] Gemini files set on input');
        await sleep(1000);

        // Check if upload was successful by looking for any new UI elements
        return true;
      } catch (e) {
        console.log('[AI Panel] Gemini input injection error:', e.message);
      }
    }

    // Gemini doesn't support programmatic file upload well
    // Return error with helpful message
    throw new Error('Gemini 暂不支持自动文件上传，请手动上传文件');
  }

  console.log('[AI Panel] Gemini content script loaded');
})();
