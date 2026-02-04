#!/bin/sh
set -e

echo "🚀 Starting Claude Usage Tracker..."

# Ensure data directory exists and has correct permissions
mkdir -p /app/data

# Fix CSS hash mismatch by creating symlinks for any missing assets
# The server and client builds may have different hashes for CSS files
cd /app/dist/client/assets
for css in *.css; do
  if [ -f "$css" ]; then
    # Check if any server reference points to a different CSS file
    SERVER_CSS=$(grep -roh 'styles-[^"]*\.css' /app/dist/server/ 2>/dev/null | head -1 || true)
    if [ -n "$SERVER_CSS" ] && [ "$SERVER_CSS" != "$css" ] && [ ! -f "$SERVER_CSS" ]; then
      echo "📝 Creating symlink: $SERVER_CSS -> $css"
      ln -sf "$css" "$SERVER_CSS"
    fi
  fi
done
cd /app

# Database initialization is handled by the application on startup
# Prisma client is pre-generated during build with multi-arch support
echo "✅ Starting server..."

# Start the application using Node.js HTTP adapter for TanStack Start
echo "🌐 Starting server on port ${PORT:-3000}..."
exec node start-server.js
