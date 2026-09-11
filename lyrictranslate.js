// NAME: km28 ▸ LyricTranslate
// AUTHOR: kilomaster28
// DESCRIPTION: Right-click a lyric line to swap that phrase in-place to English. Right-click again to revert. Works with any lyrics plugin.

(function LyricTranslate() {
  const MAX_CHARS = 200;

  function log(...a) { console.log("[LyricTranslate]", ...a); }
  function notify(msg) { try { Spicetify?.showNotification?.(msg); } catch {} }

  log("loaded v4");

  function isLineLike(text) {
    if (!text) return false;
    text = text.trim();
    return text.length >= 2 && text.length <= MAX_CHARS && text.split("\n").length <= 2;
  }

  // Word-by-word karaoke markup wraps each word in its own span.
  // Right-click lands on the word, so climb to the highest ancestor
  // that is still line-sized — that is the full lyric line.
  // The isLineLike cap stops the climb before the whole panel.
  function climbToLine(el) {
    let cur = el;
    while (cur?.parentElement && cur !== document.body) {
      const p = cur.parentElement;
      if (p.closest?.("textarea, input, [contenteditable]")) break;
      const t = (p.innerText || p.textContent || "").trim();
      if (!isLineLike(t)) break;
      cur = p;
    }
    return cur;
  }

  // Most precise: the deepest element under the cursor with line-sized text.
  // Fixes "line too big" where closest() jumped to the whole panel.
  function deepestSmallAtPoint(x, y) {
    try {
      const els = document.elementsFromPoint?.(x, y) || [];
      for (const el of els) {
        if (el.closest?.("textarea, input, [contenteditable]")) continue;
        const t = (el.innerText || el.textContent || "").trim();
        if (isLineLike(t)) return el;
        // elementsFromPoint goes topmost-first, so first small hit is the line
      }
    } catch {}
    return null;
  }

  function pickLineEl(e) {
    // 1) Highlighted phrase = most reliable. Use its container.
    const sel = window.getSelection?.();
    const selText = (sel?.toString() || "").trim();
    if (selText && sel.anchorNode?.parentElement) {
      // Highlighted phrase wins, but anchor on the full line so
      // word-span markup can't shrink the replacement target.
      const line = climbToLine(sel.anchorNode.parentElement);
      return { el: line, phrase: selText.slice(0, MAX_CHARS), fromSelection: true };
    }
    // 2) No highlight: deepest small element under cursor, climbed to the full line.
    const deep = deepestSmallAtPoint(e.clientX, e.clientY);
    if (deep) {
      const line = climbToLine(deep);
      const t = (line.innerText || line.textContent || "").trim().slice(0, MAX_CHARS);
      return { el: line, phrase: t, fromSelection: false };
    }
    // 3) Fallback: e.target itself if line-sized, else walk up max 4 levels for first line-sized box.
    let el = e.target;
    for (let i = 0; i < 4 && el; i++) {
      const t = (el.innerText || el.textContent || "").trim();
      if (isLineLike(t)) return { el, phrase: t.slice(0, MAX_CHARS), fromSelection: false };
      el = el.parentElement;
    }
    return null;
  }

  async function translateMyMemory(text) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=autodetect|en`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("MyMemory HTTP " + res.status);
    const j = await res.json();
    if (j.responseStatus !== 200 || !j.responseData?.translatedText) throw new Error(j.responseDetails || "MyMemory failed");
    const out = j.responseData.translatedText.trim();
    if (/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(out)) throw new Error(out);
    return out;
  }

  async function translateGoogle(text) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Google HTTP " + res.status);
    const j = await res.json();
    const out = j?.[0]?.map((s) => s[0]).join("").trim();
    if (!out) throw new Error("Google empty");
    return out;
  }

  async function translateToEnglish(text) {
    try {
      return await translateMyMemory(text);
    } catch (e1) {
      log("MyMemory failed, trying Google:", e1.message);
      return await translateGoogle(text);
    }
  }

  async function handleRightClick(e) {
    if (e.target?.closest?.("textarea, input, [contenteditable]")) return;

    let picked = null;
    try {
      picked = pickLineEl(e);
    } catch (err) {
      log("pick error:", err.message);
      return;
    }
    // Silent ignore when not on a lyric line — leaves Spotify menu + playback untouched (no lag).
    if (!picked || !isLineLike(picked.phrase)) return;

    const { el: lineEl, phrase, fromSelection } = picked;

    // Toggle back: already translated -> restore original, no network.
    if (lineEl.dataset?.ltTranslated === "1") {
      e.preventDefault();
      e.stopPropagation?.();
      if (lineEl.dataset.ltOriginal) lineEl.innerText = lineEl.dataset.ltOriginal;
      delete lineEl.dataset.ltOriginal;
      delete lineEl.dataset.ltTranslated;
      window.getSelection?.()?.removeAllRanges?.();
      return;
    }

    // Only hijack the menu when we're actually translating one line.
    e.preventDefault();
    e.stopPropagation?.();

    const originalFull = (lineEl.innerText || lineEl.textContent || "").trim();
    try {
      const translated = await translateToEnglish(phrase);
      if (!lineEl.dataset.ltOriginal) lineEl.dataset.ltOriginal = originalFull;
      lineEl.dataset.ltTranslated = "1";
      if (fromSelection && originalFull.includes(phrase)) {
        lineEl.innerText = originalFull.replace(phrase, translated);
      } else {
        lineEl.innerText = translated;
      }
      try { await navigator.clipboard.writeText(translated); } catch {}
      log(`"${phrase}" → "${translated}" (in-place)`);
    } catch (err) {
      log("Translate failed:", err.message || err);
      notify("Translate failed: " + (err.message || err));
    } finally {
      window.getSelection?.()?.removeAllRanges?.();
    }
  }

  document.removeEventListener("contextmenu", handleRightClick, true);
  document.addEventListener("contextmenu", handleRightClick, true);
})();
