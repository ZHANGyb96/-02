import sys
import json
import argparse
import duckdb
import pandas as pd
import pandas_ta as pta
import numpy as np
import math
import traceback
from itertools import product
import gc

# 主周期时长映射（分钟），用于分钟级持仓换算
PERIOD_MINUTES = {
    '1m': 1, '5m': 5, '15m': 15, '30m': 30,
    '60m': 60, '120m': 120, '240m': 240,
    '1d': 480, '1w': 2400
}

# 指标缓存：避免同一 DataFrame 上重复计算相同指标
_indicator_cache = {}


def compute_indicator(df, name):
    """计算技术指标，内置缓存避免重复计算。支持跨周期后缀如 ma5_1d。"""
    if name is None:
        return None
    name_str = str(name).lower().strip()

    df_id = getattr(df, '__cache_id__', id(df))
    cache_key = (df_id, name_str)

    if cache_key in _indicator_cache:
        return _indicator_cache[cache_key]

    try:
        result = _compute_indicator_impl(df, name_str)
        if isinstance(result, pd.Series):
            if len(result) == len(df):
                result = result.set_axis(df.index)
            else:
                sys.stderr.write(
                    f"[WARN] indicator {name_str} length {len(result)} != df length {len(df)}, discarding\n"
                )
                result = None
        _indicator_cache[cache_key] = result
        return result
    except Exception as e:
        sys.stderr.write(f"[ERROR] compute_indicator({name_str}) failed: {e}\n")
        return None


def _compute_indicator_impl(df, name_str):
    """指标计算的实际实现。"""

    # ── 优先检查 DataFrame 中是否已有该列（预计算列） ──
    col_lower_map = {str(c).lower().strip(): c for c in df.columns}
    if name_str in col_lower_map:
        actual_col = col_lower_map[name_str]
        series = pd.to_numeric(df[actual_col], errors='coerce')
        if series.notna().any():
            return series

    VALID_PERIODS = {'1m', '5m', '15m', '30m', '60m', '120m', '240m', '1d', '1w'}

    # 解析跨周期后缀，如 'ma5_1d'
    parts = name_str.split('_')
    if len(parts) > 1 and parts[-1] in VALID_PERIODS:
        base_indicator = "_".join(parts[:-1])
        col_suffix = f"_{parts[-1]}"

        # 如果我们在主流程中遇到了携带合规周期的后缀，说明它没有被外部（如 `_fetch_and_align`）预先注入。
        # 绝大多数情况下意味着副周期数据缺失，我们直接返回 NaN 序列而不能错误地在当前周期计算。
        sys.stderr.write(f"[WARN] Indicator {name_str} was requested but not found in pre-merged MTF columns. Returning NaN.\n")
        return pd.Series(np.nan, index=df.index)

    # ===== MA 均线 =====
    try:
        if name_str.startswith('ma') and name_str[2:].isdigit():
            return pta.sma(df['close'], length=int(name_str[2:]))
        if name_str.startswith('vol_ma') and name_str[6:].isdigit():
            return pta.sma(df['volume'], length=int(name_str[6:]))
    except Exception as e:
        sys.stderr.write(f"[DEBUG] MA calculation failed for {name_str}: {e}\n")

    # ===== 其他标准指标 =====
    try:
        if name_str.startswith('rsi'):
            rest = name_str[3:].lstrip('_')
            return pta.rsi(df['close'], length=int(rest)) if rest.isdigit() else None

        if name_str.startswith('bias'):
            rest = name_str[4:].lstrip('_')
            if rest.isdigit():
                ma = pta.sma(df['close'], length=int(rest))
                return (df['close'] - ma) / ma * 100

        if name_str.startswith('macd'):
            macd = pta.macd(df['close'])
            if name_str == 'macd':        return macd['MACD_12_26_9']
            if name_str == 'macd_hist':   return macd['MACDh_12_26_9']
            if name_str == 'macd_signal': return macd['MACDs_12_26_9']

        if name_str.startswith('kdj_'):
            kdj = pta.kdj(df['high'], df['low'], df['close'])
            if name_str == 'kdj_k': return kdj['K_9_3']
            if name_str == 'kdj_d': return kdj['D_9_3']
            if name_str == 'kdj_j': return kdj['J_9_3']

        if name_str.startswith('boll_'):
            bb = pta.bbands(df['close'], length=20, std=2)
            if bb is not None and not bb.empty:
                for c in bb.columns:
                    if name_str == 'boll_upper'  and c.startswith('BBU'): return bb[c]
                    if name_str == 'boll_middle' and c.startswith('BBM'): return bb[c]
                    if name_str == 'boll_lower'  and c.startswith('BBL'): return bb[c]
            return None

        if name_str == 'cci' or (name_str.startswith('cci') and name_str[3:].lstrip('_').isdigit()):
            rest = name_str[3:].lstrip('_')
            length = int(rest) if rest else 14
            
            # 采用纯 Pandas 向量化极速计算 CCI，解决 pandas_ta 分钟级数据计算超时和极值报错
            tp = (df['high'] + df['low'] + df['close']) / 3.0
            sma_tp = tp.rolling(window=length, min_periods=1).mean()
            
            # 极速 MAD (Mean Absolute Deviation)
            mad = pd.Series(0.0, index=df.index)
            count = pd.Series(0.0, index=df.index)
            
            for i in range(length):
                shifted_tp = tp.shift(i)
                diff = (shifted_tp - sma_tp).abs().fillna(0.0)
                is_valid = shifted_tp.notna().astype(float)
                mad += diff
                count += is_valid
                
            mad = mad / count
            
            # 避免分钟级横盘导致除以 0，将其安全替换为 0.0 的 CCI 结果
            mad = mad.replace(0.0, np.nan)
            cci_res = (tp - sma_tp) / (0.015 * mad)
            return cci_res.fillna(0.0)

        if name_str in ('trix', 'trma'):
            ema1 = pta.ema(df['close'], length=12)
            ema2 = pta.ema(ema1, length=12)
            ema3 = pta.ema(ema2, length=12)
            trix_line = ema3.pct_change() * 100
            if name_str == 'trix': return trix_line
            return pta.sma(trix_line, length=9)

        if name_str in ('pdi', 'mdi', 'adx', 'adxr'):
            adx_res = pta.adx(df['high'], df['low'], df['close'], length=14)
            if name_str == 'adx':  return adx_res['ADX_14']
            if name_str == 'pdi':  return adx_res['DMP_14']
            if name_str == 'mdi':  return adx_res['DMN_14']
            return (adx_res['ADX_14'] + adx_res['ADX_14'].shift(6)) / 2

        if name_str == 'bbi':
            ma3  = pta.sma(df['close'], length=3)
            ma6  = pta.sma(df['close'], length=6)
            ma12 = pta.sma(df['close'], length=12)
            ma24 = pta.sma(df['close'], length=24)
            return (ma3 + ma6 + ma12 + ma24) / 4

        if name_str in ('dpo', 'madpo'):
            ma20 = pta.sma(df['close'], length=20)
            dpo  = df['close'] - ma20.shift(11)
            return dpo if name_str == 'dpo' else pta.sma(dpo, length=10)

        if name_str in ('lon', 'lonma'):
            lon = pta.ema(df['close'], length=10)
            return lon if name_str == 'lon' else pta.sma(lon, length=10)

        if name_str == 'atr' or (name_str.startswith('atr') and name_str[3:].lstrip('_').isdigit()):
            rest = name_str[3:].lstrip('_')
            return pta.atr(df['high'], df['low'], df['close'], length=int(rest) if rest else 14)

        if name_str in ('wr', 'willr') or (name_str.startswith('wr') and name_str[2:].isdigit()):
            rest = name_str[2:]
            return pta.willr(df['high'], df['low'], df['close'], length=int(rest) if rest else 14)

        if name_str == 'obv':
            return pta.obv(df['close'], df['volume'])

    except Exception as e:
        sys.stderr.write(f"[DEBUG] Standard indicator {name_str} failed: {e}\n")

    # 最后尝试解析为纯数字（常量右值，如 CCI > 180）
    try:
        return float(name_str)
    except Exception:
        return None


def evaluate_rule(df, rule):
    left_name  = rule.get('left')
    op         = rule.get('op')
    right_name = rule.get('right')

    left_series  = compute_indicator(df, left_name)
    right_series = compute_indicator(df, right_name)

    if left_series is None or right_series is None:
        return pd.Series(False, index=df.index)

    try:
        if op == '>':  res = left_series > right_series
        elif op == '<':  res = left_series < right_series
        elif op == '>=': res = left_series >= right_series
        elif op == '<=': res = left_series <= right_series
        elif op == '==': res = left_series == right_series
        elif op == '!=': res = left_series != right_series
        elif op == 'up_cross':
            r_prev = right_series.shift(1) if hasattr(right_series, 'shift') else right_series
            res = (left_series.shift(1) <= r_prev) & (left_series > right_series)
        elif op == 'down_cross':
            r_prev = right_series.shift(1) if hasattr(right_series, 'shift') else right_series
            res = (left_series.shift(1) >= r_prev) & (left_series < right_series)
        else:            res = False

        if not hasattr(res, 'index'):
            return pd.Series(res, index=df.index)
        return res.fillna(False)
    except Exception as e:
        sys.stderr.write(f"[ERROR] evaluate_rule execution error: {e}\n")
        return pd.Series(False, index=df.index)


def parse_conditions(df, node):
    """
    解析策略条件树。
    兼容新格式 {"logic": "AND", "conditions": [...]}
    以及旧格式 {"logicalOperator": "AND", "rules": [...]}
    """
    if not node:
        return pd.Series(True, index=df.index)

    if 'logic' in node and 'conditions' in node:
        logic_op = node['logic']
        rules = node.get('conditions', [])
        if not rules:
            return pd.Series(True, index=df.index)
        masks = [parse_conditions(df, r) for r in rules]
        mask  = masks[0]
        for m in masks[1:]:
            mask = mask & m if logic_op == 'AND' else mask | m
        return mask

    if 'logicalOperator' in node:
        logic_op = node['logicalOperator']
        rules = node.get('rules', [])
        if not rules:
            return pd.Series(True, index=df.index)
        mask = parse_conditions(df, rules[0])
        for rule in rules[1:]:
            m    = parse_conditions(df, rule)
            mask = mask & m if logic_op == 'AND' else mask | m
        return mask

    return evaluate_rule(df, node)


def apply_preset(df, preset_name):
    """内置预设策略的向量化计算路径（完整 6 个预设）。"""
    df['ma5']    = pta.sma(df['close'], length=5)
    df['ma10']   = pta.sma(df['close'], length=10)
    df['ma20']   = pta.sma(df['close'], length=20)
    df['ma60']   = pta.sma(df['close'], length=60)
    df['vol_ma5']  = pta.sma(df['volume'], length=5)
    df['vol_ma20'] = pta.sma(df['volume'], length=20)

    mask = pd.Series(False, index=df.index)

    if preset_name == 'bull_trend':
        mask = (df['ma5'] > df['ma10']) & (df['ma10'] > df['ma20']) & (df['close'] > df['ma5'])

    elif preset_name == 'ma_golden_cross':
        cross      = (df['ma5'].shift(1) <= df['ma10'].shift(1)) & (df['ma5'] > df['ma10'])
        vol_check  = df['volume'] > (df['vol_ma5'] * 1.2)
        bias_check = ((df['close'] - df['ma5']).abs() / df['ma5']) < 0.05
        mask = cross & vol_check & bias_check

    elif preset_name == 'volume_breakout':
        past_high_20   = df['high'].rolling(window=20).max().shift(1)
        price_breakout = df['close'] > past_high_20
        vol_breakout   = df['volume'] > (df['vol_ma5'] * 2)
        mask = price_breakout & vol_breakout

    elif preset_name == 'shrink_pullback':
        bull_bg  = (df['ma5'] > df['ma10']) & (df['ma10'] > df['ma20'])
        pullback = (df['low'] <= df['ma10']) | (df['low'] <= df['ma20'])
        shrink   = df['volume'] < (df['vol_ma5'] * 0.8)
        mask     = bull_bg & pullback & shrink

    elif preset_name == 'bottom_volume':
        downtrend = df['close'] < df['ma60']
        spike_vol = df['volume'] > (df['vol_ma20'] * 3)
        stabilize = df['close'] > df['open']
        mask      = downtrend & spike_vol & stabilize

    elif preset_name == 'one_yang_three_yin':
        yin_1 = df['close'].shift(1) < df['open'].shift(1)
        yin_2 = df['close'].shift(2) < df['open'].shift(2)
        yin_3 = df['close'].shift(3) < df['open'].shift(3)
        lower_close = (
            (df['close'].shift(1) < df['close'].shift(2)) &
            (df['close'].shift(2) < df['close'].shift(3))
        )
        yang   = df['close'] > df['open']
        engulf = (df['close'] > df['open'].shift(3)) & (df['close'] > df['high'].shift(1))
        mask   = yin_1 & yin_2 & yin_3 & lower_close & yang & engulf

    return mask.fillna(False)


def inject_params(node, params):
    """递归替换条件树中的占位符，如 '{{ma_len}}' → '20'。"""
    if isinstance(node, dict):
        return {k: inject_params(v, params) for k, v in node.items()}
    elif isinstance(node, list):
        return [inject_params(i, params) for i in node]
    elif isinstance(node, str):
        for p_name, p_val in params.items():
            placeholder = "{{" + p_name + "}}"
            if placeholder in node:
                if node == placeholder:
                    return p_val
                node = node.replace(placeholder, str(p_val))
        return node
    return node


def extract_all_indicators(node, indicators):
    """递归提取所有指标字符串，兼容新旧两种条件格式。"""
    if isinstance(node, dict):
        if 'logic' in node and 'conditions' in node:
            for rule in node.get('conditions', []):
                extract_all_indicators(rule, indicators)
        elif 'logicalOperator' in node:
            for rule in node.get('rules', []):
                extract_all_indicators(rule, indicators)
        else:
            for field in ['left', 'right']:
                val = node.get(field)
                if isinstance(val, str):
                    indicators.add(val.lower().strip())
    elif isinstance(node, list):
        for item in node:
            extract_all_indicators(item, indicators)


def _build_period_indicators(base_conditions):
    """从条件树中提取跨周期指标需求，返回 period_indicators 和 needed_periods。"""
    referenced = set()
    extract_all_indicators(base_conditions, referenced)

    VALID_PERIODS = {'1m', '5m', '15m', '30m', '60m', '120m', '240m', '1d', '1w'}
    period_indicators = {}
    needed_periods    = set()

    for ind in referenced:
        parts = ind.split('_')
        if len(parts) > 1 and parts[-1] in VALID_PERIODS:
            p    = parts[-1]
            base = "_".join(parts[:-1])
            period_indicators.setdefault(p, []).append({'full': ind, 'base': base})
            needed_periods.add(p)

    return period_indicators, needed_periods


def _fetch_and_align(con, stock_code, main_period, needed_periods,
                     start_time, end_time, period_indicators):
    """
    从 DuckDB 拉取主周期与所有副周期数据，完成 MTF 跨周期对齐。
    返回对齐后的 working_df；若主周期数据为空则返回 None。
    """
    sql    = "SELECT * FROM kline_metrics WHERE stock_code = ? AND period = ?"
    params = [stock_code, main_period]
    if start_time:
        sql += " AND time >= ?"
        params.append(start_time)
    if end_time:
        sql += " AND time <= ?"
        params.append(end_time)
    sql += " ORDER BY time ASC"

    raw_main_df = con.execute(sql, params).df()
    if raw_main_df.empty:
        return None

    raw_main_df.columns = [str(c).lower().strip() for c in raw_main_df.columns]
    raw_main_df['time'] = pd.to_datetime(raw_main_df['time'])
    raw_main_df = raw_main_df.reset_index(drop=True)

    other_periods_raw = {}
    for p in needed_periods:
        aux_sql    = "SELECT * FROM kline_metrics WHERE stock_code = ? AND period = ?"
        aux_params = [stock_code, p]
        if start_time:
            # 强化型：放宽辅周期的启动时间，往前推 1000 天（约 3-4 年交易日）。
            # 用于确保诸如 MACD (需34根K线)、长周期均线(ma120) 在周线和月线级别能得到充足的初始计算数据。
            # 否则，长周期的指标会因为有效数据不足返回全 NaN，产生“有的指标有结果、有的没结果”的报错。
            aux_start = (pd.to_datetime(start_time) - pd.Timedelta(days=1000)).strftime('%Y-%m-%d')
            aux_sql   += " AND time >= ?"
            aux_params.append(aux_start)
        if end_time:
            aux_sql += " AND time <= ?"
            aux_params.append(end_time)
        aux_sql += " ORDER BY time ASC"

        aux_df = con.execute(aux_sql, aux_params).df()
        if not aux_df.empty:
            aux_df.columns = [str(c).lower().strip() for c in aux_df.columns]
            aux_df['time'] = pd.to_datetime(aux_df['time'])
            
            # 【完美解决未来函数与时序对齐】：
            # 如果请求的副周期(p)是日线/周线/月线，原生的 time 是 00:00:00。
            # 为了让向后寻找方向 (`direction='backward'`) 严格遵循真实世界，我们将其对齐至当日的收盘时间 15:00:00。
            # 如此一来，分钟线如 09:30 往回找，就不会找到今天的 1d 指标（因为 09:30 < 15:00），
            # 而是会找到前一个交易日的 15:00（即最新收盘数据），彻底阻断未来函数泄漏！
            if p in ('1d', '1w', '1M'):
                aux_df['time'] = aux_df['time'] + pd.Timedelta(hours=15)
                
            other_periods_raw[p] = aux_df.reset_index(drop=True)

    working_df = raw_main_df.copy()
    working_df.__cache_id__ = id(raw_main_df)

    # 修补多周期时间戳对齐缺陷：如果主周期是日线级别(1d, 1w)，它的记录时间戳通常是 00:00:00。
    # 如果直接 backward 连接 15 分钟线，会自动连接到前一天的 15:00:00。
    # 解决方法：临时把主周期的对齐时间推演到下午 15:00:00（收盘时间），这样就能精准匹配当前日内的副周期数据。
    if main_period in ('1d', '1w'):
        working_df['_merge_time'] = working_df['time'] + pd.Timedelta(hours=15)
    else:
        working_df['_merge_time'] = working_df['time'].copy()

    for p, indicators in period_indicators.items():
        if p not in other_periods_raw:
            sys.stderr.write(f"[WARN] Required period {p} not found in database for {stock_code}.\n")
            continue
        aux_df = other_periods_raw[p].copy()
        aux_df.__cache_id__ = id(other_periods_raw[p])

        for item in indicators:
            res = compute_indicator(aux_df, item['base'])
            if res is not None:
                aux_df[item['full']] = res

        cols_to_merge = (
            ['time'] +
            [item['full'] for item in indicators if item['full'] in aux_df.columns]
        )
        working_df = pd.merge_asof(
            working_df.sort_values('_merge_time'),
            aux_df[cols_to_merge].sort_values('time'),
            left_on='_merge_time',
            right_on='time',
            direction='backward',
            suffixes=('', '_aux')
        ).reset_index(drop=True)

        if 'time_aux' in working_df.columns:
            working_df.drop(columns=['time_aux'], inplace=True)
            
    working_df.drop(columns=['_merge_time'], inplace=True, errors='ignore')

    working_df.__cache_id__ = id(raw_main_df)
    return working_df


def extract_trades(df, conditions, preset_name, stock_code, main_period):
    """
    单只标的的策略执行与交易提取。
    返回 (trades_pool, total_signals)，每个 key 对应一个持仓周期的 DataFrame。
    """
    mask = apply_preset(df, preset_name) if preset_name else parse_conditions(df, conditions)

    signal_indices = df.index[mask]
    total_signals  = len(signal_indices)
    if total_signals == 0:
        return None

    high_arr  = df['high'].values
    low_arr   = df['low'].values
    close_arr = df['close'].values
    n         = len(df)
    time_col  = df['time'] if 'time' in df.columns else pd.Series(df.index, index=df.index)

    trades_pool = {}

    cycle_periods          = [3, 6, 9, 12, 15, 18, 24, 30]
    period_min             = PERIOD_MINUTES.get(main_period, 480)
    
    # 修复分钟级假象：如果要求的持有期计算分钟数(mt)小于主周期 K 线的分钟数，
    # 则完全跳过该周期的记录生成，不在面板中展示伪造数据。
    minute_periods_in_bars = []
    for mt in [5, 15, 30, 60, 120, 240]:
        bars = round(mt / period_min)
        if bars >= 1:
            minute_periods_in_bars.append((mt, bars))

    def _extract_for_period(p_bars, prefix_key):
        future_close = df['close'].shift(-p_bars)
        pnl_series   = ((future_close - df['close']) / df['close']) * 100

        mfe_values = np.full(n, np.nan)
        mae_values = np.full(n, np.nan)
        for idx in signal_indices:
            start = idx + 1
            end   = min(idx + p_bars + 1, n)
            if start >= n:
                continue
            wh = high_arr[start:end]
            wl = low_arr[start:end]
            if len(wh) > 0:
                mfe_values[idx] = ((wh.max() - close_arr[idx]) / close_arr[idx]) * 100
                mae_values[idx] = ((wl.min() - close_arr[idx]) / close_arr[idx]) * 100

        valid_df = pd.DataFrame({
            'time':       time_col.iloc[signal_indices].values,
            'stock_code': stock_code,
            'pnl':        pnl_series.iloc[signal_indices].values,
            'mfe':        mfe_values[signal_indices],
            'mae':        mae_values[signal_indices],
        }).dropna(subset=['pnl'])

        if not valid_df.empty:
            trades_pool[prefix_key] = valid_df

    for p in cycle_periods:
        _extract_for_period(p, f'c{p}')
    for (mt, bars) in minute_periods_in_bars:
        _extract_for_period(bars, f'm{mt}')

    return trades_pool, total_signals


def calculate_pooled_metrics(global_trades_pool, global_total_signals, minute_periods_in_bars):
    """
    对全市场横截面交易池进行统计评估。
    输出字段与原版单标的模式完全兼容，并额外携带 sharpe_* 和 max_dd_*。
    """
    results        = {'total_signals': global_total_signals}
    signal_details = {}   # (time_str, stock_code) -> dict

    # m{mt}_bars 元数据（前端需要）
    for mt, bars in minute_periods_in_bars:
        results[f'm{mt}_bars'] = bars

    for prefix, df_list in global_trades_pool.items():
        if not df_list:
            continue

        all_trades = (
            pd.concat(df_list, ignore_index=True)
            .sort_values('time')
            .reset_index(drop=True)
        )
        if all_trades.empty:
            continue

        valid_pnl = all_trades['pnl']
        valid_mfe = all_trades['mfe']
        valid_mae = all_trades['mae']

        wins   = valid_pnl[valid_pnl > 0]
        losses = valid_pnl[valid_pnl <= 0]

        # ── 基础统计（与原版字段完全一致） ──
        results[f'win_rate_{prefix}']     = round((len(wins) / len(valid_pnl)) * 100, 2)
        results[f'win_count_{prefix}']    = int(len(wins))
        results[f'loss_count_{prefix}']   = int(len(losses))
        results[f'avg_win_pnl_{prefix}']  = round(float(wins.mean()),      4) if len(wins)   > 0 else None
        results[f'avg_loss_pnl_{prefix}'] = round(float(losses.mean()),    4) if len(losses) > 0 else None
        results[f'avg_mfe_{prefix}']      = round(float(valid_mfe.mean()), 4) if len(valid_mfe) > 0 else None
        results[f'avg_mae_{prefix}']      = round(float(valid_mae.mean()), 4) if len(valid_mae) > 0 else None

        # ── 新增：夏普比率（交易级，无风险利率 = 0） ──
        pnl_std = valid_pnl.std()
        sharpe  = (valid_pnl.mean() / pnl_std) if (pnl_std is not None and pnl_std != 0) else 0.0
        results[f'sharpe_{prefix}'] = round(float(sharpe), 4)

        # ── 新增：最大回撤（基于复利资金曲线） ──
        equity_curve = (1 + valid_pnl / 100).cumprod()
        peak         = equity_curve.cummax()
        max_dd       = ((equity_curve - peak) / peak).min() * 100
        results[f'max_dd_{prefix}'] = round(float(max_dd), 2)

        # ── signal_details：以 (time, stock) 为键跨周期合并 ──
        for _, row in all_trades.head(2000).iterrows():
            key = (str(row['time']), str(row['stock_code']))
            if key not in signal_details:
                signal_details[key] = {
                    'time':  str(row['time']),
                    'stock': str(row['stock_code']),
                }
            signal_details[key][f'pnl_{prefix}'] = (
                round(float(row['pnl']), 2) if pd.notna(row['pnl']) else None
            )

    results['signal_details'] = list(signal_details.values())[:2000]

    # 清理 NaN（JSON 不支持 float('nan')）
    for k, v in list(results.items()):
        if isinstance(v, float) and math.isnan(v):
            results[k] = None

    return results

def _connect_duckdb_readonly(db_path: str, retries: int = 8, delay: float = 1.5) -> duckdb.DuckDBPyConnection:
    """
    Windows 下 Node.js 持有读写锁时，用只读模式重试连接。
    DuckDB 0.10+ 在 Windows 上支持多读者并发，但需要等 WAL checkpoint 完成。
    """
    last_err = None
    for attempt in range(retries):
        try:
            con = duckdb.connect(db_path, read_only=True)
            sys.stderr.write(f"[DEBUG] DuckDB connected (attempt {attempt + 1})\n")
            return con
        except Exception as e:
            last_err = e
            sys.stderr.write(f"[DEBUG] DuckDB open failed (attempt {attempt + 1}/{retries}): {e}\n")
            import time
            time.sleep(delay)
    raise RuntimeError(f"无法以只读模式打开 DuckDB（已重试 {retries} 次）: {last_err}")

def main():
    parser = argparse.ArgumentParser(description="AlphaScan AI 回测引擎 — DuckDB 直连模式")
    parser.add_argument('--db_path',    required=True,
                        help="DuckDB 文件路径，例如 ../local_data/alphascan.duckdb")
    parser.add_argument('--stock_code', required=True,
                        help="标的代码：单个代码 / 逗号分隔多个 / ALL 全市场")
    parser.add_argument('--period',     required=False, default='1d')
    parser.add_argument('--conditions', required=False, default="{}")
    parser.add_argument('--preset',     required=False, default=None)
    parser.add_argument('--start_time', required=False, default="",
                        help="回测起始时间，例如 2020-01-01")
    parser.add_argument('--end_time',   required=False, default="",
                        help="回测结束时间，例如 2024-12-31")
    args = parser.parse_args()

    # 分钟级持仓换算表
    period_min             = PERIOD_MINUTES.get(args.period, 480)
    minute_periods_in_bars = [(mt, max(1, round(mt / period_min))) for mt in [5, 15, 30, 60, 120, 240]]

    try:
        sys.stderr.write(f"[DEBUG] db_path={args.db_path} stock_code={args.stock_code} "
                         f"period={args.period} preset={args.preset}\n")

        base_conditions = json.loads(args.conditions) if not args.preset else {}

        # ── 解析跨周期指标需求 ──
        period_indicators, needed_periods = _build_period_indicators(base_conditions)

        # ── 连接 DuckDB ──
        con = _connect_duckdb_readonly(args.db_path)

        # ── 解析目标标的列表 ──
        if args.stock_code.strip().upper() == 'ALL':
            target_stocks = (
                con.execute("SELECT DISTINCT stock_code FROM kline_metrics ORDER BY stock_code")
                .df()['stock_code'].tolist()
            )
        else:
            target_stocks = [s.strip() for s in args.stock_code.split(',') if s.strip()]

        if not target_stocks:
            print(json.dumps({'total_signals': 0}))
            sys.exit(0)

        sys.stderr.write(f"[DEBUG] Target stocks ({len(target_stocks)}): "
                         f"{target_stocks[:5]}{'...' if len(target_stocks) > 5 else ''}\n")

        # ── 扫参配置解析 ──
        MAX_SWEEP_COMBOS = 10000
        sweep_configs = []
        if isinstance(base_conditions, dict) and 'sweep' in base_conditions:
            sweep_cfg = base_conditions['sweep']
            keys, values = list(sweep_cfg.keys()), list(sweep_cfg.values())
            total_combos = 1
            for v in values:
                total_combos *= len(v)
            if total_combos > MAX_SWEEP_COMBOS:
                print(json.dumps({'error': f'参数组合数超过上限 {MAX_SWEEP_COMBOS}'}))
                sys.exit(1)
            for combo in product(*values):
                sweep_configs.append(dict(zip(keys, combo)))
        else:
            sweep_configs = [None]

        # ── 扫参外层循环 ──
        all_sweep_results = []

        for current_params in sweep_configs:
            iter_conditions = (
                inject_params(base_conditions, current_params)
                if current_params else base_conditions
            )

            # 每次扫参重新提取跨周期需求（参数可能影响指标名）
            iter_period_indicators, iter_needed_periods = _build_period_indicators(iter_conditions)

            # 全市场交易池
            global_trades_pool = {
                **{f'c{p}':  [] for p in [3, 6, 9, 12, 15, 18, 24, 30]},
                **{f'm{mt}': [] for mt in [5, 15, 30, 60, 120, 240]},
            }
            global_total_signals = 0
            stocks_with_data = 0

            for stock in target_stocks:
                _indicator_cache.clear()

                working_df = _fetch_and_align(
                    con, stock, args.period,
                    iter_needed_periods, args.start_time, args.end_time,
                    iter_period_indicators
                )
                if working_df is None:
                    continue

                stocks_with_data += 1
                res = extract_trades(
                    working_df, iter_conditions, args.preset, stock, args.period
                )
                if res is not None:
                    trades_pool, signals_count = res
                    global_total_signals += signals_count
                    for k, v_df in trades_pool.items():
                        global_trades_pool[k].append(v_df)

                del working_df
                gc.collect()

            sys.stderr.write(
                f"[DEBUG] Sweep params={current_params}, "
                f"stocks_with_data={stocks_with_data}, total_signals={global_total_signals}\n"
            )

            if global_total_signals == 0:
                sweep_result = {
                    'total_signals': 0,
                    'stocks_with_data': stocks_with_data
                }
            else:
                sweep_result = calculate_pooled_metrics(
                    global_trades_pool, global_total_signals, minute_periods_in_bars
                )
                sweep_result['stocks_with_data'] = stocks_with_data

            if current_params:
                sweep_result['params'] = current_params
                all_sweep_results.append(sweep_result)
            else:
                print(json.dumps(sweep_result))
                sys.stdout.flush()
                con.close()
                return

        con.close()

        if all_sweep_results:
            print(json.dumps({'sweep_results': all_sweep_results}))
        sys.stdout.flush()

    except Exception as e:
        sys.stderr.write(f"[FATAL] Execution error: {e}\n")
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({'error': str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()