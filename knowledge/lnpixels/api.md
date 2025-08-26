# API Endpoints

- GET /api/pixels: fetch rectangle of set pixels
- POST /api/invoices: create invoice for a single pixel
- POST /api/invoices/bulk: create invoice for rectangle selection
- GET /api/activity: recent purchases

# WebSocket Events

- pixel.update: individual pixel changes
- activity.append: purchase notifications
- payment.confirmed: payment success
