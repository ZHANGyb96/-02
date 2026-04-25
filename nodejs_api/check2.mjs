// check2.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const duckdb = require('duckdb');
const path = require('path');

const dbPath = path.resolve('../local_data/alphascan.duckdb');
const db = new duckdb.Database(dbPath, { access_mode: 'READ_ONLY' });
const con = db.connect();

// 查列信息
con.all("DESCRIBE kline_metrics", (err, rows) => {
    if (err) { console.error('DESCRIBE error:', err); return; }
    console.log('=== kline_metrics 列结构 ===');
    rows.forEach(r => console.log(r));
});

// 查一行数据看实际内容
con.all("SELECT * FROM kline_metrics LIMIT 1", (err, rows) => {
    if (err) { console.error('SELECT error:', err); return; }
    console.log('\n=== 第一行数据 ===');
    console.log(JSON.stringify(rows[0], null, 2));
});