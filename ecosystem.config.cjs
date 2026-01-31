module.exports = {
  apps: [
    {
      name: "khushbuwaala-backend",
      script: "./dist/src/server.js", // <- correct path
      watch: false,
      env: {
        NODE_ENV: "development",
        PORT: 7302,
        HOST: "0.0.0.0",
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 7302,
        HOST: "0.0.0.0",
      },
    },
  ],
};
