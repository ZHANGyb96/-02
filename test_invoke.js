const { spawn } = require('child_process');

const pythonPath = 'python';
const scriptPath = 'd:\\studio02\\python_engine\\backtest.py';
const dbPath = 'd:\\studio02\\alphascan.duckdb';

const args = [
    scriptPath,
    '--db_path', dbPath,
    '--stock_code', 'SA9999',
    '--period', '1d',
    '--preset', 'ma_golden_cross'
];

console.log("Running:", pythonPath, args.join(" "));

const child = spawn(pythonPath, args);
let stdoutData = '';
let stderrData = '';

child.stdout.on('data', (data) => { stdoutData += data.toString(); });
child.stderr.on('data', (data) => { stderrData += data.toString(); });

child.on('close', (code) => {
    console.log("--- EXIT CODE ---");
    console.log(code);
    console.log("--- STDOUT ---");
    console.log(stdoutData);
    console.log("--- STDERR ---");
    console.log(stderrData);
});
