# iKanban Schema Deployment to AWS RDS

Deploy the PostgreSQL schema to your RDS instance.

## Quick Start

```bash
# 1. Set your RDS connection
export DATABASE_URL="postgres://user:pass@your-rds-endpoint:5432/ikanban"

# 2. Run migrations
./scripts/deploy-schema.sh
```

## Files

- `scripts/deploy-schema.sh` - Runs SQLx migrations against RDS
- `scripts/export-schema.sql` - Full schema as single SQL file (reference)
- `.env.example` - Environment template
