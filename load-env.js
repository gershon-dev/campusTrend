// ============================================================
// CampusTrend Admin Panel - Local Key Injector
// ============================================================
// SETUP (one time):
//   1. npm install dotenv
//   2. Create a .env file in this same folder with:
//      SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
//   3. Make sure .env and admin-local.html are in .gitignore
//
// USAGE (every time you want to open the admin panel):
//   node load-env.js
//   Then open admin-local.html in your browser
// ============================================================

const fs   = require('fs');
const path = require('path');

// Load .env file
require('dotenv').config();

const KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INPUT     = path.join(__dirname, 'admin.html');
const OUTPUT    = path.join(__dirname, 'admin-local.html');
const MARKER    = "const SUPABASE_SERVICE_ROLE_KEY = '';";

// ── Validate ────────────────────────────────────────────────
if (!KEY) {
    console.error('\n❌  No SUPABASE_SERVICE_ROLE_KEY found in .env');
    console.error('    Create a .env file with:');
    console.error('    SUPABASE_SERVICE_ROLE_KEY=your_key_here\n');
    process.exit(1);
}

if (!fs.existsSync(INPUT)) {
    console.error('\n❌  admin.html not found in this directory.\n');
    process.exit(1);
}

// ── Read & inject ────────────────────────────────────────────
let html = fs.readFileSync(INPUT, 'utf8');

if (!html.includes(MARKER)) {
    console.error('\n❌  Marker not found in admin.html.');
    console.error(`    Make sure this line exists in admin.html:`);
    console.error(`    ${MARKER}\n`);
    process.exit(1);
}

html = html.replace(MARKER, `const SUPABASE_SERVICE_ROLE_KEY = '${KEY}';`);

fs.writeFileSync(OUTPUT, html, 'utf8');

console.log('\n✅  admin-local.html created successfully!');
console.log('    Open admin-local.html in your browser to use the admin panel.');
console.log('    ⚠️  Never commit admin-local.html or .env to GitHub.\n');
