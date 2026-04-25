// check.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3');
const path = require('path');

const dbPath = path.resolve('../local_data/alphascan_tasks.sqlite');
const db = new sqlite3.Database(dbPath);

db.get("SELECT result_summary FROM backtest_tasks ORDER BY created_at DESC LIMIT 1", (err, row) => {
    if (err) { console.error(err); return; }
    const parsed = JSON.parse(row.result_summary);
    console.log(JSON.stringify(parsed, null, 2));
    db.close();
});