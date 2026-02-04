#!/bin/sh
set -e

echo "🚀 Starting Claude Usage Tracker..."

# Ensure data directory exists and has correct permissions
mkdir -p /app/data

# Run database migrations using npx (downloads prisma to local cache)
export npm_config_cache=/app/.npm
echo "📦 Generating Prisma client..."
npx prisma@6.2.1 generate --schema=/app/prisma/schema.prisma

echo "📦 Running database migrations..."
npx prisma@6.2.1 migrate deploy --schema=/app/prisma/schema.prisma 2>/dev/null || {
    echo "⚠️  No migrations found, pushing schema directly..."
    npx prisma@6.2.1 db push --schema=/app/prisma/schema.prisma --accept-data-loss --skip-generate
}

echo "✅ Database ready!"

# Start the application using Node.js HTTP adapter for TanStack Start
echo "🌐 Starting server on port ${PORT:-3000}..."
exec node start-server.js
