// NAME: km28 ▸ LyricTranslate
// AUTHOR: kilomaster28
// DESCRIPTION: Right-click a lyric line to swap that phrase in-place to English. Right-click again to revert. Works with any lyrics plugin.

(function LyricTranslate() {
  const MAX_CHARS = 200;

  function log(...a) { console.log("[LyricTranslate]", ...a); }
  function notify(msg) { try { Spicetify?.showNotification?.(msg); } catch {} }

  log("loaded v6");
  setTimeout(() => notify("km28 LyricTranslate v6 loaded — right-click a lyric"), 2500);

  function isLineLike(text) {
    if (!text) return false;
    text = text.trim();
    return text.length >= 2 && text.length <= MAX_CHARS && text.split("\n").length <= 2;
  }

  function isChunkLike(text) {
    if (!text) return false;
    text = text.trim();
    return text.length >= 2 && text.length <= 400 && text.split("\n").length <= 4;
  }

  function textOf(el) { return ((el && (el.innerText || el.textContent)) || "").trim(); }

  // A grouping container (verse/panel) holds multiple sub-line blocks.
  // Translating it would swallow several lines, so refuse: without a
  // precise child hit there is no single line to translate.
  function isGroupingContainer(elm) {
    try {
      const kids = [...((elm && elm.children) || [])].filter(
        (k) => k?.tagName && isBlock(k) && textOf(k).length >= 2
      );
      return kids.length >= 2;
    } catch { return false; }
  }

  function childUnderPoint(elm, x, y) {
    try {
      const under = [...((elm && elm.children) || [])].filter((k) => {
        try {
          const r = k.getBoundingClientRect?.();
          if (!r) return false;
          return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
        } catch { return false; }
      });
      return under.length ? under[under.length - 1] : null;
    } catch { return null; }
  }


  function displayOf(el) {
    try {
      const d = window.getComputedStyle?.(el)?.display;
      if (d) return d;
    } catch {}
    const t = el.tagName || "";
    return ["DIV", "P", "LI", "UL", "OL", "SECTION", "ARTICLE", "H1", "H2", "H3", "H4", "BLOCKQUOTE"].includes(t)
      ? "block"
      : "inline";
  }

  function isBlock(el) {
    const d = displayOf(el);
    return d !== "inline" && !d.startsWith("inline-") && d !== "contents";
  }

  // Word-by-word karaoke markup wraps each word in its own span.
  // Right-click lands on the word, so promote inline fragments to the
  // nearest structural block (the lyric line) and STOP there — never
  // climb block-to-block, which is what overshot into verse containers.
  function climbToLine(el) {
    if (!el || el === document.body) return el;
    if (!isBlock(el)) {
      let p = el.parentElement, line = null;
      while (p && p !== document.body) {
        if (p.closest?.("textarea, input, [contenteditable]")) break;
        if (isBlock(p)) { line = p; break; }
        p = p.parentElement;
      }
      if (!line) return el;
      const t = textOf(line);
      // Structural line container: accept it even with decorations
      // (timestamps, translations) up to extended limits.
      if (t.length >= 2 && (isLineLike(t) || (t.length <= 400 && t.split("\n").length <= 4))) return line;
      return el;
    }
    return el;
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
      // If the climbed line doesn't contain the highlight (cross-line
      // selection), prefer the anchor parent when it does.
      const anchorParent = sel.anchorNode.parentElement;
      const line = climbToLine(anchorParent);
      const el = textOf(line).includes(selText)
        ? line
        : textOf(anchorParent).includes(selText)
          ? anchorParent
          : line;
      return { el, phrase: selText.slice(0, MAX_CHARS), fromSelection: true };
    }
    // 2) No highlight: deepest small element under cursor, climbed to the full line.
    // A small grouping container hit (click in a gap) is narrowed to the
    // precise child under the cursor; with no child hit there is no line.
    const deep = deepestSmallAtPoint(e.clientX, e.clientY);
    if (deep) {
      let target = deep;
      if (isGroupingContainer(deep)) {
        const precise = childUnderPoint(deep, e.clientX, e.clientY);
        if (!precise) return null;
        target = precise;
      }
      const line = climbToLine(target);
      // Slice to chunk limits (not line limits) so decorated lines
      // are translated whole, never truncated mid-line.
      const t = textOf(line).slice(0, 400);
      return { el: line, phrase: t, fromSelection: false };
    }
    // 3) Fallback (elementsFromPoint missing): start from e.target.
    // If markup sets pointer-events:none on words, the target may be a
    // container, so descend geometrically to the deepest child under
    // the cursor, then promote fragments to their line.
    let el = e.target;
    try {
      if (el?.getBoundingClientRect) {
        let guard = 0;
        while (guard++ < 8 && el?.children?.length) {
          const under = [...el.children].filter((k) => {
            try {
              const r = k.getBoundingClientRect?.();
              if (!r) return false;
              return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
            } catch { return false; }
          });
          if (!under.length) break;
          el = under[under.length - 1];
        }
      }
    } catch {}
    if (!el) return null;
    const t0 = textOf(el);
    if (isLineLike(t0) || isChunkLike(t0)) {
      // Refuse grouping containers: without a precise child hit there
      // is no single line (translating here would swallow the panel).
      if (isGroupingContainer(el)) return null;
      const line = climbToLine(el);
      return { el: line, phrase: textOf(line).slice(0, 400), fromSelection: false };
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

  // Shift+Right-click = debug: copies the ancestor chain of the clicked
  // node to the clipboard so the exact lyric DOM can be inspected.
  async function handleRightClick(e) {
    if (e.shiftKey) {
      e.preventDefault();
      e.stopPropagation?.();
      try {
        const rows = [];
        let anc = e.target;
        for (let i = 0; i < 9 && anc && anc !== document.body; i++) {
          const tag = anc.tagName || "?";
          const cls = (anc.className?.toString?.() || "").trim().split(/\s+/).slice(0, 4).join(".");
          const testid = anc.getAttribute?.("data-testid") || "";
          const t = (anc.innerText || anc.textContent || "").trim().replace(/\s+/g, " ").slice(0, 90);
          rows.push(`${i}: <${tag}> class="${cls}" testid="${testid}" len=${t.length} "${t}"`);
          anc = anc.parentElement;
        }
        const dump = `LYRIC-DOM @(${e.clientX},${e.clientY})\n` + rows.join("\n");
        await navigator.clipboard.writeText(dump);
        log(dump);
        notify("DOM chain copied — paste it to km28");
      } catch (err) {
        notify("debug failed: " + (err.message || err));
      }
      window.getSelection?.()?.removeAllRanges?.();
      return;
    }
    if (e.target?.closest?.("textarea, input, [contenteditable]")) return;

    let picked = null;
    try {
      picked = pickLineEl(e);
    } catch (err) {
      log("pick error:", err.message);
      return;
    }
    // Silent ignore when not on a lyric line — leaves Spotify menu + playback untouched (no lag).
    // Selections must be line-sized; plain clicks may be line- or chunk-sized
    // (decorated lines with timestamps/translations).
    if (!picked) return;
    const phraseOk = picked.fromSelection
      ? isLineLike(picked.phrase)
      : isLineLike(picked.phrase) || isChunkLike(picked.phrase);
    if (!phraseOk) return;

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
