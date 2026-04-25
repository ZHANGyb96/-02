const { execSync } = require('child_process');
const fs = require('fs');
try {
  const result = execSync('python test_pta.py');
  fs.writeFileSync('test_out_utf8.txt', result);
} catch (e) {
  fs.writeFileSync('test_out_utf8.txt', e.stderr || e.stdout || e.message);
}
