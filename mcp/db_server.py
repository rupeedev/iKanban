#!/usr/bin/env python3
"""
Database MCP Server - Comprehensive database operations for iKanban/Supabase.

This server provides tools to interact with Supabase Postgres database:
- Run SQL queries (SELECT, INSERT, UPDATE, DELETE)
- List and describe tables, views, functions
- Apply Drizzle migrations
- Manage RLS policies
- Export/import data
- Schema management
- Storage bucket operations
- And more...

Usage:
  1. Add to Claude CLI config (~/.claude/settings.json):
     {
       "mcpServers": {
         "db": {
           "type": "stdio",
           "command": "python3",
           "args": ["/path/to/mcp/db_server.py"]
         }
       }
     }

  2. CLI testing:
     python3 db_server.py <command> [options]
"""

import json
import sys
import os
import subprocess
import csv
import io
from pathlib import Path
from datetime import datetime
from typing import Any, Dict, List, Optional

# Try to import psycopg2
try:
    import psycopg2
    import psycopg2.extras
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False

# --- Configuration ---
PROJECT_ROOT = Path(__file__).parent.parent
DRIZZLE_MIGRATIONS_DIR = PROJECT_ROOT / "vibe-backend" / "drizzle"
BACKEND_ENV_FILE = PROJECT_ROOT / "vibe-backend" / ".env"


def get_database_url() -> Optional[str]:
    """Get DATABASE_URL from environment or .env file."""
    url = os.environ.get("DATABASE_URL")
    if url:
        return url

    # Try loading from backend .env
    for env_file in [BACKEND_ENV_FILE, PROJECT_ROOT / ".env"]:
        if env_file.exists():
            with open(env_file) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("DATABASE_URL="):
                        return line.split("=", 1)[1].strip('"\'')
    return None


def get_connection():
    """Get database connection."""
    db_url = get_database_url()
    if not db_url:
        raise Exception("DATABASE_URL not found in environment or .env files")

    if not HAS_PSYCOPG2:
        raise Exception("psycopg2 not installed. Run: pip install psycopg2-binary")

    return psycopg2.connect(db_url)


def execute_sql(query: str, params: tuple = None, fetch: bool = True) -> Dict[str, Any]:
    """Execute SQL query using psycopg2."""
    try:
        conn = get_connection()
        conn.autocommit = False
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, params)
            if cur.description and fetch:
                rows = cur.fetchall()
                # Convert to regular dicts for JSON serialization
                data = [dict(row) for row in rows]
                conn.commit()
                return {"success": True, "data": data, "row_count": len(data)}
            else:
                affected = cur.rowcount
                conn.commit()
                return {"success": True, "message": f"Query executed. Rows affected: {affected}", "rows_affected": affected}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        if 'conn' in locals():
            conn.close()


def execute_sql_raw(query: str) -> Dict[str, Any]:
    """Execute SQL using psql for complex multi-statement queries."""
    db_url = get_database_url()
    if not db_url:
        return {"success": False, "error": "DATABASE_URL not found"}

    try:
        result = subprocess.run(
            ["psql", db_url, "-c", query],
            capture_output=True,
            text=True,
            timeout=120
        )
        if result.returncode == 0:
            return {"success": True, "output": result.stdout}
        else:
            return {"success": False, "error": result.stderr or result.stdout}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Query timed out after 120 seconds"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# =============================================================================
# CORE DATABASE OPERATIONS
# =============================================================================

def handle_db_query(params: Dict) -> Dict[str, Any]:
    """Execute a SQL query."""
    query = params.get("query", "").strip()
    if not query:
        return {"success": False, "error": "Query is required"}

    # Safety check for destructive operations
    query_lower = query.lower()
    dangerous = ["drop database", "drop schema public", "truncate all"]
    if any(d in query_lower for d in dangerous):
        return {"success": False, "error": "This destructive operation is blocked for safety"}

    return execute_sql(query)


def handle_db_execute(params: Dict) -> Dict[str, Any]:
    """Execute multi-statement SQL (uses psql)."""
    sql = params.get("sql", "").strip()
    if not sql:
        return {"success": False, "error": "SQL is required"}

    return execute_sql_raw(sql)


def handle_db_list_tables(params: Dict) -> Dict[str, Any]:
    """List all tables with details."""
    schema = params.get("schema", "public")
    query = f"""
        SELECT
            t.table_name,
            pg_size_pretty(pg_total_relation_size(quote_ident(t.table_name))) as total_size,
            pg_size_pretty(pg_relation_size(quote_ident(t.table_name))) as table_size,
            (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name) as column_count,
            obj_description((quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))::regclass) as comment
        FROM information_schema.tables t
        WHERE t.table_schema = %s AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name;
    """
    return execute_sql(query, (schema,))


def handle_db_describe_table(params: Dict) -> Dict[str, Any]:
    """Get detailed table information."""
    table_name = params.get("table_name", "").strip()
    if not table_name:
        return {"success": False, "error": "table_name is required"}

    query = """
        SELECT
            c.column_name,
            c.data_type,
            c.character_maximum_length,
            c.is_nullable,
            c.column_default,
            CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
            CASE WHEN fk.column_name IS NOT NULL THEN fk.foreign_table || '.' || fk.foreign_column ELSE NULL END as foreign_key_ref
        FROM information_schema.columns c
        LEFT JOIN (
            SELECT ku.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
            WHERE tc.table_name = %s AND tc.constraint_type = 'PRIMARY KEY'
        ) pk ON c.column_name = pk.column_name
        LEFT JOIN (
            SELECT
                kcu.column_name,
                ccu.table_name as foreign_table,
                ccu.column_name as foreign_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
            WHERE tc.table_name = %s AND tc.constraint_type = 'FOREIGN KEY'
        ) fk ON c.column_name = fk.column_name
        WHERE c.table_name = %s
        ORDER BY c.ordinal_position;
    """
    return execute_sql(query, (table_name, table_name, table_name))


def handle_db_show_indexes(params: Dict) -> Dict[str, Any]:
    """Show indexes for a table or all tables."""
    table_name = params.get("table_name", "").strip()

    if table_name:
        query = """
            SELECT indexname, indexdef,
                   pg_size_pretty(pg_relation_size(indexrelid)) as size
            FROM pg_indexes
            JOIN pg_class ON pg_class.relname = indexname
            WHERE tablename = %s
            ORDER BY indexname;
        """
        return execute_sql(query, (table_name,))
    else:
        query = """
            SELECT tablename, indexname,
                   pg_size_pretty(pg_relation_size(i.indexrelid)) as size
            FROM pg_indexes
            JOIN pg_class i ON i.relname = indexname
            WHERE schemaname = 'public'
            ORDER BY tablename, indexname
            LIMIT 100;
        """
        return execute_sql(query)


def handle_db_show_foreign_keys(params: Dict) -> Dict[str, Any]:
    """Show foreign key relationships."""
    table_name = params.get("table_name", "").strip()

    query = """
        SELECT
            tc.table_name as from_table,
            kcu.column_name as from_column,
            ccu.table_name AS to_table,
            ccu.column_name AS to_column,
            tc.constraint_name,
            rc.delete_rule,
            rc.update_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
        JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
    """

    if table_name:
        query += " AND tc.table_name = %s"
        query += " ORDER BY tc.constraint_name;"
        return execute_sql(query, (table_name,))
    else:
        query += " ORDER BY tc.table_name, tc.constraint_name LIMIT 100;"
        return execute_sql(query)


def handle_db_check_connection(params: Dict) -> Dict[str, Any]:
    """Check database connection and show info."""
    query = """
        SELECT
            version() as version,
            current_database() as database,
            current_user as user,
            inet_server_addr() as server_ip,
            inet_server_port() as server_port,
            now() as server_time,
            pg_size_pretty(pg_database_size(current_database())) as database_size;
    """
    return execute_sql(query)


def handle_db_table_exists(params: Dict) -> Dict[str, Any]:
    """Check if a table exists."""
    table_name = params.get("table_name", "").strip()
    if not table_name:
        return {"success": False, "error": "table_name is required"}

    query = """
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = %s
        ) as exists;
    """
    return execute_sql(query, (table_name,))


def handle_db_row_count(params: Dict) -> Dict[str, Any]:
    """Get row count for tables."""
    table_name = params.get("table_name", "").strip()

    if table_name:
        query = f"SELECT COUNT(*) as count FROM {table_name};"
        return execute_sql(query)
    else:
        query = """
            SELECT relname as table_name, n_live_tup as row_count
            FROM pg_stat_user_tables
            WHERE schemaname = 'public'
            ORDER BY n_live_tup DESC;
        """
        return execute_sql(query)


# =============================================================================
# MIGRATION OPERATIONS
# =============================================================================

def handle_db_list_migrations(params: Dict) -> Dict[str, Any]:
    """List available Drizzle migration files."""
    if not DRIZZLE_MIGRATIONS_DIR.exists():
        return {"success": False, "error": f"Migrations directory not found: {DRIZZLE_MIGRATIONS_DIR}"}

    migrations = []
    for f in sorted(DRIZZLE_MIGRATIONS_DIR.glob("*.sql")):
        migrations.append({
            "name": f.name,
            "size": f.stat().st_size,
            "modified": datetime.fromtimestamp(f.stat().st_mtime).isoformat()
        })

    return {"success": True, "migrations": migrations, "count": len(migrations)}


def handle_db_read_migration(params: Dict) -> Dict[str, Any]:
    """Read a migration file content."""
    migration_name = params.get("migration_name", "").strip()
    if not migration_name:
        return {"success": False, "error": "migration_name is required"}

    if not migration_name.endswith(".sql"):
        migration_name += ".sql"

    migration_path = DRIZZLE_MIGRATIONS_DIR / migration_name
    if not migration_path.exists():
        return {"success": False, "error": f"Migration not found: {migration_name}"}

    content = migration_path.read_text()
    return {"success": True, "name": migration_name, "content": content}


def handle_db_apply_migration(params: Dict) -> Dict[str, Any]:
    """Apply a Drizzle migration file."""
    migration_name = params.get("migration_name", "").strip()
    if not migration_name:
        return {"success": False, "error": "migration_name is required"}

    if not migration_name.endswith(".sql"):
        migration_name += ".sql"

    migration_path = DRIZZLE_MIGRATIONS_DIR / migration_name
    if not migration_path.exists():
        return {"success": False, "error": f"Migration not found: {migration_name}"}

    content = migration_path.read_text()
    # Remove Drizzle statement breakpoints
    sql = content.replace("--> statement-breakpoint", "")

    result = execute_sql_raw(sql)
    if result.get("success"):
        result["message"] = f"Migration {migration_name} applied successfully"
    return result


# =============================================================================
# SCHEMA MANAGEMENT
# =============================================================================

def handle_db_list_views(params: Dict) -> Dict[str, Any]:
    """List all views."""
    query = """
        SELECT table_name as view_name, view_definition
        FROM information_schema.views
        WHERE table_schema = 'public'
        ORDER BY table_name;
    """
    return execute_sql(query)


def handle_db_list_functions(params: Dict) -> Dict[str, Any]:
    """List user-defined functions."""
    query = """
        SELECT
            p.proname as function_name,
            pg_get_function_arguments(p.oid) as arguments,
            pg_get_function_result(p.oid) as return_type,
            CASE p.prokind
                WHEN 'f' THEN 'function'
                WHEN 'p' THEN 'procedure'
                WHEN 'a' THEN 'aggregate'
                WHEN 'w' THEN 'window'
            END as kind
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        ORDER BY p.proname;
    """
    return execute_sql(query)


def handle_db_list_triggers(params: Dict) -> Dict[str, Any]:
    """List all triggers."""
    table_name = params.get("table_name", "").strip()

    query = """
        SELECT
            trigger_name,
            event_manipulation as event,
            event_object_table as table_name,
            action_timing as timing,
            action_statement as action
        FROM information_schema.triggers
        WHERE trigger_schema = 'public'
    """

    if table_name:
        query += " AND event_object_table = %s"
        query += " ORDER BY trigger_name;"
        return execute_sql(query, (table_name,))
    else:
        query += " ORDER BY event_object_table, trigger_name;"
        return execute_sql(query)


def handle_db_list_enums(params: Dict) -> Dict[str, Any]:
    """List all enum types."""
    query = """
        SELECT
            t.typname as enum_name,
            array_agg(e.enumlabel ORDER BY e.enumsortorder) as values
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE n.nspname = 'public'
        GROUP BY t.typname
        ORDER BY t.typname;
    """
    return execute_sql(query)


def handle_db_list_extensions(params: Dict) -> Dict[str, Any]:
    """List installed extensions."""
    query = """
        SELECT extname, extversion, extrelocatable
        FROM pg_extension
        ORDER BY extname;
    """
    return execute_sql(query)


# =============================================================================
# RLS (Row Level Security) OPERATIONS
# =============================================================================

def handle_db_list_policies(params: Dict) -> Dict[str, Any]:
    """List RLS policies."""
    table_name = params.get("table_name", "").strip()

    query = """
        SELECT
            schemaname,
            tablename,
            policyname,
            permissive,
            roles,
            cmd,
            qual as using_expression,
            with_check as with_check_expression
        FROM pg_policies
        WHERE schemaname = 'public'
    """

    if table_name:
        query += " AND tablename = %s"
        query += " ORDER BY policyname;"
        return execute_sql(query, (table_name,))
    else:
        query += " ORDER BY tablename, policyname;"
        return execute_sql(query)


def handle_db_check_rls(params: Dict) -> Dict[str, Any]:
    """Check RLS status for tables."""
    query = """
        SELECT
            relname as table_name,
            relrowsecurity as rls_enabled,
            relforcerowsecurity as rls_forced
        FROM pg_class
        WHERE relnamespace = 'public'::regnamespace
            AND relkind = 'r'
        ORDER BY relname;
    """
    return execute_sql(query)


def handle_db_enable_rls(params: Dict) -> Dict[str, Any]:
    """Enable RLS on a table."""
    table_name = params.get("table_name", "").strip()
    if not table_name:
        return {"success": False, "error": "table_name is required"}

    query = f"ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;"
    return execute_sql(query, fetch=False)


def handle_db_disable_rls(params: Dict) -> Dict[str, Any]:
    """Disable RLS on a table."""
    table_name = params.get("table_name", "").strip()
    if not table_name:
        return {"success": False, "error": "table_name is required"}

    query = f"ALTER TABLE {table_name} DISABLE ROW LEVEL SECURITY;"
    return execute_sql(query, fetch=False)


# =============================================================================
# DATA OPERATIONS
# =============================================================================

def handle_db_export_table(params: Dict) -> Dict[str, Any]:
    """Export table data as JSON."""
    table_name = params.get("table_name", "").strip()
    limit = params.get("limit", 1000)

    if not table_name:
        return {"success": False, "error": "table_name is required"}

    query = f"SELECT * FROM {table_name} LIMIT %s;"
    return execute_sql(query, (limit,))


def handle_db_export_csv(params: Dict) -> Dict[str, Any]:
    """Export table data as CSV string."""
    table_name = params.get("table_name", "").strip()
    limit = params.get("limit", 1000)

    if not table_name:
        return {"success": False, "error": "table_name is required"}

    result = execute_sql(f"SELECT * FROM {table_name} LIMIT %s;", (limit,))

    if not result.get("success") or not result.get("data"):
        return result

    # Convert to CSV
    output = io.StringIO()
    if result["data"]:
        writer = csv.DictWriter(output, fieldnames=result["data"][0].keys())
        writer.writeheader()
        writer.writerows(result["data"])

    return {"success": True, "csv": output.getvalue(), "row_count": len(result["data"])}


def handle_db_truncate_table(params: Dict) -> Dict[str, Any]:
    """Truncate a table (delete all rows)."""
    table_name = params.get("table_name", "").strip()
    cascade = params.get("cascade", False)

    if not table_name:
        return {"success": False, "error": "table_name is required"}

    # Safety: require confirmation
    confirm = params.get("confirm", False)
    if not confirm:
        return {"success": False, "error": "Set confirm=true to truncate table. This will DELETE ALL DATA!"}

    cascade_str = " CASCADE" if cascade else ""
    query = f"TRUNCATE TABLE {table_name}{cascade_str};"
    return execute_sql(query, fetch=False)


def handle_db_vacuum(params: Dict) -> Dict[str, Any]:
    """Vacuum a table or the database."""
    table_name = params.get("table_name", "").strip()
    analyze = params.get("analyze", True)

    analyze_str = " ANALYZE" if analyze else ""

    if table_name:
        query = f"VACUUM{analyze_str} {table_name};"
    else:
        query = f"VACUUM{analyze_str};"

    return execute_sql_raw(query)


# =============================================================================
# STATISTICS & MONITORING
# =============================================================================

def handle_db_table_stats(params: Dict) -> Dict[str, Any]:
    """Get table statistics."""
    table_name = params.get("table_name", "").strip()

    if table_name:
        query = """
            SELECT
                relname as table_name,
                n_live_tup as live_rows,
                n_dead_tup as dead_rows,
                n_mod_since_analyze as modifications_since_analyze,
                last_vacuum,
                last_autovacuum,
                last_analyze,
                last_autoanalyze
            FROM pg_stat_user_tables
            WHERE relname = %s;
        """
        return execute_sql(query, (table_name,))
    else:
        query = """
            SELECT
                relname as table_name,
                n_live_tup as live_rows,
                n_dead_tup as dead_rows,
                last_analyze
            FROM pg_stat_user_tables
            WHERE schemaname = 'public'
            ORDER BY n_live_tup DESC
            LIMIT 50;
        """
        return execute_sql(query)


def handle_db_index_usage(params: Dict) -> Dict[str, Any]:
    """Get index usage statistics."""
    query = """
        SELECT
            relname as table_name,
            indexrelname as index_name,
            idx_scan as scans,
            idx_tup_read as tuples_read,
            idx_tup_fetch as tuples_fetched,
            pg_size_pretty(pg_relation_size(indexrelid)) as size
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
        ORDER BY idx_scan DESC
        LIMIT 50;
    """
    return execute_sql(query)


def handle_db_active_connections(params: Dict) -> Dict[str, Any]:
    """Show active database connections."""
    query = """
        SELECT
            pid,
            usename as user,
            application_name,
            client_addr,
            state,
            query_start,
            LEFT(query, 100) as query_preview
        FROM pg_stat_activity
        WHERE datname = current_database()
        ORDER BY query_start DESC NULLS LAST
        LIMIT 20;
    """
    return execute_sql(query)


def handle_db_slow_queries(params: Dict) -> Dict[str, Any]:
    """Show currently running slow queries."""
    min_duration_seconds = params.get("min_duration_seconds", 5)

    query = """
        SELECT
            pid,
            usename as user,
            state,
            EXTRACT(EPOCH FROM (now() - query_start))::int as duration_seconds,
            LEFT(query, 200) as query_preview
        FROM pg_stat_activity
        WHERE datname = current_database()
            AND state = 'active'
            AND query_start < now() - interval '%s seconds'
        ORDER BY query_start;
    """
    return execute_sql(query, (min_duration_seconds,))


# =============================================================================
# SUPABASE STORAGE
# =============================================================================

def handle_db_list_buckets(params: Dict) -> Dict[str, Any]:
    """List Supabase storage buckets."""
    query = """
        SELECT id, name, public, file_size_limit, allowed_mime_types, created_at
        FROM storage.buckets
        ORDER BY name;
    """
    return execute_sql(query)


def handle_db_list_storage_objects(params: Dict) -> Dict[str, Any]:
    """List objects in a storage bucket."""
    bucket = params.get("bucket", "").strip()
    limit = params.get("limit", 100)

    if not bucket:
        return {"success": False, "error": "bucket is required"}

    query = """
        SELECT id, name, bucket_id,
               pg_size_pretty(metadata->>'size'::int) as size,
               metadata->>'mimetype' as mime_type,
               created_at
        FROM storage.objects
        WHERE bucket_id = %s
        ORDER BY created_at DESC
        LIMIT %s;
    """
    return execute_sql(query, (bucket, limit))


# =============================================================================
# UTILITY OPERATIONS
# =============================================================================

def handle_db_search_column(params: Dict) -> Dict[str, Any]:
    """Search for columns by name across all tables."""
    column_pattern = params.get("pattern", "").strip()
    if not column_pattern:
        return {"success": False, "error": "pattern is required"}

    query = """
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
            AND column_name ILIKE %s
        ORDER BY table_name, column_name;
    """
    return execute_sql(query, (f"%{column_pattern}%",))


def handle_db_search_data(params: Dict) -> Dict[str, Any]:
    """Search for a value in a specific table/column."""
    table_name = params.get("table_name", "").strip()
    column_name = params.get("column_name", "").strip()
    search_value = params.get("value", "").strip()

    if not all([table_name, column_name, search_value]):
        return {"success": False, "error": "table_name, column_name, and value are required"}

    query = f"SELECT * FROM {table_name} WHERE {column_name}::text ILIKE %s LIMIT 50;"
    return execute_sql(query, (f"%{search_value}%",))


def handle_db_generate_insert(params: Dict) -> Dict[str, Any]:
    """Generate INSERT statement for a table's data."""
    table_name = params.get("table_name", "").strip()
    limit = params.get("limit", 10)

    if not table_name:
        return {"success": False, "error": "table_name is required"}

    # Get column names
    col_result = execute_sql("""
        SELECT column_name FROM information_schema.columns
        WHERE table_name = %s ORDER BY ordinal_position;
    """, (table_name,))

    if not col_result.get("success"):
        return col_result

    columns = [row["column_name"] for row in col_result["data"]]

    # Get data
    data_result = execute_sql(f"SELECT * FROM {table_name} LIMIT %s;", (limit,))

    if not data_result.get("success"):
        return data_result

    # Generate INSERT statements
    inserts = []
    for row in data_result["data"]:
        values = []
        for col in columns:
            val = row.get(col)
            if val is None:
                values.append("NULL")
            elif isinstance(val, (int, float, bool)):
                values.append(str(val).lower() if isinstance(val, bool) else str(val))
            else:
                values.append(f"'{str(val)}'")

        inserts.append(f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({', '.join(values)});")

    return {"success": True, "statements": inserts, "count": len(inserts)}


# =============================================================================
# MCP TOOL DEFINITIONS
# =============================================================================

TOOLS = [
    # Core operations
    {"name": "db_query", "description": "Execute a SQL query (SELECT, INSERT, UPDATE, DELETE)",
     "inputSchema": {"type": "object", "properties": {"query": {"type": "string", "description": "SQL query"}}, "required": ["query"]}},
    {"name": "db_execute", "description": "Execute multi-statement SQL using psql",
     "inputSchema": {"type": "object", "properties": {"sql": {"type": "string", "description": "SQL statements"}}, "required": ["sql"]}},
    {"name": "db_list_tables", "description": "List all tables with sizes",
     "inputSchema": {"type": "object", "properties": {"schema": {"type": "string", "default": "public"}}}},
    {"name": "db_describe_table", "description": "Get column details for a table",
     "inputSchema": {"type": "object", "properties": {"table_name": {"type": "string"}}, "required": ["table_name"]}},
    {"name": "db_show_indexes", "description": "Show indexes for a table or all tables",
     "inputSchema": {"type": "object", "properties": {"table_name": {"type": "string"}}}},
    {"name": "db_show_foreign_keys", "description": "Show foreign key relationships",
     "inputSchema": {"type": "object", "properties": {"table_name": {"type": "string"}}}},
    {"name": "db_check_connection", "description": "Check database connection and info",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "db_table_exists", "description": "Check if a table exists",
     "inputSchema": {"type": "object", "properties": {"table_name": {"type": "string"}}, "required": ["table_name"]}},
    {"name": "db_row_count", "description": "Get row count for tables",
     "inputSchema": {"type": "object", "properties": {"table_name": {"type": "string"}}}},

    # Migrations
    {"name": "db_list_migrations", "description": "List Drizzle migration files",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "db_read_migration", "description": "Read migration file content",
     "inputSchema": {"type": "object", "properties": {"migration_name": {"type": "string"}}, "required": ["migration_name"]}},
    {"name": "db_apply_migration", "description": "Apply a Drizzle migration",
     "inputSchema": {"type": "object", "properties": {"migration_name": {"type": "string"}}, "required": ["migration_name"]}},

    # Schema
    {"name": "db_list_views", "description": "List all views",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "db_list_functions", "description": "List user-defined functions",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "db_list_triggers", "description": "List triggers",
     "inputSchema": {"type": "object", "properties": {"table_name": {"type": "string"}}}},
    {"name": "db_list_enums", "description": "List enum types",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "db_list_extensions", "description": "List installed extensions",
     "inputSchema": {"type": "object", "properties": {}}},

    # RLS
    {"name": "db_list_policies", "description": "List RLS policies",
     "inputSchema": {"type": "object", "properties": {"table_name": {"type": "string"}}}},
    {"name": "db_check_rls", "description": "Check RLS status for tables",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "db_enable_rls", "description": "Enable RLS on a table",
     "inputSchema": {"type": "object", "properties": {"table_name": {"type": "string"}}, "required": ["table_name"]}},
    {"name": "db_disable_rls", "description": "Disable RLS on a table",
     "inputSchema": {"type": "object", "properties": {"table_name": {"type": "string"}}, "required": ["table_name"]}},

    # Data
    {"name": "db_export_table", "description": "Export table data as JSON",
     "inputSchema": {"type": "object", "properties": {"table_name": {"type": "string"}, "limit": {"type": "integer", "default": 1000}}, "required": ["table_name"]}},
    {"name": "db_export_csv", "description": "Export table data as CSV",
     "inputSchema": {"type": "object", "properties": {"table_name": {"type": "string"}, "limit": {"type": "integer", "default": 1000}}, "required": ["table_name"]}},
    {"name": "db_truncate_table", "description": "Truncate a table (DANGEROUS)",
     "inputSchema": {"type": "object", "properties": {"table_name": {"type": "string"}, "cascade": {"type": "boolean"}, "confirm": {"type": "boolean"}}, "required": ["table_name", "confirm"]}},
    {"name": "db_vacuum", "description": "Vacuum table or database",
     "inputSchema": {"type": "object", "properties": {"table_name": {"type": "string"}, "analyze": {"type": "boolean", "default": True}}}},

    # Statistics
    {"name": "db_table_stats", "description": "Get table statistics",
     "inputSchema": {"type": "object", "properties": {"table_name": {"type": "string"}}}},
    {"name": "db_index_usage", "description": "Get index usage statistics",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "db_active_connections", "description": "Show active connections",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "db_slow_queries", "description": "Show slow running queries",
     "inputSchema": {"type": "object", "properties": {"min_duration_seconds": {"type": "integer", "default": 5}}}},

    # Storage
    {"name": "db_list_buckets", "description": "List Supabase storage buckets",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "db_list_storage_objects", "description": "List objects in a bucket",
     "inputSchema": {"type": "object", "properties": {"bucket": {"type": "string"}, "limit": {"type": "integer", "default": 100}}, "required": ["bucket"]}},

    # Utility
    {"name": "db_search_column", "description": "Search for columns by name pattern",
     "inputSchema": {"type": "object", "properties": {"pattern": {"type": "string"}}, "required": ["pattern"]}},
    {"name": "db_search_data", "description": "Search for a value in table/column",
     "inputSchema": {"type": "object", "properties": {"table_name": {"type": "string"}, "column_name": {"type": "string"}, "value": {"type": "string"}}, "required": ["table_name", "column_name", "value"]}},
    {"name": "db_generate_insert", "description": "Generate INSERT statements from table data",
     "inputSchema": {"type": "object", "properties": {"table_name": {"type": "string"}, "limit": {"type": "integer", "default": 10}}, "required": ["table_name"]}},
]

TOOL_HANDLERS = {
    # Core
    "db_query": handle_db_query,
    "db_execute": handle_db_execute,
    "db_list_tables": handle_db_list_tables,
    "db_describe_table": handle_db_describe_table,
    "db_show_indexes": handle_db_show_indexes,
    "db_show_foreign_keys": handle_db_show_foreign_keys,
    "db_check_connection": handle_db_check_connection,
    "db_table_exists": handle_db_table_exists,
    "db_row_count": handle_db_row_count,
    # Migrations
    "db_list_migrations": handle_db_list_migrations,
    "db_read_migration": handle_db_read_migration,
    "db_apply_migration": handle_db_apply_migration,
    # Schema
    "db_list_views": handle_db_list_views,
    "db_list_functions": handle_db_list_functions,
    "db_list_triggers": handle_db_list_triggers,
    "db_list_enums": handle_db_list_enums,
    "db_list_extensions": handle_db_list_extensions,
    # RLS
    "db_list_policies": handle_db_list_policies,
    "db_check_rls": handle_db_check_rls,
    "db_enable_rls": handle_db_enable_rls,
    "db_disable_rls": handle_db_disable_rls,
    # Data
    "db_export_table": handle_db_export_table,
    "db_export_csv": handle_db_export_csv,
    "db_truncate_table": handle_db_truncate_table,
    "db_vacuum": handle_db_vacuum,
    # Statistics
    "db_table_stats": handle_db_table_stats,
    "db_index_usage": handle_db_index_usage,
    "db_active_connections": handle_db_active_connections,
    "db_slow_queries": handle_db_slow_queries,
    # Storage
    "db_list_buckets": handle_db_list_buckets,
    "db_list_storage_objects": handle_db_list_storage_objects,
    # Utility
    "db_search_column": handle_db_search_column,
    "db_search_data": handle_db_search_data,
    "db_generate_insert": handle_db_generate_insert,
}


# =============================================================================
# MCP PROTOCOL
# =============================================================================

def send_response(response: Dict):
    sys.stdout.write(json.dumps(response) + "\n")
    sys.stdout.flush()


def handle_mcp_request(request: Dict) -> Optional[Dict]:
    method = request.get("method")
    params = request.get("params", {})
    req_id = request.get("id")

    if method == "initialize":
        return {
            "jsonrpc": "2.0", "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "db-mcp", "version": "2.0.0"}
            }
        }
    elif method == "tools/list":
        return {"jsonrpc": "2.0", "id": req_id, "result": {"tools": TOOLS}}
    elif method == "tools/call":
        tool_name = params.get("name")
        tool_args = params.get("arguments", {})
        handler = TOOL_HANDLERS.get(tool_name)
        if handler:
            try:
                result = handler(tool_args)
                return {
                    "jsonrpc": "2.0", "id": req_id,
                    "result": {"content": [{"type": "text", "text": json.dumps(result, indent=2, default=str)}]}
                }
            except Exception as e:
                return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32000, "message": str(e)}}
        return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Unknown tool: {tool_name}"}}
    elif method == "notifications/initialized":
        return None
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Method not found: {method}"}}


def main():
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            req = json.loads(line)
            res = handle_mcp_request(req)
            if res:
                send_response(res)
        except Exception as e:
            send_response({"jsonrpc": "2.0", "id": None, "error": {"code": -32000, "message": str(e)}})


# =============================================================================
# CLI
# =============================================================================

def cli():
    import argparse
    parser = argparse.ArgumentParser(description="Database MCP Server CLI")
    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # Basic commands
    subparsers.add_parser("check", help="Check database connection")
    subparsers.add_parser("tables", help="List all tables")
    subparsers.add_parser("migrations", help="List migrations")
    subparsers.add_parser("views", help="List views")
    subparsers.add_parser("functions", help="List functions")
    subparsers.add_parser("enums", help="List enums")
    subparsers.add_parser("extensions", help="List extensions")
    subparsers.add_parser("policies", help="List RLS policies")
    subparsers.add_parser("buckets", help="List storage buckets")
    subparsers.add_parser("connections", help="Show active connections")
    subparsers.add_parser("stats", help="Show table statistics")

    # Commands with arguments
    describe = subparsers.add_parser("describe", help="Describe a table")
    describe.add_argument("table", help="Table name")

    query_cmd = subparsers.add_parser("query", help="Run SQL query")
    query_cmd.add_argument("sql", help="SQL query")

    apply = subparsers.add_parser("apply", help="Apply a migration")
    apply.add_argument("migration", help="Migration file name")

    export_cmd = subparsers.add_parser("export", help="Export table data")
    export_cmd.add_argument("table", help="Table name")
    export_cmd.add_argument("--format", choices=["json", "csv"], default="json")
    export_cmd.add_argument("--limit", type=int, default=100)

    search = subparsers.add_parser("search", help="Search for columns")
    search.add_argument("pattern", help="Column name pattern")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    # Execute command
    result = None
    if args.command == "check":
        result = handle_db_check_connection({})
    elif args.command == "tables":
        result = handle_db_list_tables({})
    elif args.command == "migrations":
        result = handle_db_list_migrations({})
    elif args.command == "views":
        result = handle_db_list_views({})
    elif args.command == "functions":
        result = handle_db_list_functions({})
    elif args.command == "enums":
        result = handle_db_list_enums({})
    elif args.command == "extensions":
        result = handle_db_list_extensions({})
    elif args.command == "policies":
        result = handle_db_list_policies({})
    elif args.command == "buckets":
        result = handle_db_list_buckets({})
    elif args.command == "connections":
        result = handle_db_active_connections({})
    elif args.command == "stats":
        result = handle_db_table_stats({})
    elif args.command == "describe":
        result = handle_db_describe_table({"table_name": args.table})
    elif args.command == "query":
        result = handle_db_query({"query": args.sql})
    elif args.command == "apply":
        result = handle_db_apply_migration({"migration_name": args.migration})
    elif args.command == "export":
        if args.format == "csv":
            result = handle_db_export_csv({"table_name": args.table, "limit": args.limit})
        else:
            result = handle_db_export_table({"table_name": args.table, "limit": args.limit})
    elif args.command == "search":
        result = handle_db_search_column({"pattern": args.pattern})

    if result:
        print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    if len(sys.argv) > 1:
        cli()
    else:
        main()
