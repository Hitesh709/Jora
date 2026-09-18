# Jora Control Center

A lightweight operator dashboard served as a static asset. It reads the existing operator API endpoints for status, metrics, executions, jobs, and observability.

The dashboard intentionally contains no privileged credentials in source. If the API requires a bearer token, enter it in the browser session.

## Current scope
- system and worker status
- execution count and recent executions
- runtime metrics
- queue jobs
- observability events
- 10-second refresh

This is an operator surface, not a replacement for API authentication or deployment security.
