# LNPixels Platform Overview

LNPixels is a public collaborative pixel-art canvas funded by Lightning payments.

- Canvas: infinite grid, pan/zoom UI
- Selection: single pixel or rectangle (max 1000 pixels per bulk op)
- Pixel types:
  - Basic: 21 sats, no color/letter
  - Color: 42 sats, hex color only
  - Letter: 100 sats, hex color + single character/emoji
- Pricing: existing pixels cost 2x last paid (min base price)
- Bulk: one color for all, optional letters string L→R, T→B, one invoice
- Realtime: WebSocket broadcast of updates and activity
- Payments: Invoice via NakaPay; confirmation via webhook; instant canvas update
- Privacy: no accounts, no PII; localStorage only for prefs
- Monetization: fees only; direct Lightning payments to server wallet
