# Lyric Translate

Right-click a lyric line → that phrase swaps in-place to English. Right-click again to revert.

- Highlight a phrase + right-click → only that phrase changes
- Right-click a line → whole line changes
- Same color, same font, same everything — just the language
- Works with any lyrics plugin

No API key needed. Uses MyMemory with Google Translate fallback.

## Install manually

```bash
cp lyric-translate.js ~/.config/spicetify/Extensions/
spicetify config extensions lyric-translate.js
spicetify apply
```
