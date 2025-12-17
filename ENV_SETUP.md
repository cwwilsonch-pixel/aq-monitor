# Environment Variables Setup Guide

This project uses environment variables to store sensitive credentials securely.

## Quick Start

1. **Copy the example file:**
   ```powershell
   Copy-Item backend\.env.example backend\.env
   ```

2. **Edit `.env` with your actual credentials:**
   ```powershell
   notepad backend\.env
   ```

3. **Start the server:**
   ```powershell
   cd backend
   npm run dev
   ```

## Environment Variables

### Required Variables

- `DB_USER` - Oracle database username
- `DB_PASSWORD` - Oracle database password
- `DB_CONNECT_STRING` - Oracle connection string
- `LDAP_BIND_DN` - LDAP bind user DN
- `LDAP_BIND_PASSWORD` - LDAP bind password
- `LDAP_URL` - LDAP server URL
- `LDAP_SEARCH_BASE` - LDAP search base DN

### Optional Variables

- `PORT` - Server port (default: 4001)
- `BASE_PATH` - API base path (default: /aq-monitor)
- `JWT_SECRET` - JWT signing secret (change in production)
- `SQLITE_FILE` - SQLite database path (default: ./data/aq-monitor.db)
- `RETENTION_DAYS` - Days to keep snapshot data (default: 30)
- `POLL_INTERVAL_MS` - Queue polling interval (default: 10000)

## Security Notes

⚠️ **IMPORTANT:**
- Never commit the `.env` file to git
- The `.env` file is already in `.gitignore`
- Use `.env.example` as a template (safe to commit)
- Rotate credentials regularly
- Use strong passwords

## Production Deployment

For production, consider:
1. Setting environment variables directly on the server
2. Using Windows Credential Manager
3. Using Azure Key Vault or similar secret management
4. Restricting file permissions on `.env`

## Verifying Setup

Check that credentials are loaded:
```powershell
cd backend
npm run dev
```

Look for: `Config loaded (credentials from env)` in the logs.
