#!/usr/bin/env python3
"""
Claude Code Project Setup Script

Sets up Claude Code configuration for any project based on a JSON config file.
Creates CLAUDE.md, scratch files, custom commands, and configures MCP servers/hooks.

Usage:
    python3 mcp/claude_setup.py                    # Use default config
    python3 mcp/claude_setup.py -c config.json     # Use custom config
    python3 mcp/claude_setup.py --init             # Create sample config
    python3 mcp/claude_setup.py --dry-run          # Preview changes
    python3 mcp/claude_setup.py --target /path     # Setup different project

Features:
    - Creates CLAUDE.md with project context
    - Creates SCRATCHPAD.md and plan.md for notes
    - Sets up .claude/commands/ with custom slash commands
    - Configures MCP servers in ~/.claude/settings.json
    - Configures hooks for auto-formatting/linting
"""

import argparse
import json
import os
import shutil
import stat
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


# Built-in automation commands (always included)
BUILTIN_COMMANDS = {
    "plan-feature": {
        "description": "Create structured plan for a feature",
        "content": """Start planning a new feature. Before any implementation:

1. Read the current plan.md file
2. Clear previous content and create a new plan with:
   - **Overview**: What we're building (from user's request)
   - **Goals**: 3-5 specific outcomes
   - **Approach**: Break into phases with concrete steps
   - **Technical Decisions**: Table of key choices
   - **Files to Modify**: List files that will be touched
   - **Acceptance Criteria**: Checkboxes for done definition

3. Write the updated plan.md
4. Summarize the plan to the user and ask for approval before implementing

Feature to plan: $ARGUMENTS"""
    },
    "focus": {
        "description": "Update current focus in SCRATCHPAD.md",
        "content": """Update the current focus in SCRATCHPAD.md:

1. Read the current SCRATCHPAD.md file
2. Replace the content under "## Current Focus" with:
   - Task/ticket ID if provided (e.g., IKA-XX)
   - Brief description of what we're working on
   - Current status (starting/in-progress/blocked/done)
3. Update the "Last updated" date at the bottom
4. Write the updated SCRATCHPAD.md
5. Confirm the focus was updated

New focus: $ARGUMENTS"""
    },
    "note": {
        "description": "Add timestamped note to SCRATCHPAD.md",
        "content": """Add a note to SCRATCHPAD.md:

1. Read the current SCRATCHPAD.md file
2. Add the following note under "## Notes" section with timestamp:
   - Format: `- [HH:MM] <note content>`
3. If the note is a TODO, add it under "## TODO" section instead as `- [ ] <task>`
4. If the note is a question, add it under "## Questions" section
5. Write the updated SCRATCHPAD.md
6. Confirm what was added

Note to add: $ARGUMENTS"""
    },
    "done": {
        "description": "Mark current work as done",
        "content": """Mark current work as done and update tracking files:

1. Read plan.md - check off completed acceptance criteria
2. Read SCRATCHPAD.md:
   - Move completed TODOs from `- [ ]` to `- [x]`
   - Add completion note with timestamp
   - Clear "Current Focus" or mark as done
3. Write both updated files
4. Provide a brief summary of what was accomplished

Optionally specify what was completed: $ARGUMENTS"""
    },
    "review": {
        "description": "Review current file for issues",
        "content": """Review the current file for:
- Security vulnerabilities
- Performance issues
- Code style violations
- Missing error handling

Be concise. List issues as bullet points with line numbers."""
    }
}


# Default configuration template
DEFAULT_CONFIG = {
    "project": {
        "name": "MyProject",
        "description": "Project description",
        "tech_stack": ["TypeScript", "React 18", "PostgreSQL"]
    },
    "commands": {
        "dev": "npm run dev",
        "test": "npm run test",
        "lint": "npm run lint"
    },
    "conventions": [
        "Use kebab-case for file names",
        "All API routes under /api/v1/"
    ],
    "known_quirks": [],
    "files": {
        "create_scratchpad": True,
        "create_plan": True,
        "create_commands_dir": True
    },
    "custom_commands": {},
    "mcp_servers": {},
    "hooks": {"postToolUse": []},
    "settings": {
        "backup_existing": True,
        "overwrite_claude_md": False,
        "dry_run": False
    }
}


class ClaudeSetup:
    """Handles Claude Code project setup."""

    def __init__(self, config: dict, target_dir: Path, dry_run: bool = False):
        self.config = config
        self.target_dir = target_dir.resolve()
        self.dry_run = dry_run or config.get("settings", {}).get("dry_run", False)
        self.claude_home = Path.home() / ".claude"
        self.changes: list[str] = []

    def log(self, message: str, indent: int = 0) -> None:
        """Log a message with optional indentation."""
        prefix = "  " * indent
        if self.dry_run:
            print(f"[DRY-RUN] {prefix}{message}")
        else:
            print(f"{prefix}{message}")

    def record_change(self, change: str) -> None:
        """Record a change for summary."""
        self.changes.append(change)

    def backup_file(self, path: Path) -> Path | None:
        """Create a backup of an existing file."""
        if not path.exists():
            return None
        if not self.config.get("settings", {}).get("backup_existing", True):
            return None

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = path.with_suffix(f"{path.suffix}.{timestamp}.bak")

        if not self.dry_run:
            shutil.copy2(path, backup_path)

        self.log(f"Backed up to: {backup_path.name}", indent=1)
        return backup_path

    def write_file(self, path: Path, content: str, backup: bool = True) -> bool:
        """Write content to a file with optional backup."""
        if path.exists() and backup:
            self.backup_file(path)

        if self.dry_run:
            self.log(f"Would create: {path}")
            return True

        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        self.record_change(f"Created: {path}")
        return True

    def generate_claude_md(self) -> str:
        """Generate CLAUDE.md content from config."""
        project = self.config.get("project", {})
        commands = self.config.get("commands", {})
        conventions = self.config.get("conventions", [])
        quirks = self.config.get("known_quirks", [])

        lines = [
            f"# Project: {project.get('name', 'MyProject')}",
            "",
        ]

        if project.get("description"):
            lines.extend([project["description"], ""])

        # Tech Stack
        tech_stack = project.get("tech_stack", [])
        if tech_stack:
            lines.extend(["## Tech Stack", ""])
            for tech in tech_stack:
                lines.append(f"- {tech}")
            lines.append("")

        # Commands
        if commands:
            lines.extend(["## Commands", ""])
            for name, cmd in commands.items():
                lines.append(f"- `{cmd}` - {name.replace('_', ' ').title()}")
            lines.append("")

        # Conventions
        if conventions:
            lines.extend(["## Conventions", ""])
            for conv in conventions:
                lines.append(f"- {conv}")
            lines.append("")

        # Known Quirks
        if quirks:
            lines.extend(["## Known Quirks", ""])
            for quirk in quirks:
                lines.append(f"- {quirk}")
            lines.append("")

        # Progress Tracking section
        lines.extend([
            "## Progress Tracking (Automated)",
            "",
            "**Files:** `SCRATCHPAD.md` (notes) and `plan.md` (implementation plans)",
            "",
            "### When Starting a Task:",
            "1. Update `SCRATCHPAD.md` → \"Current Focus\" with task ID and description",
            "2. If complex feature, create plan in `plan.md` with phases and acceptance criteria",
            "3. Use `/project:focus <task>` to automate this",
            "",
            "### While Working:",
            "- Add discoveries, bugs, questions to `SCRATCHPAD.md` under Notes",
            "- Use `/project:note <observation>` to add timestamped notes",
            "- Keep TODO list updated with `- [ ]` checkboxes",
            "",
            "### When Finishing:",
            "1. Check off completed items in both files",
            "2. Add completion summary to `SCRATCHPAD.md`",
            "3. Use `/project:done` to automate cleanup",
            "",
            "### Available Commands:",
            "| Command | Purpose |",
            "|---------|---------|",
            "| `/project:plan-feature <desc>` | Create structured plan in plan.md |",
            "| `/project:focus <task>` | Update current focus in SCRATCHPAD.md |",
            "| `/project:note <text>` | Add timestamped note |",
            "| `/project:done` | Mark complete, update both files |",
            "| `/project:review` | Review current file for issues |",
        ])

        # Add custom commands to the table
        custom_commands = self.config.get("custom_commands", {})
        for name, cmd_config in custom_commands.items():
            if name not in BUILTIN_COMMANDS:
                desc = cmd_config.get("description", "Custom command")
                lines.append(f"| `/project:{name}` | {desc} |")

        lines.append("")

        # Quick Tips
        lines.extend([
            "## Quick Tips",
            "",
            "- Press `#` key while in Claude Code to add instructions",
            "- Use `/compact` to summarize and compress context",
            "- Use `/clear` to start fresh",
            "- `Shift+Tab` twice to enter plan mode",
            ""
        ])

        return "\n".join(lines)

    def generate_scratchpad(self) -> str:
        """Generate SCRATCHPAD.md content."""
        project_name = self.config.get("project", {}).get("name", "Project")
        return f"""# {project_name} - Scratchpad

Use this file for notes, progress tracking, and temporary information.

## Current Focus

<!-- What are you working on right now? -->

## Notes

<!-- Important observations, decisions, or context to remember -->

## TODO

- [ ]

## Questions

<!-- Things to clarify or investigate -->

---
*Last updated: {datetime.now().strftime("%Y-%m-%d")}*
"""

    def generate_plan(self) -> str:
        """Generate plan.md content."""
        project_name = self.config.get("project", {}).get("name", "Project")
        return f"""# {project_name} - Implementation Plan

Use this file for detailed implementation plans before coding.

## Overview

<!-- High-level description of what you're building -->

## Goals

1.

## Approach

### Phase 1:

-

### Phase 2:

-

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
|          |        |           |

## Open Questions

-

## Acceptance Criteria

- [ ]

---
*Created: {datetime.now().strftime("%Y-%m-%d")}*
"""

    def setup_project_files(self) -> None:
        """Create project-level files."""
        self.log("Setting up project files...")

        files_config = self.config.get("files", {})

        # CLAUDE.md
        claude_md_path = self.target_dir / "CLAUDE.md"
        if claude_md_path.exists():
            if self.config.get("settings", {}).get("overwrite_claude_md", False):
                self.write_file(claude_md_path, self.generate_claude_md())
                self.log(f"Updated: CLAUDE.md", indent=1)
            else:
                self.log(f"Skipped: CLAUDE.md (exists, use --overwrite to replace)", indent=1)
        else:
            self.write_file(claude_md_path, self.generate_claude_md(), backup=False)
            self.log(f"Created: CLAUDE.md", indent=1)

        # SCRATCHPAD.md
        if files_config.get("create_scratchpad", True):
            scratchpad_path = self.target_dir / "SCRATCHPAD.md"
            if not scratchpad_path.exists():
                self.write_file(scratchpad_path, self.generate_scratchpad(), backup=False)
                self.log(f"Created: SCRATCHPAD.md", indent=1)
            else:
                self.log(f"Skipped: SCRATCHPAD.md (exists)", indent=1)

        # plan.md
        if files_config.get("create_plan", True):
            plan_path = self.target_dir / "plan.md"
            if not plan_path.exists():
                self.write_file(plan_path, self.generate_plan(), backup=False)
                self.log(f"Created: plan.md", indent=1)
            else:
                self.log(f"Skipped: plan.md (exists)", indent=1)

    def setup_custom_commands(self) -> None:
        """Create custom slash commands in .claude/commands/."""
        files_config = self.config.get("files", {})
        if not files_config.get("create_commands_dir", True):
            return

        self.log("Setting up custom commands...")
        commands_dir = self.target_dir / ".claude" / "commands"

        if not self.dry_run:
            commands_dir.mkdir(parents=True, exist_ok=True)

        # Merge built-in commands with custom commands (custom overrides built-in)
        all_commands = {**BUILTIN_COMMANDS, **self.config.get("custom_commands", {})}

        for name, cmd_config in all_commands.items():
            cmd_path = commands_dir / f"{name}.md"
            content = cmd_config.get("content", "")

            if cmd_path.exists():
                self.log(f"Skipped: /project:{name} (exists)", indent=1)
            else:
                self.write_file(cmd_path, content + "\n", backup=False)
                self.log(f"Created: /project:{name}", indent=1)

    def expand_env_vars(self, value: Any) -> Any:
        """Recursively expand environment variables in config values."""
        if isinstance(value, str):
            # Handle ${VAR} and $VAR patterns
            result = value
            for key, val in os.environ.items():
                result = result.replace(f"${{{key}}}", val)
                result = result.replace(f"${key}", val)
            # Replace ${PROJECT_ROOT} with target directory
            result = result.replace("${PROJECT_ROOT}", str(self.target_dir))
            return result
        elif isinstance(value, list):
            return [self.expand_env_vars(v) for v in value]
        elif isinstance(value, dict):
            return {k: self.expand_env_vars(v) for k, v in value.items()}
        return value

    def setup_mcp_servers(self) -> None:
        """Configure MCP servers in ~/.claude/settings.json."""
        mcp_servers = self.config.get("mcp_servers", {})
        enabled_servers = {
            name: cfg for name, cfg in mcp_servers.items()
            if cfg.get("enabled", True)
        }

        if not enabled_servers:
            return

        self.log("Configuring MCP servers...")
        settings_path = self.claude_home / "settings.json"

        # Load existing settings
        settings: dict = {}
        if settings_path.exists():
            try:
                settings = json.loads(settings_path.read_text())
                self.backup_file(settings_path)
            except json.JSONDecodeError:
                self.log("Warning: Could not parse settings.json", indent=1)

        # Build MCP servers config
        if "mcpServers" not in settings:
            settings["mcpServers"] = {}

        for name, cfg in enabled_servers.items():
            server_config = {
                "command": cfg.get("command", "npx"),
                "args": self.expand_env_vars(cfg.get("args", []))
            }

            env = self.expand_env_vars(cfg.get("env", {}))
            if env:
                server_config["env"] = env

            settings["mcpServers"][name] = server_config
            self.log(f"Configured: {name}", indent=1)

        # Write updated settings
        if not self.dry_run:
            self.claude_home.mkdir(parents=True, exist_ok=True)
            settings_path.write_text(json.dumps(settings, indent=2) + "\n")
            self.record_change(f"Updated: {settings_path}")

    def setup_hooks(self) -> None:
        """Configure hooks in ~/.claude/settings.json."""
        hooks_config = self.config.get("hooks", {})
        if not hooks_config:
            return

        self.log("Configuring hooks...")
        settings_path = self.claude_home / "settings.json"

        # Load existing settings
        settings: dict = {}
        if settings_path.exists():
            try:
                settings = json.loads(settings_path.read_text())
            except json.JSONDecodeError:
                pass

        # Build hooks config
        if "hooks" not in settings:
            settings["hooks"] = {}

        for hook_type, hook_list in hooks_config.items():
            enabled_hooks = [
                {"matcher": h["matcher"], "command": h["command"]}
                for h in hook_list
                if h.get("enabled", True)
            ]
            if enabled_hooks:
                settings["hooks"][hook_type] = enabled_hooks
                self.log(f"Configured: {len(enabled_hooks)} {hook_type} hook(s)", indent=1)

        # Write updated settings
        if not self.dry_run:
            self.claude_home.mkdir(parents=True, exist_ok=True)
            settings_path.write_text(json.dumps(settings, indent=2) + "\n")

    def run(self) -> int:
        """Run the complete setup process."""
        print(f"\n{'='*60}")
        print(f"Claude Code Setup for: {self.target_dir.name}")
        print(f"{'='*60}\n")

        if self.dry_run:
            print("[DRY-RUN MODE - No changes will be made]\n")

        # Step 1: Project files
        self.setup_project_files()
        print()

        # Step 2: Custom commands
        self.setup_custom_commands()
        print()

        # Step 3: MCP servers
        self.setup_mcp_servers()
        print()

        # Step 4: Hooks
        self.setup_hooks()
        print()

        # Summary
        print(f"{'='*60}")
        print("Setup Complete!")
        print(f"{'='*60}\n")

        if self.changes:
            print("Changes made:")
            for change in self.changes:
                print(f"  - {change}")
            print()

        print("Quick Start Tips:")
        print("  - Press # key in Claude Code to add instructions on-the-fly")
        print("  - Use /compact to compress context window")
        print("  - Use /clear to start fresh")
        print("  - Shift+Tab twice to enter plan mode")
        print()

        # Show all available commands
        all_commands = {**BUILTIN_COMMANDS, **self.config.get("custom_commands", {})}
        print("Available commands:")
        for name, cmd_config in all_commands.items():
            desc = cmd_config.get("description", "")
            print(f"  /project:{name:<15} - {desc}")
        print()

        return 0


def create_sample_config(path: Path) -> None:
    """Create a sample configuration file."""
    config_path = path / "claude-setup-config.json"
    if config_path.exists():
        print(f"Config already exists: {config_path}")
        return

    # Create a nicely formatted default config
    sample = {
        "$schema": "./claude-setup-config.schema.json",
        "_comment": "Claude Code setup configuration. Run: python3 mcp/claude_setup.py",
        **DEFAULT_CONFIG
    }

    config_path.write_text(json.dumps(sample, indent=2) + "\n")
    print(f"Created sample config: {config_path}")
    print("\nEdit this file to customize your setup, then run:")
    print(f"  python3 mcp/claude_setup.py -c {config_path}")


def load_config(config_path: Path | None, target_dir: Path) -> dict:
    """Load configuration from file or use defaults."""
    if config_path and config_path.exists():
        try:
            config = json.loads(config_path.read_text())
            print(f"Loaded config from: {config_path}")
            return config
        except json.JSONDecodeError as e:
            print(f"Error parsing config: {e}")
            sys.exit(1)

    # Look for config in common locations
    search_paths = [
        target_dir / "claude-setup-config.json",
        target_dir / ".claude" / "setup-config.json",
        target_dir / "mcp" / "claude-setup-config.json",
    ]

    for path in search_paths:
        if path.exists():
            try:
                config = json.loads(path.read_text())
                print(f"Found config at: {path}")
                return config
            except json.JSONDecodeError:
                continue

    print("No config found, using defaults")
    return DEFAULT_CONFIG.copy()


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Set up Claude Code for a project",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 mcp/claude_setup.py                    # Setup current project
  python3 mcp/claude_setup.py --init             # Create sample config
  python3 mcp/claude_setup.py -c myconfig.json   # Use custom config
  python3 mcp/claude_setup.py --dry-run          # Preview changes
  python3 mcp/claude_setup.py --target /path     # Setup different project
  python3 mcp/claude_setup.py --overwrite        # Overwrite CLAUDE.md
        """
    )

    parser.add_argument(
        "-c", "--config",
        type=Path,
        help="Path to configuration JSON file"
    )
    parser.add_argument(
        "-t", "--target",
        type=Path,
        default=Path.cwd(),
        help="Target project directory (default: current directory)"
    )
    parser.add_argument(
        "--init",
        action="store_true",
        help="Create a sample configuration file"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without making them"
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing CLAUDE.md"
    )

    args = parser.parse_args()

    # Resolve target directory
    target_dir = args.target.resolve()
    if not target_dir.is_dir():
        print(f"Error: Target is not a directory: {target_dir}")
        return 1

    # Handle --init
    if args.init:
        create_sample_config(target_dir)
        return 0

    # Load configuration
    config = load_config(args.config, target_dir)

    # Apply command-line overrides
    if args.dry_run:
        config.setdefault("settings", {})["dry_run"] = True
    if args.overwrite:
        config.setdefault("settings", {})["overwrite_claude_md"] = True

    # Run setup
    setup = ClaudeSetup(config, target_dir, dry_run=args.dry_run)
    return setup.run()


if __name__ == "__main__":
    sys.exit(main())
