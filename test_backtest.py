import duckdb
import pandas as pd
import sys
import subprocess

# 1. Create a mock db
con = duckdb.connect('d:/studio02/local_data/test.duckdb')
con.execute('CREATE TABLE IF NOT EXISTS kline_metrics(time TIMESTAMP, stock_code VARCHAR, stock_name VARCHAR, period VARCHAR, open DOUBLE, high DOUBLE, low DOUBLE, close DOUBLE, volume DOUBLE)')
con.execute("DELETE FROM kline_metrics")

# 2. Insert dummy data (uprend)
for i in range(15):
    con.execute(f"INSERT INTO kline_metrics VALUES ('2023-01-{i+1:02d} 00:00:00', '000001', 'Test', '1d', 10+{i}, 11+{i}, 9+{i}, 10+{i}, 1000)")
con.close()

# 3. Call backtest.py logic using subprocess
try:
    res = subprocess.check_output(['python', 'd:/studio02/python_engine/backtest.py', '--db_path', 'd:/studio02/local_data/test.duckdb', '--stock_code', '000001', '--period', '1d', '--conditions', '{"left": "ma5", "op": ">", "right": "ma10"}'])
    print('SUCCESS:', res.decode('utf-8'))
except Exception as e:
    print('FAIL:', e)
