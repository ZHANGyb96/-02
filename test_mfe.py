import pandas as pd
import numpy as np

data = {
    'close': [100, 110, 105, 120, 90, 95],
    'high': [102, 112, 110, 125, 95, 100],
    'low': [98, 105, 100, 115, 85, 90]
}
df = pd.DataFrame(data)

p = 2
print("p =", p)
df_rev = df[::-1]

future_max = df_rev['high'].rolling(window=p, min_periods=p).max()[::-1].shift(-1)
future_min = df_rev['low'].rolling(window=p, min_periods=p).min()[::-1].shift(-1)

print("Future Max:\n", future_max)
print("Future Min:\n", future_min)
