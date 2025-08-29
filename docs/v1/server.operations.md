# Server Operations & Survival

- Goal: sustain $3/month for VPS; uptime = survival
- Health: monitor webhook confirmations and WS broadcast
- **Server Monitoring**: Comprehensive system vital signs tracking

## 🔍 Server Monitoring System

### Monitored Metrics
- **CPU Usage**: Real-time percentage and core utilization
- **Memory Usage**: Total, used, free with utilization percentage
- **Disk Usage**: Storage space and utilization tracking
- **Network I/O**: RX/TX byte monitoring for network activity
- **Process Info**: Total processes, system uptime, load average
- **System Health**: Hostname, OS type, kernel version, system load

### Monitoring Commands
```bash
# Quick status overview
./check-monitor.sh

# Real-time server statistics
node server-monitor.js --once

# View detailed monitoring logs
pm2 logs server-monitor
tail -f server-monitor.log

# Interactive monitoring dashboard
pm2 monit
```

### Monitoring Configuration
- **Update Interval**: 5 seconds
- **Log File**: `server-monitor.log` (JSON format)
- **Auto-restart**: Enabled with PM2 ecosystem
- **Resource Usage**: Lightweight (~50MB memory)
- **Data Retention**: Continuous logging with timestamp tracking

### Health Check Integration
- **PM2 Integration**: Runs as dedicated PM2 service
- **Auto-recovery**: Automatic restart on monitoring failure
- **Alert-ready**: JSON logs suitable for external monitoring systems
- **Historical Data**: Trend analysis for capacity planning

## Troubleshooting

### Application Issues
- Wallet connection issues → verify Lightning service and invoice status
- QR code scanning → ensure high contrast and adequate size
- Canvas load failures → refresh; check network; retry WS connection
- Bulk selection errors → ensure rectangle <= 1000 pixels

### System Monitoring Issues
```bash
# Check if monitoring service is running
pm2 list | grep server-monitor

# Restart monitoring service
pm2 restart server-monitor

# Check monitoring logs for errors
pm2 logs server-monitor --err

# Verify monitoring data collection
tail -5 server-monitor.log

# Test monitoring script directly
node server-monitor.js --once
```

### PM2 Process Issues
```bash
# Check PM2 daemon status
pm2 ping

# Restart all PM2 processes
pm2 restart all

# Reload ecosystem configuration
pm2 reload ecosystem.config.js

# Reset PM2 and restart fresh
pm2 kill
pm2 start ecosystem.config.js
```

## Performance

### Application Performance
- Viewport-based rendering for canvas efficiency
- Sparse pixel fetch to minimize data transfer
- SQLite indexing for fast pixel queries
- WebSocket broadcasting for real-time updates

### System Performance
- **CPU Monitoring**: Track usage patterns and identify bottlenecks
- **Memory Tracking**: Monitor for memory leaks and usage trends
- **Disk Monitoring**: Alert on storage capacity issues
- **Network Monitoring**: Track bandwidth usage and connection health

### Optimization Strategies
- Monitor resource usage trends for capacity planning
- Use historical data to predict scaling needs
- Implement automated alerts for critical thresholds
- Regular log analysis for performance insights
