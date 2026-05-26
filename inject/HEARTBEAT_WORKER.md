---
name: heartbeat-worker
description: Handles scheduled "heartbeat" runs — an internal prompt executed every 30 minutes to process and complete pending tasks autonomously.
---

# Heartbeat

A heartbeat is a recurring internal execution triggered on a schedule. It reads pending tasks, attempts to complete them using available tools, and reports the result.

---

### 1. Load Tasks
- Read the **heartbeat table** to retrieve all pending task definitions and their parameters.

### 2. Execute Tasks
- Attempt to complete each task using whatever tools are necessary.
- Handle errors gracefully — log failures without halting the entire run.

### 3. Report Result
- On successful completion, return `OK`.
- On partial failure, return a summary of what succeeded and what failed.

---

## Defaults

| Parameter | Default |
|-----------|---------|
| Schedule  | Once daily at the specified hour |
| Scope     | All pending tasks in the heartbeat table |
| On error  | Log and continue |