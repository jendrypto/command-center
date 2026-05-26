# Running Command Center with Hermes Agent

A reference setup for wiring [Hermes Agent](https://hermes-agent.nousresearch.com/docs/) to Command Center. This mirrors the OpenClaw setup: register the MCP server, add Command Center guidance to the agent workspace, then schedule daily/weekly maintenance jobs.

## Prerequisites

- Command Center is cloned, configured, and running on `http://localhost:3005`.
- Hermes is installed and reachable from the command line (`hermes --version` works).
- The MCP server is built from the Command Center repo root:

```bash
npm run mcp:build
```

## Install

```bash
./examples/hermes/install-mcp.sh
./examples/hermes/install-daily-triage.sh
./examples/hermes/install-weekly-consolidation.sh
```

Then paste the snippet files into the Hermes workspace context you use for your agent:

- `AGENTS.md.snippet` -> append to `~/.hermes/workspace/AGENTS.md` or the project/workspace `AGENTS.md` that Hermes loads.
- `TOOLS.md.snippet` -> append to `~/.hermes/workspace/TOOLS.md` or equivalent tool guidance.

These are overlays. Keep your existing persona, memory, and platform rules.

## What The Scripts Do

**`install-mcp.sh`** registers the Command Center MCP server with Hermes:

```bash
hermes mcp add command-center \
  --command node \
  --args /abs/path/to/command-center/mcp-server/dist/index.js \
  --env COMMAND_CENTER_URL=http://localhost:3005
```

**`install-daily-triage.sh`** adds a weekday triage job:

```bash
hermes cron create "0 8 * * 1-5" \
  --name "Command Center daily triage" \
  --workdir "/abs/path/to/command-center" \
  "Run a Command Center triage pass..."
```

**`install-weekly-consolidation.sh`** adds a Sunday cleanup job:

```bash
hermes cron create "0 9 * * 0" \
  --name "Command Center weekly consolidation" \
  --workdir "/abs/path/to/command-center" \
  "Run Command Center weekly consolidation..."
```

## Verify

```bash
hermes mcp list
hermes mcp test command-center
hermes cron list
hermes cron run "Command Center daily triage"
```

You should see the two scheduled jobs and a working `command-center` MCP server.

## Uninstall

```bash
hermes cron remove "Command Center daily triage"
hermes cron remove "Command Center weekly consolidation"
hermes mcp remove command-center
```

Then remove the pasted snippets from your workspace files. Command Center itself keeps working; you just lose scheduled agent maintenance.

