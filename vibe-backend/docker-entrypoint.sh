#!/bin/bash
set -e

# Run the remote server (PostgreSQL-based, no local SQLite needed)
exec /usr/local/bin/server "$@"
