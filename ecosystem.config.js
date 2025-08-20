module.exports = {
  apps: [
    {
      name: 'judy-seide-server',
      script: './dist/server.js',
      args: 'start',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
