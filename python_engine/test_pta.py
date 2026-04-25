import pandas as pd
import pandas_ta as pta
df = pd.DataFrame({'high': range(100), 'low': range(100), 'close': range(100)})

try:
    c = pta.cci(df['high'], df['low'], df['close'])
    print(c.name)
except Exception as e:
    print("CCI Error:", e)

try:
    bb = pta.bbands(df['close'], length=20, std=2)
    print(bb.columns.tolist())
except Exception as e:
    print("BB Error:", e)

try:
    adx_res = pta.adx(df['high'], df['low'], df['close'], length=14)
    print("ADX:", adx_res.columns.tolist())
except Exception as e:
    print("ADX Error:", e)

try:
    lon = pta.ema(df['close'], length=10)
    print("LON:", lon.name)
except Exception as e:
    print("LON Error:", e)
