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

## Configuration

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `OPENAI_API_KEY` | Your API key | — |
| `OPENAI_BASE_URL` | Custom API endpoint | `https://api.openai.com/v1` |
| `OCCCA_MODEL` | Model to use | `gpt-4o` |
| `OCCCA_MAX_TOKENS` | Max tokens per response | `16384` |
| `OCCCA_TEMPERATURE` | Sampling temperature | `0` |

### CLI Flags

```bash
occca --model gpt-4o --api-key sk-... --base-url https://api.openai.com/v1
```

### Using Custom Providers

OCCCA works with any OpenAI-compatible API:

```bash
# OpenRouter
OPENAI_API_KEY=sk-or-... OPENAI_BASE_URL=https://openrouter.ai/api/v1 OCCCA_MODEL=anthropic/claude-3.5-sonnet npm run dev

# Ollama (local)
OPENAI_BASE_URL=http://localhost:11434/v1 OCCCA_MODEL=llama3 OPENAI_API_KEY=ollama npm run dev

# Together AI
OPENAI_API_KEY=... OPENAI_BASE_URL=https://api.together.xyz/v1 OCCCA_MODEL=meta-llama/Llama-3-70b-chat-hf npm run dev

# LM Studio (local)
OPENAI_BASE_URL=http://localhost:1234/v1 OPENAI_API_KEY=lm-studio npm run dev
```

## Interactive Commands

| Command | Description |
|---|---|
| `/help` | Show help |
| `/config` | Show current configuration |
| `/clear` | Clear conversation history |
| `/compact` | Summarize old messages to save context |
| `/model <name>` | Switch model |
| `/cost` | Show session info |
| `/exit` | Exit OCCCA |
| `! <command>` | Run a shell command inline |

## Tools

OCCCA includes 7 essential coding tools:

| Tool | Description |
|---|---|
| **Bash** | Execute shell commands with timeout support |
| **Read** | Read files with line numbers and offset/limit |
| **Write** | Create or overwrite files |
| **Edit** | Exact string replacement in files |
| **Glob** | Find files by glob patterns |
| **Grep** | Search file contents with regex (ripgrep) |
| **LS** | List directory contents |

## Architecture

```
occca/
├── src/
│   ├── index.ts           # CLI entry, REPL, slash commands
│   ├── agent.ts           # OpenAI streaming agent loop
│   ├── config.ts          # Configuration management
│   ├── system-prompt.ts   # Production system prompts
│   ├── ui.ts              # Terminal UI (chalk, ora, marked)
│   ├── types.d.ts         # Type declarations
│   └── tools/
│       ├── index.ts       # Tool registry
│       ├── bash.ts        # Shell execution
│       ├── file-read.ts   # File reading
│       ├── file-write.ts  # File writing
│       ├── file-edit.ts   # File editing
│       ├── glob.ts        # File search
│       ├── grep.ts        # Content search
│       └── list-dir.ts    # Directory listing
├── bin/occca.js           # npm bin entry
├── package.json
└── tsconfig.json
```

## License

MIT
