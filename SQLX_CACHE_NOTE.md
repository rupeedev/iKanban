# SQLx Cache Generation Needed

## Context
Added a new `POST /api/tasks/{id}/move` endpoint that requires two new SQLx queries to be cached.

## Queries Added
1. `SELECT` query in `move_task()` to fetch the current task
2. `UPDATE` query in `move_task()` to update the task's project_id

## How to Generate the Cache

### Option 1: Local Development
If you have PostgreSQL installed locally:
```bash
cd vibe-backend/crates/remote
bash scripts/prepare-db.sh
```

This will:
1. Start a temporary PostgreSQL instance
2. Run all migrations
3. Generate the `.sqlx/` cache files
4. Stop the temporary instance

### Option 2: Using Railway/Production Database
The SQLx cache will be automatically generated during Railway deployment when the code is built with access to `DATABASE_URL`.

## Files Changed
- `vibe-backend/crates/remote/src/db/tasks.rs` - Added `MoveTaskData` struct and `move_task()` method
- `vibe-backend/crates/remote/src/routes/tasks.rs` - Added `MoveSharedTaskRequest` and `move_shared_task()` handler

## Testing
Once the SQLx cache is generated, test the endpoint:
```bash
curl -X POST https://api.scho1ar.com/api/tasks/{task_id}/move \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"project_id": "new-project-uuid"}'
```
