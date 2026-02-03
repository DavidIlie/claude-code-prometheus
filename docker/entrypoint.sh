#!/bin/sh
set -e

echo "🚀 Starting Claude Usage Tracker..."

# Ensure data directory exists and has correct permissions
mkdir -p /app/data

# Run database migrations
echo "📦 Running database migrations..."
npx prisma migrate deploy --schema=/app/prisma/schema.prisma 2>/dev/null || {
    echo "⚠️  No migrations found, pushing schema directly..."
    npx prisma db push --schema=/app/prisma/schema.prisma --skip-generate
}

echo "✅ Database ready!"

# Start the application
echo "🌐 Starting server on port ${PORT:-3000}..."
exec node dist/server/server.js
