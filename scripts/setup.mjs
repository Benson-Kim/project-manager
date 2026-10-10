import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const envExamplePath = path.join(rootDir, '.env.example');

console.log("=========================================");
console.log(" Project Manager — Automated Installer");
console.log("=========================================\n");

// 1. Create .env if it doesn't exist
if (!fs.existsSync(envPath)) {
  console.log("⚙️  Creating configuration file (.env)...");
  if (fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
  } else {
    fs.writeFileSync(envPath, "");
  }
} else {
  console.log("ℹ️  Existing .env configuration found.");
}

// 2. Auto-generate secure AUTH_SECRET if missing or default
let envContent = fs.readFileSync(envPath, 'utf8');

if (!envContent.includes('AUTH_SECRET=') || envContent.includes('generate-me-with-openssl-rand-base64-32')) {
  console.log("🔑 Generating secure AUTH_SECRET...");
  const authSecret = crypto.randomBytes(32).toString('base64');
  if (envContent.includes('AUTH_SECRET=generate-me-with-openssl-rand-base64-32')) {
    envContent = envContent.replace('AUTH_SECRET=generate-me-with-openssl-rand-base64-32', `AUTH_SECRET=${authSecret}`);
  } else {
    envContent += `\nAUTH_SECRET=${authSecret}\n`;
  }
}

// 3. Auto-generate random seed admin password if missing
if (envContent.includes('SEED_ADMIN_PASSWORD=changeMe_Initial_Admin!')) {
  const adminPass = 'Admin_' + crypto.randomBytes(6).toString('hex') + '!';
  envContent = envContent.replace('SEED_ADMIN_PASSWORD=changeMe_Initial_Admin!', `SEED_ADMIN_PASSWORD=${adminPass}`);
  console.log(`🔐 Initial Admin Password set to: ${adminPass}`);
}

fs.writeFileSync(envPath, envContent);
console.log("\n✅ Configuration ready!");
console.log("\nNext Steps:");
console.log(" 1. Run 'npm run dev' to start the web application");
console.log(" 2. Open http://localhost:3000 in your browser\n");
