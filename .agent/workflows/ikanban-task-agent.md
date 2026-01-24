---
allowed_tools:
  - "Bash(python3:*)"
  - "Read(*)"
  - "TodoWrite"
---

# iKanban Task Agent

Work on: $ARGUMENTS

---

## Purpose

Create a new task for the iKanban project with proper tracking.

---

## Steps

### 1. Parse User Request

Extract from the user request:
- **Title**: Clear, concise task title (max 80 chars)
- **Description**: What, why, and acceptance criteria
- **Type**: frontend | backend | integration

### 2. Determine Task Type

| Keywords | Type |
|----------|------|
| component, page, hook, UI, button, form, style, React | `frontend` |
| API, endpoint, route, database, model, Rust, migration | `backend` |
| upload, auth, full feature, end-to-end, sync | `integration` |

### 3. Create Task

```bash
python3 /Users/rupeshpanwar/Downloads/Projects/iKanban/mcp/ikanban.py create IKA "<title>" -s inprogress -d "<description>"
```

**Description Format:**
```
What: <what the task accomplishes>
Why: <why it's needed>
Acceptance Criteria:
- [ ] <criterion 1>
- [ ] <criterion 2>
- [ ] <criterion 3>
```

### 4. Return Task Number

Output the IKA-XX number for use by other agents.

Example output:
```
Created: IKA-75
Title: Add dark mode toggle
Type: frontend
```

---

## Rules

1. **Always include description** - Never create task without `-d`
2. **Status inprogress** - Tasks start in progress
3. **Extract clear title** - Don't copy entire user request
4. **Include acceptance criteria** - Testable requirements

---

## Example

**User Request:** "Add a button to export user data as CSV"

**Command:**
```bash
python3 /Users/rupeshpanwar/Downloads/Projects/iKanban/mcp/ikanban.py create IKA "Add CSV export button for user data" -s inprogress -d "What: Add button to export user data as CSV file
Why: Users need to download their data for external analysis
Acceptance Criteria:
- [ ] Export button visible on user profile page
- [ ] CSV contains all user fields
- [ ] Download starts immediately on click
- [ ] Filename includes username and date"
```
