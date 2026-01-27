## 2024-05-23 - Game UI Accessibility
**Learning:** Game interfaces often use visual-only `div`s for critical stats (Health, XP), completely bypassing semantic HTML.
**Action:** Always check "bar" visualizations and enforce `role="progressbar"` with explicit ARIA values, even in canvas-heavy games.
