# Claude Code Prometheus

[![Docker](https://img.shields.io/badge/Docker-ghcr.io-blue?style=flat-square&logo=docker)](https://ghcr.io/davidilie/claude-code-prometheus)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

Track Claude Code usage across multiple machines. Exports Prometheus metrics for Grafana dashboards.

Built this because I wanted to see how much I'm actually spending on Claude Code across my devices, and the built-in usage page doesn't cut it when you're running it on multiple machines.

## How it works

```
┌──────────────────────────────────────────────────────────────┐
│  Your machines                                               │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ claude-usage-   │  │ claude-usage-   │                   │
│  │ daemon          │  │ daemon          │  ...              │
│  │                 │  │                 │                   │
│  │ watches ~/.claude/projects/**/*.jsonl                    │
│  └────────┬────────┘  └────────┬────────┘                   │
└───────────┼─────────────────────┼────────────────────────────┘
            │                     │
            └──────────┬──────────┘
                       ▼
┌──────────────────────────────────────────────────────────────┐
│  Server (Docker)                                             │
│                                                              │
│  - Web UI for browsing usage, sessions, costs                │
│  - REST API for daemon data ingestion                        │
│  - Prometheus metrics at /api/metrics                        │
│  - SQLite database (Prisma)                                  │
│  - Optional Redis caching                                    │
│                                                              │
│  :3000                                                       │
└──────────────────────────────────────────────────────────────┘
            │
            ▼
     Prometheus → Grafana
```

The daemon runs on each machine, watches Claude Code's JSONL log files, parses out the usage data (tokens, model, cost), and pushes it to a central server. The server stores everything in SQLite and exposes Prometheus metrics.

## Server

### Deploy with Docker

```bash
docker run -d \
  --name claude-prometheus \
  -p 3000:3000 \
  -v claude-data:/app/data \
  -e SESSION_SECRET=change-this-to-something-random \
  ghcr.io/davidilie/claude-code-prometheus:latest
```

Or with Docker Compose (includes Prometheus + Grafana):

```bash
git clone https://github.com/DavidIlie/claude-code-prometheus.git
cd claude-code-prometheus
cp .env.example .env
# edit .env, set SESSION_SECRET
docker-compose up -d
```

### First run

1. Go to `http://localhost:3000`
2. Setup wizard walks you through creating an admin account and configuring the server
3. Register your first device from the Devices page

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_SECRET` | required | Secret for signing JWT tokens |
| `DATABASE_URL` | `file:./data/db.sqlite` | SQLite database path |
| `PORT` | `3000` | Server port |
| `REDIS_ENABLED` | `false` | Enable Redis caching |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `REDIS_TTL_HOURS` | `24` | Cache TTL |

### Web UI

- **Dashboard** - Total cost, token breakdown, daily trends, device status
- **Devices** - Register devices, manage API keys, copy install commands
- **Sessions** - Browse all sessions with filtering by device/project/date
- **Settings** - Server config, password change, data retention, system status, application logs

## Daemon

The daemon is a Node.js CLI that runs on each machine you want to track.

### Install

```bash
npm install -g @davidilie/claude-usage-daemon
```

### Setup

Interactive setup (registers a new device):
```bash
claude-usage-daemon setup --server https://your-server.com
```

Or if you already have an API key from the web UI:
```bash
claude-usage-daemon setup --server https://your-server.com --key dk_xxxxx
```

### Commands

```bash
claude-usage-daemon start              # Start daemon (backgrounds by default)
claude-usage-daemon start --foreground # Run in foreground
claude-usage-daemon stop               # Stop daemon
claude-usage-daemon restart            # Restart daemon
claude-usage-daemon status             # Show status
claude-usage-daemon status --verbose   # Show status with file paths
claude-usage-daemon logs               # View logs
claude-usage-daemon logs --follow      # Tail logs
claude-usage-daemon logs --errors      # View error log
claude-usage-daemon test               # Test connection to server
claude-usage-daemon reset              # Clear state, re-process all files
claude-usage-daemon reset --config     # Also clear config
claude-usage-daemon install-service    # Install as macOS LaunchAgent
claude-usage-daemon uninstall          # Remove daemon and config
```

### Auto-start on macOS

```bash
claude-usage-daemon install-service
```

This creates a LaunchAgent that starts the daemon on login.

### How it works

1. Watches `~/.claude/projects/**/*.jsonl` for changes
2. Parses new entries from the JSONL files (Claude Code writes usage data here)
3. Extracts token counts, model, timestamps from assistant messages
4. Batches entries and pushes to server every 30 seconds
5. Tracks file positions so it only processes new data after restarts

The daemon handles network failures with exponential backoff and will notify you (system notification) if it can't reach the server after 3 consecutive failures.

## Prometheus Metrics

Available at `/api/metrics`. Here's what's exported:

### Tokens
```
claude_tokens_total{device, type, model, project}     # Counter - total tokens
claude_input_output_ratio{device, model}              # Gauge - input/output ratio
```

### Costs
```
claude_cost_usd_total{device, model, project}         # Counter - accumulated cost
claude_hourly_spend_usd{device}                       # Gauge - rolling hourly rate
claude_daily_spend_usd{device}                        # Gauge - rolling daily rate
claude_cost_per_request_usd{device, model}            # Histogram - cost distribution
```

### Cache
```
claude_cache_savings_usd_total{device}                # Counter - money saved from caching
claude_cache_hit_ratio{device, model}                 # Gauge - cache hit ratio (0-1)
claude_cache_efficiency_percent{device}               # Gauge - percentage saved
```

### Sessions
```
claude_sessions_total{device, project}                # Counter - total sessions
claude_active_sessions{device}                        # Gauge - currently active
claude_session_duration_seconds{device}               # Histogram - duration distribution
```

### Devices
```
claude_device_online{device}                          # Gauge - 1 or 0
claude_device_last_seen_timestamp{device}             # Gauge - unix timestamp
```

## Supported Models

Cost calculation works for these Claude models:

- claude-opus-4-5-20251101
- claude-opus-4-20250514
- claude-sonnet-4-20250514
- claude-sonnet-4-5-20241022
- claude-3-5-sonnet-20241022
- claude-3-5-haiku-20241022
- claude-3-opus-20240229
- claude-3-sonnet-20240229
- claude-3-haiku-20240307

Pricing is fetched from LiteLLM's pricing database and can be updated from the web UI. Cache token pricing (creation vs read) is handled separately.

## Development

```bash
# Install deps
pnpm install

# Generate Prisma client
pnpm --filter server db:generate

# Push schema to SQLite
pnpm --filter server db:push

# Run server in dev mode
pnpm --filter server dev

# Run daemon in dev mode
pnpm --filter daemon dev
```

### Project structure

```
├── apps/
│   ├── server/          # TanStack Start web app
│   │   ├── app/         # Routes and components
│   │   ├── server/      # tRPC routers, lib functions
│   │   └── prisma/      # Database schema
│   └── daemon/          # Node.js CLI daemon
│       └── src/         # Watcher, parser, client
├── packages/
│   └── shared/          # Shared types and Zod schemas
├── docker/
│   └── Dockerfile.server
└── docker-compose.yaml
```

## Security

- **SESSION_SECRET is required** - The server will not start without a properly configured `SESSION_SECRET` environment variable. Generate one with: `openssl rand -base64 32`
- Passwords hashed with bcrypt (cost factor 12)
- JWT tokens for web auth (7-day expiry, auto-login tokens: 30 days)
- API keys for daemon auth (prefix: `dk_`, cryptographically random)
- Rate limiting on login (5 attempts/15min), device registration (10/hour), and API endpoints (60-100/min)
- Optional auto-login for setups behind a proxy with its own auth (e.g., Authelia, Authentik)

### Known Limitations

- Device API keys are stored in plaintext in the database for lookup performance. For maximum security, ensure your database file is properly protected.
- The daemon stores its API key in `~/.config/claude-usage-daemon/config.json`. Ensure appropriate file permissions.

## License

MIT
