/**
 * ============================================
 * Le Syndicat des Tox - PM2 Ecosystem Config
 * ============================================
 * Process management with PM2
 *
 * Usage:
 *   Start:   pm2 start ecosystem.config.js --env production
 *   Stop:    pm2 stop ecosystem.config.js
 *   Restart: pm2 restart ecosystem.config.js
 *   Reload:  pm2 reload ecosystem.config.js
 *   Logs:    pm2 logs syndicat-tox
 *   Monitor: pm2 monit
 *   Status:  pm2 status
 */

module.exports = {
  apps: [
    {
      // Application configuration
      name: 'syndicat-tox',
      script: './src/server.js',
      cwd: '/var/www/syndicat-tox',

      // Instances (cluster mode)
      instances: 2,
      exec_mode: 'cluster',

      // Auto restart
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',

      // Environment variables
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOST: '127.0.0.1'
      },

      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
        HOST: '127.0.0.1',
        LOG_LEVEL: 'debug'
      },

      // Logging
      log_file: '/var/www/syndicat-tox/logs/pm2-combined.log',
      out_file: '/var/www/syndicat-tox/logs/pm2-out.log',
      error_file: '/var/www/syndicat-tox/logs/pm2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Advanced features
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      shutdown_with_message: true,

      // Restart strategies
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: '10s',

      // Monitoring
      instance_var: 'INSTANCE_ID',

      // Graceful shutdown
      kill_retry_time: 5000
    }
  ],

  // Deployment configuration
  deploy: {
    production: {
      user: 'syndicat',
      host: 'syndicat-tox.be',
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/bonplan.git',
      path: '/var/www/syndicat-tox',
      'post-deploy': 'npm ci --only=production && npm run build && pm2 reload ecosystem.config.js --env production',
      'post-setup': 'npm ci --only=production && npm run build',
      'pre-deploy-local': 'echo "Deploying to production..."',
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};
