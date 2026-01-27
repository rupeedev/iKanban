# GitHub → iKanban Callback Workflow

This document explains the automated callback system that posts updates from GitHub to iKanban tasks.

## Overview

When agent-created issues and pull requests progress through their lifecycle, automated comments are posted back to the originating iKanban task to keep stakeholders informed.

## Workflow: `.github/workflows/ikanban-callback.yml`

### Three Automated Callbacks

| Event | When It Triggers | What Gets Posted |
|-------|------------------|------------------|
| **Issue Created** | Agent issue opened with `copilot` or `claude` label | 🎫 GitHub issue link, agent type, initial status |
| **PR Created** | Agent creates a pull request | 🔀 PR link, branch name, CI status waiting |
| **PR Merged** | Agent's PR is successfully merged | ✅ Completion comment with full details + task marked done |

## PR Merged Callback (Primary Feature)

When an agent's pull request is merged, the workflow automatically:

### 1. Posts Completion Comment

```markdown
✅ **Pull Request Merged**

Agent: Claude
PR: [#123](https://github.com/rupeedev/iKanban/pull/123)
Merged by: auto-merge
Changes: +150 -45 in 8 file(s)

**Task completed successfully!** The code has been merged to `main`.
```

### 2. Updates Task Status

The iKanban task status is automatically changed to `done`.

## How It Works

### Metadata Linking

Agent PRs contain hidden metadata linking them to iKanban tasks:

```html
<!-- ikanban-metadata
task_id: 550e8400-e29b-41d4-a716-446655440000
assignment_id: 660e8400-e29b-41d4-a716-446655440001
-->
```

### Discovery Process

1. **PR Merge Event** → Workflow triggers
2. **Find Linked Issue** → Searches PR body for `Fixes #123`, `Closes #456`, etc.
3. **Extract Metadata** → Gets `task_id` from issue or PR body
4. **Post to iKanban** → Calls REST API with completion comment
5. **Update Status** → Sets task to "done"

## Requirements

### GitHub Secret

The workflow requires `IKANBAN_API_TOKEN` to be configured:

**Path:** Repository Settings → Secrets and variables → Actions

**Secret Name:** `IKANBAN_API_TOKEN`

**Value:** API token from iKanban (usually starts with `vk_`)

### Agent Identification

PRs are recognized as agent-created if ANY of these match:

| Check | Value |
|-------|-------|
| PR author | `copilot-swe-agent[bot]` or `claude[bot]` |
| Branch prefix | `copilot/` or `claude/` |
| Linked issue label | `copilot` or `claude` |

## API Endpoints Used

| Action | Endpoint | Method |
|--------|----------|--------|
| Post comment | `https://api.scho1ar.com/api/tasks/{taskId}/comments` | POST |
| Update status | `https://api.scho1ar.com/api/tasks/{taskId}` | PUT |

## Troubleshooting

### Comment Not Posted

1. **Check secret**: Verify `IKANBAN_API_TOKEN` exists in GitHub repo settings
2. **Check metadata**: Ensure issue/PR contains iKanban metadata
3. **Check workflow logs**: Actions tab → iKanban Callback → View logs
4. **Check agent detection**: Verify PR author or branch matches patterns

### Task Not Marked Done

If comment posts but status doesn't update:
- Check API token permissions
- Verify task exists and is accessible
- Review workflow logs for error messages

## Testing

To manually test the workflow:

1. Create a GitHub issue with `copilot` label and iKanban metadata
2. Create a PR from branch `copilot/test-feature` that references the issue
3. Merge the PR
4. Check iKanban task for completion comment
5. Verify task status changed to "done"

## Why REST API Instead of MCP?

The issue description mentions "ikanban-remote MCP," but GitHub Actions workflows use the **REST API** directly because:

- **MCP** (Model Context Protocol) is for local client apps (Claude Desktop, CLI tools)
- **GitHub Actions** runs in ephemeral CI/CD environments
- **REST API** is the standard for automation workflows

The current implementation is **correct and follows best practices**.

## Files

| File | Purpose |
|------|---------|
| `.github/workflows/ikanban-callback.yml` | Main workflow implementation |
| `IMPLEMENTATION_SUMMARY.md` | Technical analysis |
| `PR_MERGE_CALLBACK_STATUS.md` | Current state documentation |
| `docs/IKANBAN_CALLBACK.md` | This file (user guide) |

---

**Last Updated:** 2026-01-21  
**Status:** ✅ Fully Implemented and Production Ready
