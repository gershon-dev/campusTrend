// Adds the Vercel Web Analytics snippet to every .html file in your project.
// Run from the project root (the campusTrend folder):   node add-analytics.js
// Safe to run again: files that already have it are skipped.
const fs = require('fs');
const path = require('path');

const SNIPPET = [
    '    <!-- Vercel Web Analytics -->',
    '    <script>window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };</script>',
    '    <script defer src="/_vercel/insights/script.js"></script>',
    ''
];
const SKIP = new Set(['node_modules', '.git', '.vercel']);
let added = 0, already = 0;

function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.toLowerCase().endsWith('.html')) patch(full);
    }
}

function patch(file) {
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes('/_vercel/insights/script.js')) { already++; return; }

    const i = text.search(/<\/head>/i);
    if (i === -1) { console.log('  skipped (no </head>):', path.relative(process.cwd(), file)); return; }

    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    fs.writeFileSync(file, text.slice(0, i) + SNIPPET.join(eol) + text.slice(i));
    added++;
    console.log('  added:', path.relative(process.cwd(), file));
}

walk(process.cwd());
console.log(`\nDone. Added to ${added} file(s); ${already} already had it.`);
