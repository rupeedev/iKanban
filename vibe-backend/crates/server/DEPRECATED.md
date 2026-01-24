# DEPRECATED - Local Server

**Status: Maintenance Only - No New Features**

This crate (`crates/server`) is the local desktop server and is **deprecated**.

## Why Deprecated?

- All active development is in `crates/remote` (cloud API at api.scho1ar.com)
- Maintaining two backends with overlapping code is unsustainable
- The local desktop use case is being phased out

## What Still Lives Here?

- `src/bin/mcp_task_server.rs` - MCP server binary (uses `remote::mcp::TaskServer`)
- `src/bin/generate_types.rs` - Type generation utility

## Rules

1. **DO NOT** add new routes or features here
2. **DO NOT** duplicate code that exists in `crates/remote`
3. **DO** add new features to `crates/remote` instead
4. **DO** file bugs if something in this crate breaks

## Migration Path

If you need local server functionality:
1. Run `remote-server` locally with `VIBE_BACKEND_URL=http://localhost:8080`
2. For MCP: use stdio transport with local backend

## Contact

Questions? Check with the team before making changes here.
