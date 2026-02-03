#!/bin/sh
set -e

echo "🚀 Starting Claude Usage Tracker..."

# Ensure data directory exists and has correct permissions
mkdir -p /app/data

# Run database migrations using local prisma (not npx which fetches latest)
echo "📦 Running database migrations..."
./apps/server/node_modules/.bin/prisma migrate deploy --schema=/app/prisma/schema.prisma 2>/dev/null || {
    echo "⚠️  No migrations found, pushing schema directly..."
    ./apps/server/node_modules/.bin/prisma db push --schema=/app/prisma/schema.prisma --accept-data-loss
}

echo "✅ Database ready!"

# Start the application
echo "🌐 Starting server on port ${PORT:-3000}..."
exec node dist/server/server.js
