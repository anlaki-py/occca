# OCCCA — OpenAI Compatible CLI Coding Agent

A minimal, production-quality agentic coding CLI that uses **any OpenAI-compatible API**. Bring your own provider, API key, and model.

Inspired by the best CLI coding agents, with carefully crafted system prompts and a focused set of essential tools.

## Quick Start

```bash
# Install dependencies
npm install

# Run in preview mode (no build needed)
npm run dev

# Or build and run
npm run build
npm start
```

## Building Static Binaries

OCCCA can be compiled into standalone executables that don't require Node.js to run.

### Prerequisites

- [Bun](https://bun.sh/) installed on your system

### Build Commands

```bash
# Build for current platform (native)
npm run build:static

# Build for specific platforms
npm run build:static:win-x64      # Windows x64
npm run build:static:win-arm64    # Windows ARM64
npm run build:static:linux-x64    # Linux x64
npm run build:static:linux-arm64  # Linux ARM64
```

Binaries are output to `dist/bin/`:
- `occca-win-x64.exe`
- `occca-win-arm64.exe`
- `occca-linux-x64`
- `occca-linux-arm64`

### Cross-Platform Compilation

Bun supports cross-compilation, so you can build for any platform from any OS:

```bash
# Build all 4 platforms from Windows
npm run build:static:win-x64
npm run build:static:win-arm64
npm run build:static:linux-x64
npm run build:static:linux-arm64
```

### GitHub Actions

Pushing to `master` branch automatically triggers a workflow that:
1. Runs tests
2. Builds all 4 platform binaries in parallel
3. Creates a GitHub release with all binaries attached

## Development

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type check
npm run build

# Preview without build
npm run preview
```

## Configuration

OCCCA stores configuration in `~/.occca/`:
- `models.json` — Model profiles (endpoints, API keys, temperature)
- `history` — Persistent command history

### Model Profiles

Manage multiple model configurations:

```
/model              — Show current model info
/model add          — Create a new profile
/model edit         — Edit current profile
/model remove       — Remove a profile
/model <name>       — Quick-switch by name
```

### Environment Variables

- `OPENAI_API_KEY` — Default API key if not set in config

## Tools

OCCCA includes essential tools for coding tasks:

- **Read** — Read file contents
- **Write** — Create or overwrite files
- **Edit** — Make precise edits to existing files
- **Glob** — Find files by pattern
- **Grep** — Search file contents
- **LS** — List directory contents
- **Bash** — Execute shell commands
