#!/bin/sh
set -e

echo "🚀 Starting Claude Usage Tracker..."

# Ensure data directory exists and has correct permissions
mkdir -p /app/data

# Run database migrations using globally installed prisma
echo "📦 Generating Prisma client..."
prisma generate --schema=/app/prisma/schema.prisma

echo "📦 Running database migrations..."
prisma migrate deploy --schema=/app/prisma/schema.prisma 2>/dev/null || {
    echo "⚠️  No migrations found, pushing schema directly..."
    prisma db push --schema=/app/prisma/schema.prisma --accept-data-loss --skip-generate
}

echo "✅ Database ready!"

# Start the application using Node.js HTTP adapter for TanStack Start
echo "🌐 Starting server on port ${PORT:-3000}..."
exec node start-server.js
