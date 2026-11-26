"""합성 데이터 테스트: python -m pytest scripts/wml/test_indicators.py  (또는 python scripts/wml/test_indicators.py)"""
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
import indicators as ind  # noqa: E402


def make(closes, vols=None, spread=0.01):
    closes = np.asarray(closes, dtype=float)
    n = len(closes)
    vols = np.full(n, 1_000_000.0) if vols is None else np.asarray(vols, dtype=float)
    opens = np.r_[closes[0], closes[:-1]]
    return pd.DataFrame({
        "date": pd.bdate_range("2025-01-01", periods=n).strftime("%Y%m%d"),
        "open": opens, "high": np.maximum(opens, closes) * (1 + spread),
        "low": np.minimum(opens, closes) * (1 - spread), "close": closes, "volume": vols,
    })


def vcp_series():
    """220봉 상승(1만→3만) 후 고점 대비 -24% → -12% → -5% 수축하는 VCP. 마지막은 피벗 바로 아래."""
    up = list(np.linspace(10000, 30000, 220))
    peak = up[-1]

    def leg(a, b, k):
        return list(np.linspace(a, b, k))[1:]
    base = []
    base += leg(peak, peak * 0.76, 12) + leg(peak * 0.76, peak * 0.98, 12)
    p2 = peak * 0.98
    base += leg(p2, p2 * 0.88, 8) + leg(p2 * 0.88, p2 * 0.99, 8)
    p3 = p2 * 0.99
    base += leg(p3, p3 * 0.95, 5) + leg(p3 * 0.95, p3 * 0.985, 5)
    closes = up + base
    vols = np.r_[np.full(220, 1_200_000), np.linspace(1_100_000, 500_000, len(base))]
    return make(closes, vols, spread=0.004), p3


def test_trend_template_passes_uptrend():
    df, _ = vcp_series()
    t = ind.trend_template(df)
    crit = t["criteria"]
    assert crit["c1_price_above_ma150_ma200"] and crit["c2_ma150_above_ma200"]
    assert crit["c3_ma200_rising_1m"] and crit["c4_ma50_above_ma150_ma200"]
    assert crit["c6_above_low52_30pct"] and crit["c7_within_25pct_of_high52"]


def test_trend_template_fails_downtrend():
    df = make(np.linspace(30000, 12000, 300))
    crit = ind.trend_template(df)["criteria"]
    assert crit["c1_price_above_ma150_ma200"] is False
    assert crit["c3_ma200_rising_1m"] is False


def test_insufficient_history_is_none_not_pass():
    df = make(np.linspace(10000, 20000, 120))
    crit = ind.trend_template(df)["criteria"]
    assert crit["c1_price_above_ma150_ma200"] is None
    assert crit["c6_above_low52_30pct"] is None


def test_vcp_detected_with_pivot_and_dryup():
    df, p3 = vcp_series()
    b = ind.analyze_base(df)
    assert b["vcp"], b
    assert len(b["contractions"]) >= 3
    assert b["contractions"][0] > b["contractions"][-1]
    assert abs(b["pivot"] / (p3 * 1.004) - 1) < 0.01, b["pivot"]
    assert -0.03 <= b["dist_to_pivot"] <= 0, b["dist_to_pivot"]
    assert b["dryup_ratio"] < 0.8, b["dryup_ratio"]


def test_deep_correction_rejected():
    closes = list(np.linspace(10000, 30000, 220)) + list(np.linspace(30000, 15000, 30)) + list(np.linspace(15000, 18000, 20))
    b = ind.analyze_base(make(closes))
    assert b["type"].startswith("깊은 조정")


def test_breakout_and_plan():
    df, _ = vcp_series()
    b = ind.analyze_base(df)
    pivot = b["pivot"]
    # 다음 날 피벗 +2% 돌파, 거래량 2배, 고가 근처 마감
    last = df.iloc[-1]
    row = {"date": "29991231", "open": last["close"], "close": pivot * 1.02,
           "high": pivot * 1.025, "low": last["close"] * 0.995, "volume": 2_400_000}
    df2 = pd.concat([df, pd.DataFrame([row])], ignore_index=True)
    s = ind.day_signals(df2, pivot)
    assert s["breakout_status"] == "돌파 성공", s
    plan = ind.plan_levels(pivot, b["last_low"])
    assert plan["stop_pct_from_pivot"] >= -0.08 - 1e-9
    assert plan["stop"] < plan["buy_from"] < plan["buy_to"]


def test_limit_up_and_distribution_flags():
    closes = list(np.linspace(10000, 12000, 60)) + [12000 * 1.30]
    s = ind.day_signals(make(closes), None)
    assert any("상한가" in f for f in s["flags"])
    closes = list(np.full(60, 10000.0)) + [9800.0]
    vols = list(np.full(60, 1_000_000.0)) + [5_000_000.0]
    df = make(closes, vols)
    df.loc[df.index[-1], "open"] = 10300.0
    s = ind.day_signals(df, None)
    assert any("분배" in f for f in s["flags"])


def test_rs_rank_order():
    raw = {"A": 0.5, "B": 0.1, "C": -0.2, "D": None}
    r = ind.rs_rank(raw)
    assert r["A"] > r["B"] > r["C"] and r["D"] is None


def test_distribution_days_and_ftd():
    # 상승 250일 → 25일 조정(-12%) → 반등 1~3일차 소폭 → 5일차 +2% 거래량 증가 = FTD
    c = list(np.linspace(2000, 2600, 250))
    v = [1000.0] * 250
    down = list(np.linspace(2600, 2288, 26))[1:]
    for x in down:
        c.append(x)
        v.append(v[-1] * 1.05)  # 하락일마다 거래량 증가 → 분산일
    for g, vol in [(0.003, 900), (0.002, 800), (-0.001, 700), (0.004, 750), (0.02, 1500)]:
        c.append(c[-1] * (1 + g))
        v.append(vol)
    idx = make(c, v)
    m = ind.market_regime(idx)
    assert m["meaningful_correction"]
    assert m["follow_through_day"] == idx["date"].iloc[-1], m
    assert m["distribution_count"] >= 5


if __name__ == "__main__":
    fns = [v for k, v in dict(globals()).items() if k.startswith("test_")]
    for fn in fns:
        fn()
        print("ok", fn.__name__)
    print(f"{len(fns)} tests passed")
