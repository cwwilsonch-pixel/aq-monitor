/**
 * Script to encrypt sensitive configuration values
 * 
 * Usage:
 *   tsx scripts/encrypt-config.ts <path-to-config.json>
 * 
 * You will be prompted for:
 *   - Master encryption key (store this securely!)
 *   - Which fields to encrypt
 * 
 * The script will create a new file: config.encrypted.json
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { encryptConfig } from '../src/config/encryption.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function questionHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    
    // Hide input
    if (process.stdin.isTTY) {
      (process.stdin as any).setRawMode(true);
    }
    
    let password = '';
    process.stdin.once('data', (chunk) => {
      const data = chunk.toString();
      
      for (const char of data) {
        if (char === '\r' || char === '\n') {
          break;
        } else if (char === '\x7f' || char === '\b') {
          password = password.slice(0, -1);
        } else {
          password += char;
        }
      }
      
      if (process.stdin.isTTY) {
        (process.stdin as any).setRawMode(false);
      }
      
      process.stdout.write('\n');
      resolve(password);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: tsx scripts/encrypt-config.ts <path-to-config.json>');
    process.exit(1);
  }
  
  const configPath = args[0];
  
  if (!fs.existsSync(configPath)) {
    console.error(`File not found: ${configPath}`);
    process.exit(1);
  }
  
  console.log('=== Configuration Encryption Tool ===\n');
  console.log(`Reading: ${configPath}\n`);
  
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  // Get master key
  const masterKey = await questionHidden('Enter master encryption key (store this securely!): ');
  
  if (!masterKey || masterKey.length < 16) {
    console.error('\nMaster key must be at least 16 characters long');
    rl.close();
    process.exit(1);
  }
  
  const confirmKey = await questionHidden('Confirm master encryption key: ');
  
  if (masterKey !== confirmKey) {
    console.error('\nKeys do not match');
    rl.close();
    process.exit(1);
  }
  
  console.log('\n--- Sensitive Fields to Encrypt ---');
  console.log('The following will be encrypted:');
  console.log('  - databases[].password');
  console.log('  - auth.ldap.bindPassword');
  console.log('');
  
  // Create encrypted config structure
  const encryptedConfig = JSON.parse(JSON.stringify(config));
  
  // Encrypt database passwords
  if (config.databases && Array.isArray(config.databases)) {
    for (let i = 0; i < config.databases.length; i++) {
      if (config.databases[i].password) {
        const encrypted = encryptConfig(config.databases[i].password, masterKey);
        encryptedConfig.databases[i].password = `encrypted:${encrypted}`;
        console.log(`✓ Encrypted databases[${i}].password`);
      }
    }
  }
  
  // Encrypt LDAP bind password
  if (config.auth?.ldap?.bindPassword) {
    const encrypted = encryptConfig(config.auth.ldap.bindPassword, masterKey);
    encryptedConfig.auth.ldap.bindPassword = `encrypted:${encrypted}`;
    console.log('✓ Encrypted auth.ldap.bindPassword');
  }
  
  // Write encrypted config
  const outputPath = path.join(
    path.dirname(configPath),
    'config.encrypted.json'
  );
  
  fs.writeFileSync(
    outputPath,
    JSON.stringify(encryptedConfig, null, 2),
    'utf8'
  );
  
  console.log(`\n✅ Encrypted configuration written to: ${outputPath}`);
  console.log('\n⚠️  IMPORTANT:');
  console.log('   1. Store your master key securely (password manager, key vault, etc.)');
  console.log('   2. Set environment variable: AQ_MONITOR_MASTER_KEY=<your-key>');
  console.log('   3. Update configManager.ts to use config.encrypted.json');
  console.log('   4. Add config.json to .gitignore (commit config.encrypted.json instead)');
  console.log('   5. Never commit the master key to git!\n');
  
  rl.close();
}

main().catch(err => {
  console.error('Error:', err.message);
  rl.close();
  process.exit(1);
});
