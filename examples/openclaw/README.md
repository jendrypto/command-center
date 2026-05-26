# Running Command Center with OpenClaw

A reference setup for wiring your [OpenClaw](https://docs.openclaw.ai) agent to Command Center. Drop-in snippets for your agent's bootstrap files plus install scripts that register the MCP server and schedule the daily/weekly triage cron.

## Prerequisites

- Command Center is cloned, configured, and running on `http://localhost:3005`.
- OpenClaw is installed and reachable from the command line (`openclaw --version` works).
- The MCP server is built: `npm run mcp:build` from the repo root.

## One-time setup

```bash
# From the repo root:
./examples/openclaw/install-mcp.sh
./examples/openclaw/install-daily-triage.sh
./examples/openclaw/install-weekly-consolidation.sh
```

Then paste the three `*.snippet` files into your OpenClaw workspace's `SOUL.md`, `AGENTS.md`, and `TOOLS.md`. These are overlays — append to whatever you already have.

## What the install scripts do

**`install-mcp.sh`** registers the Command Center MCP server with OpenClaw. Equivalent to running:

```bash
openclaw mcp set command-center '{
  "command": "node",
  "args": ["<abs-path>/mcp-server/dist/index.js"],
  "env": { "COMMAND_CENTER_URL": "http://localhost:3005" }
}'
```

**`install-daily-triage.sh`** adds a weekday-morning cron that runs an isolated triage pass:

```bash
openclaw cron add \
  --name "Command Center daily triage" \
  --cron "0 8 * * 1-5" \
  --session isolated \
  --tools command-center \
  --message "Run a Command Center triage pass..."
```

**`install-weekly-consolidation.sh`** adds a Sunday-morning cron that runs cleanup:

```bash
openclaw cron add \
  --name "Command Center weekly consolidation" \
  --cron "0 9 * * 0" \
  --session isolated \
  --tools command-center \
  --message "Run weekly consolidation..."
```

> **Note:** The `--tools command-center` flag is intended to scope the cron job to just this MCP server's tools. If your openclaw build doesn't support per-MCP-server tool scoping, drop the flag — the agent will see all your registered tools, which is harmless, just less clean.

## What the snippets do

**`SOUL.md.snippet`** gives the agent a persona for this role: proactive, defaults to merge/archive, only surfaces exceptions.

**`AGENTS.md.snippet`** explains the workspace contract: the state machine, which tools to call, what "promote" means, and how to close outcome loops.

**`TOOLS.md.snippet`** gives usage guidance for the ten Command Center MCP tools so the agent batches writes, scopes cleanup to weekly, and doesn't run the expensive tools on every pass.

## Verification

After install, check the cron is registered:

```bash
openclaw cron list
```

You should see the two Command Center jobs. Trigger the daily job manually to confirm it works:

```bash
openclaw cron run "Command Center daily triage"
```

Open `http://localhost:3005`. If items were in the workspace, you should see their `reviewed_at` timestamps updated.

## Rollback

```bash
openclaw cron rm "Command Center daily triage"
openclaw cron rm "Command Center weekly consolidation"
openclaw mcp unset command-center
```

Then remove the pasted sections from your workspace's bootstrap files. Command Center itself keeps working (you just lose the scheduled triage).

## Customizing

- **Schedule**: edit the `--cron` value in the install scripts. Default is weekday 8am Pacific and Sunday 9am Pacific.
- **Delivery**: add `--announce --channel slack --to channel:C1234567890` to either install script to pipe the daily digest to a Slack channel.
- **Persona**: edit the `SOUL.md.snippet` before pasting to tune voice, defaults, and edge-case behavior.
