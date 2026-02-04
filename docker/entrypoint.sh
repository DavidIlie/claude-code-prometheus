#!/bin/sh
set -e

echo "🚀 Starting Claude Usage Tracker..."

# Ensure data directory exists and has correct permissions
mkdir -p /app/data

# Prisma client is pre-generated during build, just run migrations
# Use the prisma binary from node_modules
export PRISMA_CLI_BINARY_TARGETS="native,linux-musl-openssl-3.0.x,linux-musl-arm64-openssl-3.0.x"

echo "📦 Running database migrations..."
./node_modules/.bin/prisma migrate deploy --schema=/app/prisma/schema.prisma 2>/dev/null || {
    echo "⚠️  No migrations found, pushing schema directly..."
    ./node_modules/.bin/prisma db push --schema=/app/prisma/schema.prisma --accept-data-loss --skip-generate
}

echo "✅ Database ready!"

# Start the application using Node.js HTTP adapter for TanStack Start
echo "🌐 Starting server on port ${PORT:-3000}..."
exec node start-server.js
