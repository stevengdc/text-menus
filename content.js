(() => {
  if (window.__menusDeTextoLoadedV110) return;
  window.__menusDeTextoLoadedV110 = true;

  let lastEditable = null;
  let lastRange = null;

  const isTextInput = el => el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement && /^(text|search|url|tel|email|password)$/i.test(el.type));

  function editableRoot(el) {
    if (!el) return null;
    if (isTextInput(el)) return el;
    if (el instanceof Element) {
      const root = el.closest('[contenteditable="true"],[contenteditable="plaintext-only"]');
      if (root) return root;
    }
    if (el instanceof HTMLElement && el.isContentEditable) return el;
    return null;
  }

  function remember(el) {
    const root = editableRoot(el || document.activeElement);
    if (root) lastEditable = root;
    const sel = window.getSelection();
    if (sel && sel.rangeCount && lastEditable && !isTextInput(lastEditable)) {
      const r = sel.getRangeAt(0);
      if (lastEditable.contains(r.commonAncestorContainer)) lastRange = r.cloneRange();
    }
  }

  document.addEventListener('focusin', e => remember(e.target), true);
  document.addEventListener('selectionchange', () => remember(), true);
  document.addEventListener('contextmenu', e => remember(e.target), true);

  function looksLikeHTML(value) {
    if (typeof value !== 'string' || !value.includes('<')) return false;
    const t = document.createElement('template');
    t.innerHTML = value.trim();
    return [...t.content.childNodes].some(n => n.nodeType === Node.ELEMENT_NODE);
  }

  function htmlToText(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    return t.content.textContent || '';
  }

  function insertInput(el, value) {
    const text = looksLikeHTML(value) ? htmlToText(value) : value;
    el.focus();
    const start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
    const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : start;
    const next = el.value.slice(0,start) + text + el.value.slice(end);
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value')?.set;
    if (setter) setter.call(el,next); else el.value = next;
    el.setSelectionRange?.(start + text.length, start + text.length);
    el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function restoreRange(el) {
    const sel = window.getSelection();
    if (!sel) return null;
    if (lastRange && el.contains(lastRange.commonAncestorContainer)) {
      sel.removeAllRanges(); sel.addRange(lastRange); return lastRange;
    }
    if (sel.rangeCount && el.contains(sel.getRangeAt(0).commonAncestorContainer)) return sel.getRangeAt(0);
    const r = document.createRange();
    r.selectNodeContents(el); r.collapse(false);
    sel.removeAllRanges(); sel.addRange(r); return r;
  }

  function rangeInsert(el, value, html) {
    const sel = window.getSelection();
    const r = restoreRange(el);
    if (!sel || !r) return false;
    r.deleteContents();
    let last;
    if (html) {
      const frag = r.createContextualFragment(value);
      last = frag.lastChild;
      r.insertNode(frag);
    } else {
      last = document.createTextNode(value);
      r.insertNode(last);
    }
    if (last) {
      const after = document.createRange();
      after.setStartAfter(last); after.collapse(true);
      sel.removeAllRanges(); sel.addRange(after); lastRange = after.cloneRange();
    }
    return true;
  }

  function insertRich(el, value) {
    el.focus(); restoreRange(el);
    const html = looksLikeHTML(value);
    let ok = false;
    try { ok = document.execCommand(html ? 'insertHTML' : 'insertText', false, value); } catch {}
    if (!ok) ok = rangeInsert(el,value,html);
    if (ok) {
      try {
        el.dispatchEvent(new InputEvent('input',{
          bubbles:true, composed:true, inputType: html ? 'insertFromPaste' : 'insertText', data: html ? null : value
        }));
      } catch { el.dispatchEvent(new Event('input',{bubbles:true,composed:true})); }
      el.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
      remember(el);
    }
  }

  async function insert(value) {
    let el = editableRoot(lastEditable);
    if (!el || !document.contains(el)) el = editableRoot(document.activeElement);
    if (!el && document.body?.isContentEditable) el = document.body;
    if (!el) {
      try { await navigator.clipboard.writeText(value); } catch {}
      return;
    }
    if (isTextInput(el)) insertInput(el,value); else insertRich(el,value);
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'INSERT_TEXT') insert(String(message.text ?? ''));
  });
})();
