# Database Operations

Perform database operations on the Supabase Postgres database.

**Action:** $ARGUMENTS

---

## Available Operations

| Operation | Description | Example |
|-----------|-------------|---------|
| `check` | Check database connection | `/db check` |
| `tables` | List all tables with sizes | `/db tables` |
| `describe <table>` | Describe table columns | `/db describe users` |
| `query <sql>` | Run SQL query | `/db query SELECT * FROM teams` |
| `count [table]` | Row counts | `/db count` or `/db count tasks` |
| `indexes [table]` | Show indexes | `/db indexes tasks` |
| `fk [table]` | Show foreign keys | `/db fk tasks` |
| `migrations` | List Drizzle migrations | `/db migrations` |
| `apply <migration>` | Apply a migration | `/db apply 0003_sturdy_maverick` |
| `export <table>` | Export table as JSON | `/db export teams` |
| `csv <table>` | Export table as CSV | `/db csv teams` |
| `stats [table]` | Table statistics | `/db stats` |
| `connections` | Active connections | `/db connections` |
| `buckets` | List storage buckets | `/db buckets` |
| `objects <bucket>` | List bucket objects | `/db objects ikanban-bucket` |
| `search <pattern>` | Search column names | `/db search email` |
| `find <table> <col> <val>` | Search data | `/db find users email john` |
| `views` | List views | `/db views` |
| `functions` | List functions | `/db functions` |
| `enums` | List enum types | `/db enums` |
| `extensions` | List extensions | `/db extensions` |
| `policies [table]` | List RLS policies | `/db policies` |
| `rls` | Check RLS status | `/db rls` |
| `vacuum [table]` | Vacuum analyze | `/db vacuum tasks` |

---

## Instructions

Based on the operation requested, use the appropriate MCP tool from the `db` server:

### Connection & Info
- `check` → Use `db_check_connection`
- `tables` → Use `db_list_tables`
- `describe <table>` → Use `db_describe_table` with `table_name`
- `count` → Use `db_row_count` (optionally with `table_name`)

### Queries
- `query <sql>` → Use `db_query` with the SQL
- For multi-statement SQL → Use `db_execute`

### Schema Info
- `indexes` → Use `db_show_indexes` (optionally with `table_name`)
- `fk` → Use `db_show_foreign_keys` (optionally with `table_name`)
- `views` → Use `db_list_views`
- `functions` → Use `db_list_functions`
- `enums` → Use `db_list_enums`
- `extensions` → Use `db_list_extensions`

### Migrations
- `migrations` → Use `db_list_migrations`
- `apply <name>` → Use `db_apply_migration` with `migration_name`
- `read <name>` → Use `db_read_migration` with `migration_name`

### Data Export
- `export <table>` → Use `db_export_table` with `table_name` and optional `limit`
- `csv <table>` → Use `db_export_csv` with `table_name` and optional `limit`
- `inserts <table>` → Use `db_generate_insert` with `table_name`

### Statistics & Monitoring
- `stats` → Use `db_table_stats` (optionally with `table_name`)
- `connections` → Use `db_active_connections`
- `slow` → Use `db_slow_queries`
- `index-usage` → Use `db_index_usage`

### Storage
- `buckets` → Use `db_list_buckets`
- `objects <bucket>` → Use `db_list_storage_objects` with `bucket`

### RLS (Row Level Security)
- `policies` → Use `db_list_policies` (optionally with `table_name`)
- `rls` → Use `db_check_rls`
- `enable-rls <table>` → Use `db_enable_rls` with `table_name`
- `disable-rls <table>` → Use `db_disable_rls` with `table_name`

### Search & Find
- `search <pattern>` → Use `db_search_column` with `pattern`
- `find <table> <column> <value>` → Use `db_search_data`
- `exists <table>` → Use `db_table_exists` with `table_name`

### Maintenance
- `vacuum` → Use `db_vacuum` (optionally with `table_name`)
- `truncate <table>` → Use `db_truncate_table` with `table_name` and `confirm: true`

---

## Output Format

Present results in a clean, readable format:
- For tables: Use markdown tables
- For single values: Use inline code
- For errors: Show error message clearly
- For large data: Summarize and offer to show more

---

## Safety Notes

- Always confirm before destructive operations (truncate, delete)
- Show row counts before large exports
- Warn about slow queries on large tables
