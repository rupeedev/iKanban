#!/bin/bash
set -e

# Deploy iKanban schema to RDS using SQLx migrations

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL not set"
  echo "Usage: DATABASE_URL=postgres://user:pass@host:5432/db ./deploy-schema.sh"
  exit 1
fi

MIGRATIONS_DIR="$(dirname "$0")/../../vibe-backend/crates/remote/migrations"

echo "Running migrations from: $MIGRATIONS_DIR"
echo "Target: ${DATABASE_URL%%@*}@***"

cd "$(dirname "$0")/../../vibe-backend/crates/remote"
cargo sqlx migrate run

echo "Done. Schema deployed successfully."
