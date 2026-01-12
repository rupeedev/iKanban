# Claude Setup Script

A Python script to set up Claude Code configuration for any project.

## Quick Start

```bash
# Preview what would be created (dry-run)
python3 mcp/claude_setup.py --dry-run

# Create sample config in current directory
python3 mcp/claude_setup.py --init

# Run setup with config
python3 mcp/claude_setup.py -c claude-setup-config.json

# Setup a different project
python3 mcp/claude_setup.py -t /path/to/project
```

## What It Creates

### Project Files
| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project context for Claude Code (with Progress Tracking section) |
| `SCRATCHPAD.md` | Notes, current focus, TODOs, questions |
| `plan.md` | Implementation planning before coding |

### Built-in Commands (Always Included)
| Command | Purpose |
|---------|---------|
| `/project:plan-feature` | Create structured plan in plan.md |
| `/project:focus` | Update current focus in SCRATCHPAD.md |
| `/project:note` | Add timestamped note to SCRATCHPAD.md |
| `/project:done` | Mark work complete, update both files |
| `/project:review` | Review current file for issues |

### Global Configuration
- MCP servers in `~/.claude/settings.json`
- Post-tool hooks (formatting, linting)

## Workflow Automation

The script sets up an automated tracking workflow:

```
1. Start task:    /project:focus IKA-77 implement feature X
2. Plan if needed: /project:plan-feature add cloud storage sync
3. Take notes:     /project:note found edge case in upload handler
4. Finish:         /project:done
```

This keeps `SCRATCHPAD.md` and `plan.md` updated automatically.

## Configuration File

```json
{
  "project": {
    "name": "MyProject",
    "tech_stack": ["TypeScript", "React"],
    "description": "..."
  },
  "commands": {
    "dev": "npm run dev",
    "test": "npm run test"
  },
  "conventions": ["..."],
  "custom_commands": {
    "my-cmd": {
      "description": "What it does",
      "content": "Prompt content here..."
    }
  },
  "mcp_servers": {
    "github": {
      "enabled": true,
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {"GITHUB_TOKEN": "${GITHUB_TOKEN}"}
    }
  },
  "hooks": {
    "postToolUse": [...]
  }
}
```

## Command Line Options

| Option | Description |
|--------|-------------|
| `-c, --config FILE` | Use custom config file |
| `-t, --target DIR` | Setup different project directory |
| `--init` | Create sample config file |
| `--dry-run` | Preview changes without making them |
| `--overwrite` | Overwrite existing CLAUDE.md |

## New Project Setup

To set up Claude Code on a brand new project:

```bash
# Step 1: Copy the script to your new project (or reference from iKanban)
cp /path/to/iKanban/mcp/claude_setup.py /path/to/new-project/

# Step 2: Create a sample config file
python3 claude_setup.py --init

# Step 3: Edit the config to match your project
# Update: project name, tech stack, commands, conventions, etc.

# Step 4: Run the setup
python3 claude_setup.py -c claude-setup-config.json

# Or run directly from iKanban without copying:
python3 /path/to/iKanban/mcp/claude_setup.py --init -t /path/to/new-project
python3 /path/to/iKanban/mcp/claude_setup.py -c claude-setup-config.json -t /path/to/new-project
```

**What gets created:**
- `CLAUDE.md` - With Progress Tracking section and available commands
- `SCRATCHPAD.md` - For notes and current focus tracking
- `plan.md` - For implementation planning
- `.claude/commands/` - All automation commands (plan-feature, focus, note, done, review)
- `~/.claude/settings.json` - MCP servers configuration (if enabled)

## Examples

```bash
# Setup current project with auto-detected config
python3 mcp/claude_setup.py

# Setup with specific config
python3 mcp/claude_setup.py -c mcp/claude-setup-ikanban.json

# Preview changes without making them
python3 mcp/claude_setup.py --dry-run

# Overwrite existing CLAUDE.md
python3 mcp/claude_setup.py --overwrite
```

## Environment Variables

The script expands environment variables in config:
- `${GITHUB_TOKEN}` - GitHub personal access token
- `${DATABASE_URL}` - Database connection string
- `${PROJECT_ROOT}` - Auto-replaced with target directory

## Adding Custom Commands

Add to `custom_commands` in config to extend built-in commands:

```json
"custom_commands": {
  "api-check": {
    "description": "Check API endpoint",
    "content": "Review this API endpoint for:\n1. Auth\n2. Validation\n..."
  }
}
```

Custom commands override built-in ones with the same name.

## Files in This Package

| File | Purpose |
|------|---------|
| `mcp/claude_setup.py` | Main setup script with built-in automation commands |
| `mcp/claude-setup-config.json` | Generic template config (copy and customize) |
| `mcp/claude-setup-ikanban.json` | iKanban-specific config (example) |
| `mcp/claude_setup_command.md` | This documentation |

## Built-in vs Custom Commands

**Built-in** (always created by script):
- `plan-feature`, `focus`, `note`, `done`, `review`

**Custom** (add in config to extend):
- Any additional commands specific to your project
- Can override built-in commands with same name
