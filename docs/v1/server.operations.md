# Server Operations & Survival

- Goal: sustain $3/month for VPS; uptime = survival
- Health: monitor webhook confirmations and WS broadcast
- Troubleshooting:
  - Wallet connection issues → verify Lightning service and invoice status
  - QR code scanning → ensure high contrast and adequate size
  - Canvas load failures → refresh; check network; retry WS connection
  - Bulk selection errors → ensure rectangle <= 1000 pixels
- Performance: viewport-based rendering; sparse pixel fetch; SQLite indexing
