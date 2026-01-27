#!/bin/bash
# Claude Code launcher with local/cloud switching
# Usage:
#   ./claude-local.sh           → Local Ollama (default)
#   ./claude-local.sh --local   → Local Ollama
#   ./claude-local.sh --cloud   → Anthropic API
#   ./claude-local.sh --status  → Show current Ollama status

MODE="local"
EXTRA_ARGS=()

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --local|-l)
            MODE="local"
            shift
            ;;
        --cloud|-c)
            MODE="cloud"
            shift
            ;;
        --status|-s)
            echo "=== Ollama Status ==="
            if pgrep -x "ollama" > /dev/null; then
                echo "Ollama: Running"
                echo ""
                echo "Installed models:"
                ollama list
            else
                echo "Ollama: Not running"
                echo "Start with: brew services start ollama"
            fi
            exit 0
            ;;
        --help|-h)
            echo "Claude Code Launcher"
            echo ""
            echo "Usage: ./claude-local.sh [OPTIONS] [CLAUDE_ARGS...]"
            echo ""
            echo "Options:"
            echo "  --local, -l    Use local Ollama (default, free, private)"
            echo "  --cloud, -c    Use Anthropic API (requires key, costs money)"
            echo "  --status, -s   Show Ollama status and installed models"
            echo "  --help, -h     Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./claude-local.sh              # Start with local Ollama"
            echo "  ./claude-local.sh --cloud      # Start with Anthropic API"
            echo "  ./claude-local.sh --local -p   # Local + print mode"
            exit 0
            ;;
        *)
            EXTRA_ARGS+=("$1")
            shift
            ;;
    esac
done

if [[ "$MODE" == "local" ]]; then
    echo "Mode: LOCAL (Ollama + qwen2.5-coder)"
    echo "───────────────────────────────────"

    export ANTHROPIC_AUTH_TOKEN=ollama
    export ANTHROPIC_BASE_URL=http://localhost:11434

    # Ensure Ollama is running
    if ! pgrep -x "ollama" > /dev/null; then
        echo "Starting Ollama service..."
        brew services start ollama
        sleep 2
    fi

    claude --model qwen2.5-coder "${EXTRA_ARGS[@]}"
else
    echo "Mode: CLOUD (Anthropic API)"
    echo "───────────────────────────"

    unset ANTHROPIC_AUTH_TOKEN
    unset ANTHROPIC_BASE_URL

    claude "${EXTRA_ARGS[@]}"
fi
