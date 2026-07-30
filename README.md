# cronify

A self-hosted, open-source cron job manager. Create, schedule, run, and monitor
recurring jobs — either HTTP requests or shell commands — from a lightweight
web dashboard, with a full REST API underneath.

## Features

- **Web dashboard** — create, edit, pause/resume, delete, and manually trigger jobs
- **Two job types** — hit an HTTP endpoint (GET) or run a shell command
- **Cron expression validation** — live feedback and next-run preview while typing a schedule
- **Response validation** — assert on expected HTTP status code and/or a keyword in the response body
- **Uptime % and response-time tracking** — per-job uptime badge, average response time, and a mini sparkline chart from recent runs
- **Retries** — configurable per-job retry count on failure
- **Timeouts** — per-job execution timeout
- **Run history** — every execution logged with status, duration, output/error
- **Smart failure alerts** — POST a notification to any webhook URL on failure; auto-formatted for Discord and Slack, or generic JSON for anything else
- **REST API** — full CRUD, independent of the dashboard
- **Optional basic auth** — lock down the dashboard/API with a username and password
- **Docker-ready** — `docker compose up` and you're running
- **Zero external services** — SQLite file storage, no database server required

## Quick start

### Locally

```bash
git clone https://github.com/YOUR_USERNAME/cron-manager.git
cd cron-manager
npm install
cp .env.example .env
npm start
```

Then open `http://localhost:3000`.

### With Docker

```bash
docker compose up -d
```

## Configuration

All configuration is via environment variables (see `.env.example`):

| Variable               | Description                                      | Default                    |
|-------------------------|--------------------------------------------------|-----------------------------|
| `PORT`                  | Port to listen on                                | `3000`                      |
| `DB_PATH`               | Path to the SQLite database file                 | `./data/cron-manager.db`    |
| `FAILURE_WEBHOOK_URLS`  | Comma-separated webhook URL(s) for job failures  | *(none)*                    |
| `BASIC_AUTH_USER`       | Username to protect the dashboard/API            | *(disabled)*                |
| `BASIC_AUTH_PASS`       | Password to protect the dashboard/API            | *(disabled)*                |

## REST API

| Method | Endpoint                     | Description                          |
|--------|-------------------------------|---------------------------------------|
| GET    | `/api/jobs`                   | List all jobs with next-run previews |
| POST   | `/api/jobs`                   | Create a job                         |
| PUT    | `/api/jobs/:id`                | Update a job                         |
| DELETE | `/api/jobs/:id`                | Delete a job                         |
| POST   | `/api/jobs/:id/run`            | Trigger a job immediately            |
| GET    | `/api/jobs/:id/stats`          | Uptime %, avg response time, recent run history |
| POST   | `/api/jobs/validate-schedule` | Validate a cron expression           |
| GET    | `/api/logs?jobId=&limit=`     | List recent run history              |
| GET    | `/api/health`                  | Health check                         |

**Example: create a job**

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ping health check",
    "schedule": "*/5 * * * *",
    "type": "http",
    "target": "https://example.com/health",
    "retries": 2,
    "timeout_ms": 10000
  }'
```

## Cron expression format

Standard 5-field cron syntax:

```
* * * * *
│ │ │ │ │
│ │ │ │ └── day of week (0-7)
│ │ │ └──── month (1-12)
│ │ └────── day of month (1-31)
│ └──────── hour (0-23)
└────────── minute (0-59)
```

## Tech stack

- Node.js + Express
- [node-cron](https://www.npmjs.com/package/node-cron) for scheduling
- [better-sqlite3](https://www.npmjs.com/package/better-sqlite3) for storage
- Vanilla JS dashboard (no build step required)

## Contributing

Issues and pull requests are welcome. Ideas for future features:

- Job dependencies / chaining
- Slack/Discord notification integrations
- Multi-user accounts and permissions
- Log retention/cleanup policy

