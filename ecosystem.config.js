module.exports = {
  apps: [
    {
      name: 'elizaos-pixel-agent',
       script: './start-with-twitter-patch.sh',
      cwd: '/home/ubuntu/elizaos-agent',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
       env: {
         NODE_ENV: 'production',
         PORT: 3002
       },
       env_production: {
         NODE_ENV: 'production',
         PORT: 3002
       },
      error_file: '/home/ubuntu/.pm2/logs/elizaos-pixel-agent-error.log',
      out_file: '/home/ubuntu/.pm2/logs/elizaos-pixel-agent-out.log',
      log_file: '/home/ubuntu/.pm2/logs/elizaos-pixel-agent.log',
      time: true,
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};