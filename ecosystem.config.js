module.exports = {
  apps: [
    {
      name: 'guven-backend',
      cwd: './backend',
      script: 'dist/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'guven-frontend',
      cwd: './packages/web',
      script: 'node_modules/.bin/vite',
      args: 'preview --port 5173 --host',
      instances: 1,
      autorestart: true,
      watch: false,
      env: { NODE_ENV: 'production' },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
    },
  ],
};
