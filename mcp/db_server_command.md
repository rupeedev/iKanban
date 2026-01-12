# Database MCP Server

Comprehensive database operations for iKanban/Supabase Postgres.

## 35 Available Tools

### Core Operations
| Tool | Description |
|------|-------------|
| `db_query` | Execute SQL query (SELECT, INSERT, UPDATE, DELETE) |
| `db_execute` | Execute multi-statement SQL using psql |
| `db_list_tables` | List all tables with sizes |
| `db_describe_table` | Get column details for a table |
| `db_show_indexes` | Show indexes for tables |
| `db_show_foreign_keys` | Show FK relationships |
| `db_check_connection` | Check database connection and info |
| `db_table_exists` | Check if a table exists |
| `db_row_count` | Get row counts |

### Migrations
| Tool | Description |
|------|-------------|
| `db_list_migrations` | List Drizzle migration files |
| `db_read_migration` | Read migration file content |
| `db_apply_migration` | Apply a Drizzle migration |

### Schema Management
| Tool | Description |
|------|-------------|
| `db_list_views` | List all views |
| `db_list_functions` | List user-defined functions |
| `db_list_triggers` | List triggers |
| `db_list_enums` | List enum types |
| `db_list_extensions` | List installed extensions |

### RLS (Row Level Security)
| Tool | Description |
|------|-------------|
| `db_list_policies` | List RLS policies |
| `db_check_rls` | Check RLS status for tables |
| `db_enable_rls` | Enable RLS on a table |
| `db_disable_rls` | Disable RLS on a table |

### Data Operations
| Tool | Description |
|------|-------------|
| `db_export_table` | Export table data as JSON |
| `db_export_csv` | Export table data as CSV |
| `db_truncate_table` | Truncate a table (requires confirm=true) |
| `db_vacuum` | Vacuum table or database |

### Statistics & Monitoring
| Tool | Description |
|------|-------------|
| `db_table_stats` | Get table statistics |
| `db_index_usage` | Get index usage statistics |
| `db_active_connections` | Show active connections |
| `db_slow_queries` | Show slow running queries |

### Supabase Storage
| Tool | Description |
|------|-------------|
| `db_list_buckets` | List Supabase storage buckets |
| `db_list_storage_objects` | List objects in a bucket |

### Utility
| Tool | Description |
|------|-------------|
| `db_search_column` | Search for columns by name pattern |
| `db_search_data` | Search for a value in table/column |
| `db_generate_insert` | Generate INSERT statements from data |

---

## CLI Usage

```bash
# Check connection
python3 mcp/db_server.py check

# List tables
python3 mcp/db_server.py tables

# Describe a table
python3 mcp/db_server.py describe ai_provider_keys

# Run SQL query
python3 mcp/db_server.py query "SELECT * FROM teams LIMIT 5"

# List migrations
python3 mcp/db_server.py migrations

# Apply a migration
python3 mcp/db_server.py apply 0003_sturdy_maverick.sql

# List views
python3 mcp/db_server.py views

# List functions
python3 mcp/db_server.py functions

# List enums
python3 mcp/db_server.py enums

# List extensions
python3 mcp/db_server.py extensions

# List RLS policies
python3 mcp/db_server.py policies

# List storage buckets
python3 mcp/db_server.py buckets

# Show active connections
python3 mcp/db_server.py connections

# Show table statistics
python3 mcp/db_server.py stats

# Export table data
python3 mcp/db_server.py export teams --format json --limit 10
python3 mcp/db_server.py export teams --format csv --limit 10

# Search for columns
python3 mcp/db_server.py search email
```

---

## Claude CLI Configuration

Added to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "db": {
      "type": "stdio",
      "command": "/Users/rupeshpanwar/Documents/Projects/iKanban/mcp/.venv/bin/python3",
      "args": [
        "/Users/rupeshpanwar/Documents/Projects/iKanban/mcp/db_server.py"
      ]
    }
  }
}
```

---

## Environment

DATABASE_URL is loaded automatically from:
1. Environment variable `DATABASE_URL`
2. `vibe-backend/.env` file
3. Project root `.env` file

---

## Examples

### Apply a migration
```
Tool: db_apply_migration
Args: { "migration_name": "0003_sturdy_maverick.sql" }
```

### Check if table exists
```
Tool: db_table_exists
Args: { "table_name": "ai_provider_keys" }
```

### Export data as CSV
```
Tool: db_export_csv
Args: { "table_name": "teams", "limit": 100 }
```

### Search for columns containing "email"
```
Tool: db_search_column
Args: { "pattern": "email" }
```

### List storage objects
```
Tool: db_list_storage_objects
Args: { "bucket": "ikanban-bucket", "limit": 50 }
```

### Enable RLS on a table
```
Tool: db_enable_rls
Args: { "table_name": "tasks" }
```

---

## Safety

- `DROP DATABASE` and `DROP SCHEMA public` are blocked
- `db_truncate_table` requires `confirm: true`
- Use `db_apply_migration` for schema changes
- Always backup before destructive operations
