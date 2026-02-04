#!/bin/sh
set -e

echo "🚀 Starting Claude Usage Tracker..."

# Ensure data directory exists and has correct permissions
mkdir -p /app/data

# Database initialization is handled by the application on startup
# Prisma client is pre-generated during build with multi-arch support
echo "✅ Starting server..."

# Start the application using Node.js HTTP adapter for TanStack Start
echo "🌐 Starting server on port ${PORT:-3000}..."
exec node start-server.js
