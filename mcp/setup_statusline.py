#!/usr/bin/env python3
"""
Setup script for Claude Code context window status line.

This script configures a status line that displays:
- Current model name
- Context window usage percentage (color-coded)
- Session cost in USD
- Total tokens used

Usage:
    python3 mcp/setup_statusline.py

What it does:
    1. Creates/updates ~/.claude/settings.json with statusLine configuration
    2. Creates ~/.claude/statusline.sh script
    3. Makes the script executable

Note: Daily/weekly quota info is NOT available via the status line API.
Check Settings > Usage in your Claude account for quota details.
"""

import json
import os
import stat
import sys
from pathlib import Path


STATUSLINE_SCRIPT = '''#!/bin/bash
# Claude Code Context Window Status Line
# Displays: Model | Context % | Session Cost | Total Tokens
#
# Note: Daily/weekly quota info is NOT available via status line API.
# Check Settings > Usage in your Claude account for quota details.

input=$(cat)

MODEL=$(echo "$input" | jq -r '.model.display_name // "Unknown"')
CONTEXT_SIZE=$(echo "$input" | jq -r '.context_window.context_window_size // 0')
USAGE=$(echo "$input" | jq '.context_window.current_usage')

# Cost tracking
COST=$(echo "$input" | jq -r '.cost.total_cost_usd // 0')

# Total tokens in session
TOTAL_INPUT=$(echo "$input" | jq -r '.context_window.total_input_tokens // 0')
TOTAL_OUTPUT=$(echo "$input" | jq -r '.context_window.total_output_tokens // 0')

# Color codes
RED="\\033[31m"
YELLOW="\\033[33m"
GREEN="\\033[32m"
CYAN="\\033[36m"
DIM="\\033[2m"
RESET="\\033[0m"

# Build output
OUTPUT="[$MODEL]"

# Context usage percentage
if [ "$USAGE" != "null" ]; then
    CURRENT_TOKENS=$(echo "$USAGE" | jq '.input_tokens + .cache_creation_input_tokens + .cache_read_input_tokens')
    if [ "$CONTEXT_SIZE" -gt 0 ] 2>/dev/null; then
        PERCENT_USED=$((CURRENT_TOKENS * 100 / CONTEXT_SIZE))

        if [ "$PERCENT_USED" -ge 90 ]; then
            COLOR="$RED"
        elif [ "$PERCENT_USED" -ge 70 ]; then
            COLOR="$YELLOW"
        else
            COLOR="$GREEN"
        fi
        OUTPUT="$OUTPUT Ctx:${COLOR}${PERCENT_USED}%${RESET}"
    fi
else
    OUTPUT="$OUTPUT Ctx:${DIM}0%${RESET}"
fi

# Session cost (format to 2 decimal places)
if [ "$COST" != "0" ] && [ "$COST" != "null" ]; then
    COST_FMT=$(printf "%.2f" "$COST" 2>/dev/null || echo "$COST")
    OUTPUT="$OUTPUT ${CYAN}\\$${COST_FMT}${RESET}"
fi

# Total tokens (format in K for readability)
TOTAL_TOKENS=$((TOTAL_INPUT + TOTAL_OUTPUT))
if [ "$TOTAL_TOKENS" -gt 0 ] 2>/dev/null; then
    if [ "$TOTAL_TOKENS" -ge 1000 ]; then
        TOKENS_K=$((TOTAL_TOKENS / 1000))
        OUTPUT="$OUTPUT ${DIM}${TOKENS_K}K tok${RESET}"
    else
        OUTPUT="$OUTPUT ${DIM}${TOTAL_TOKENS} tok${RESET}"
    fi
fi

echo -e "$OUTPUT"
'''


def get_claude_dir() -> Path:
    """Get the ~/.claude directory path."""
    return Path.home() / ".claude"


def ensure_claude_dir() -> Path:
    """Ensure ~/.claude directory exists."""
    claude_dir = get_claude_dir()
    claude_dir.mkdir(parents=True, exist_ok=True)
    return claude_dir


def create_statusline_script(claude_dir: Path) -> Path:
    """Create the statusline.sh script."""
    script_path = claude_dir / "statusline.sh"
    script_path.write_text(STATUSLINE_SCRIPT)

    # Make executable (chmod +x)
    current_mode = script_path.stat().st_mode
    script_path.chmod(current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

    return script_path


def update_settings(claude_dir: Path) -> Path:
    """Update settings.json with statusLine configuration."""
    settings_path = claude_dir / "settings.json"

    # Load existing settings or create new
    if settings_path.exists():
        try:
            settings = json.loads(settings_path.read_text())
        except json.JSONDecodeError:
            print(f"Warning: Could not parse existing {settings_path}, creating backup")
            backup_path = settings_path.with_suffix(".json.bak")
            settings_path.rename(backup_path)
            settings = {}
    else:
        settings = {}

    # Add statusLine configuration
    settings["statusLine"] = {
        "type": "command",
        "command": "~/.claude/statusline.sh",
        "padding": 0
    }

    # Write updated settings with nice formatting
    settings_path.write_text(json.dumps(settings, indent=2) + "\n")

    return settings_path


def check_jq_installed() -> bool:
    """Check if jq is installed."""
    import shutil
    return shutil.which("jq") is not None


def main():
    """Main entry point."""
    print("Setting up Claude Code context window status line...")
    print()

    # Check for jq
    if not check_jq_installed():
        print("Warning: 'jq' is not installed. The status line requires jq.")
        print("Install it with:")
        print("  macOS:  brew install jq")
        print("  Ubuntu: sudo apt-get install jq")
        print()

    # Create directory
    claude_dir = ensure_claude_dir()
    print(f"Claude directory: {claude_dir}")

    # Create statusline script
    script_path = create_statusline_script(claude_dir)
    print(f"Created statusline script: {script_path}")

    # Update settings
    settings_path = update_settings(claude_dir)
    print(f"Updated settings: {settings_path}")

    print()
    print("Setup complete!")
    print()
    print("The status line will show:")
    print("  [Model] Ctx:XX% $X.XX XXK tok")
    print()
    print("  - Ctx:    Context window usage (color-coded)")
    print("  - $X.XX:  Session cost in USD (cyan)")
    print("  - XXK tok: Total tokens used (dimmed)")
    print()
    print("Color coding for context usage:")
    print("  Green:  < 70% usage")
    print("  Yellow: 70-89% usage")
    print("  Red:    >= 90% usage")
    print()
    print("Note: Daily/weekly quota info is NOT available via the status line API.")
    print("      Check Settings > Usage in your Claude account for quota details.")
    print()
    print("Restart Claude Code for changes to take effect.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
