# Multiple Database Configuration

## Overview
The AQ Monitor now supports connecting to multiple Oracle databases simultaneously. Each database can have its own credentials and connection settings. The frontend provides a dropdown selector to filter queues by database.

## Backend Configuration

### 1. Configure Multiple Databases in `backend/config/config.json`

Add entries to the `databases` array:

```json
{
  "databases": [
    {
      "id": "main",
      "user": "sunrise",
      "password": "T02-Sunrise",
      "connectString": "(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=t-orap-db-02.swi.srse.net)(PORT=1901))(CONNECT_DATA=(SERVICE_NAME=t2kench_srv)))",
      "poolMin": 5,
      "poolMax": 20
    },
    {
      "id": "secondary",
      "user": "your_user",
      "password": "your_password",
      "connectString": "(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=your-host)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=your_service)))",
      "poolMin": 5,
      "poolMax": 20
    }
  ]
}
```

### 2. Database ID Field
- Each database must have a unique `id` field (e.g., "main", "secondary", "prod", "test")
- This ID is used to tag queue snapshots and filter data in the frontend
- The ID should be lowercase and use underscores or hyphens (no spaces)

### 3. How It Works

**Connection Pooling:**
- The backend automatically creates a connection pool for each database in the config
- Each pool maintains its own set of connections based on `poolMin` and `poolMax`

**Polling:**
- The poller queries all configured databases in parallel
- Each queue snapshot is tagged with the `db_id` of the database it came from
- Snapshots are stored in SQLite with the `db_id` field

**Data Storage:**
- SQLite schema includes `db_id` column (defaults to "main" for backward compatibility)
- Queue snapshots include: `queue_name`, `db_id`, `message_count`, `polled_at`, `last_dequeued`

## Frontend Usage

### Database Selector
When multiple databases are configured, a dropdown appears in the filter controls:

```
[Database ▼] [System User ▼] [Group ▼] [Search] [Status Filters]
```

- **All Databases**: Shows queues from all configured databases
- **Specific Database**: Shows only queues from the selected database (e.g., "MAIN (sunrise)")

### Single Database Mode
If only one database is configured, the dropdown is automatically hidden and that database is selected by default.

## API Endpoints

### List Databases
```
GET /api/system/databases
```
Returns list of configured databases:
```json
{
  "databases": [
    {
      "id": "main",
      "user": "sunrise",
      "connectString": "..."
    },
    {
      "id": "secondary",
      "user": "your_user",
      "connectString": "..."
    }
  ]
}
```

### Filter Queues by Database
```
GET /api/queues?dbId=main
GET /api/queues?dbId=secondary
GET /api/queues  (returns all databases)
```

## Migration Notes

### Existing Data
- The SQLite schema automatically adds the `db_id` column with a default value of "main"
- Existing queue snapshots will have `db_id = 'main'`
- No manual migration required

### Adding New Databases
1. Stop the backend server
2. Edit `backend/config/config.json` to add new database entry
3. Restart the backend server
4. The new database will automatically be polled
5. Frontend will show the database selector if multiple databases exist

## Example Configuration

### Development + Test Environment
```json
{
  "databases": [
    {
      "id": "dev",
      "user": "sunrise",
      "password": "dev-password",
      "connectString": "(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=d-orap-db-01.example.com)(PORT=1901))(CONNECT_DATA=(SERVICE_NAME=d1kench_srv)))",
      "poolMin": 5,
      "poolMax": 20
    },
    {
      "id": "test",
      "user": "sunrise",
      "password": "test-password",
      "connectString": "(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=t-orap-db-02.example.com)(PORT=1901))(CONNECT_DATA=(SERVICE_NAME=t2kench_srv)))",
      "poolMin": 5,
      "poolMax": 20
    }
  ]
}
```

### Multiple Production Databases
```json
{
  "databases": [
    {
      "id": "prod-us",
      "user": "aq_monitor",
      "password": "password1",
      "connectString": "...",
      "poolMin": 10,
      "poolMax": 50
    },
    {
      "id": "prod-eu",
      "user": "aq_monitor",
      "password": "password2",
      "connectString": "...",
      "poolMin": 10,
      "poolMax": 50
    }
  ]
}
```

## Troubleshooting

### Database Not Appearing in Dropdown
- Check that the database entry in config.json has a unique `id` field
- Verify the backend server restarted after config changes
- Check browser console for errors fetching `/api/system/databases`

### Queues Not Showing for Specific Database
- Check backend logs for connection errors to that database
- Verify credentials and connection string are correct
- Ensure the database user has SELECT privileges on `DBA_QUEUES`

### Performance with Multiple Databases
- Each database is polled in parallel, so total polling time ≈ slowest database
- Adjust `poolMin` and `poolMax` based on expected load
- Monitor connection pool usage in logs

## Related Files
- Backend: `backend/src/aq/oraclePool.ts` - Connection pool management
- Backend: `backend/src/aq/aqPoller.ts` - Parallel polling with db_id tagging
- Backend: `backend/src/db/snapshotStore.ts` - SQLite storage with db_id
- Backend: `backend/src/routes/system.ts` - Database list endpoint
- Frontend: `frontend/src/App.tsx` - Database selector UI
- Frontend: `frontend/src/hooks/useQueues.ts` - Queue fetching with dbId filter
