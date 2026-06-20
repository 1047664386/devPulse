// Production-only Prisma config (plain JS, no ts-node/dotenv needed)
// DATABASE_URL is already set via docker-compose environment
const { defineConfig } = require("prisma/config");

module.exports = defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
