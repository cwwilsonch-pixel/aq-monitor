# Encrypted Configuration Setup

This project uses encrypted configuration files to protect sensitive credentials.

## How It Works

1. **Sensitive values are encrypted** with AES-256-GCM encryption
2. **Master key** is stored as an environment variable (never in git)
3. **Encrypted config** can be safely committed to git
4. **At runtime**, the application decrypts values using the master key

## Setup Instructions

### 1. Encrypt Your Configuration

Run the encryption tool:

```powershell
cd backend
tsx scripts/encrypt-config.ts config/config.json
```

You'll be prompted to:
- Enter a master encryption key (minimum 16 characters - **save this securely!**)
- Confirm the key

The tool will create `config/config.encrypted.json` with encrypted passwords.

### 2. Set Environment Variable

**Option A: PowerShell Session (temporary)**
```powershell
$env:AQ_MONITOR_MASTER_KEY = "your-master-key-here"
npm run dev
```

**Option B: System Environment Variable (permanent)**
```powershell
[System.Environment]::SetEnvironmentVariable('AQ_MONITOR_MASTER_KEY', 'your-master-key-here', 'User')
```

**Option C: .env file (for development)**
Create `backend/.env`:
```
AQ_MONITOR_MASTER_KEY=your-master-key-here
```

Then update `package.json` to load .env:
```json
"dev": "node --env-file=.env --import tsx backend/src/server.ts"
```

### 3. Update Config Path

Rename or switch to using the encrypted config:

```powershell
# Backup original
mv config/config.json config/config.json.backup

# Use encrypted version
mv config/config.encrypted.json config/config.json
```

Or update `configManager.ts` to look for `config.encrypted.json` instead.

### 4. Update .gitignore

Add to your `.gitignore`:
```
config/config.json.backup
backend/.env
.env
```

Keep `config/config.json` in git (it now contains encrypted values).

## What Gets Encrypted

- `databases[].password` - Database passwords
- `auth.ldap.bindPassword` - LDAP bind password

All other configuration (URLs, timeouts, patterns, etc.) remains in plaintext.

## Security Notes

⚠️ **IMPORTANT**:
- Never commit your master key to git
- Store master key securely (password manager, Azure Key Vault, etc.)
- Rotate keys periodically by re-encrypting config with new key
- Encrypted values look like: `encrypted:abc123...`

## Verifying Encryption

Check your config file - passwords should look like:
```json
{
  "databases": [{
    "password": "encrypted:a1b2c3d4..."
  }],
  "auth": {
    "ldap": {
      "bindPassword": "encrypted:e5f6g7h8..."
    }
  }
}
```

## Troubleshooting

**Error: "AQ_MONITOR_MASTER_KEY environment variable not set"**
- Set the environment variable before starting the server

**Error: "Invalid encrypted data format"**
- Config may be corrupted - re-run encryption tool

**Error: "Authentication tag check failed"**
- Wrong master key - verify you're using the correct key

## Re-encrypting Config

If you need to change the master key:
1. Decrypt with old key (or use backup `config.json.backup`)
2. Run encryption tool with new master key
3. Update environment variable with new key
