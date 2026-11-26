"""WML 지표 — 오닐·미너비니·리버모어 공통 원칙을 숫자 규칙으로 옮긴 순수 함수 모음.

입력은 날짜 오름차순 일봉 DataFrame(columns: date, open, high, low, close, volume).
모든 값은 계산값이다. 결과를 쓰는 쪽은 [계산]으로 표기한다.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

P = {
    "ma_short": 50, "ma_mid": 150, "ma_long": 200,
    "ma_long_rising_lookback": 21,       # 200일선 1개월(약 21거래일) 상승
    "week52": 250,
    "min_above_low52": 0.30,             # 52주 저가 대비 +30% 이상
    "max_below_high52": 0.25,            # 52주 고가 대비 -25% 이내
    "rs_min": 70,                        # RS 상위 30%
    "base_lookback": 130,                # 베이스 탐색 최대 약 6개월
    "base_min_len": 15,                  # 최소 3주
    "zigzag": 0.03,                      # 스윙 판정 임계 3%
    "vcp_first_max": 0.35, "vcp_last_max": 0.10, "vcp_tolerance": 1.15,
    "flat_max_depth": 0.15, "flat_min_len": 25,
    "base_max_depth": 0.35,
    "breakout_vol_ratio": 1.4,           # 돌파일 거래량 50일 평균 대비 +40%
    "dryup_ratio": 0.8,
    "buy_zone": 0.05,                    # 피벗 ~ +5%
    "pivot_near": -0.03,                 # 피벗 -3% 이내 접근
    "max_stop": 0.08,                    # 최대 손절 -8%
    "limit_up": 0.295,
    "dist_value_mult": 3.0,              # 거래대금 20일 평균 3배 + 음봉 = 분배 의심
    "surge3_pct": 0.50,                  # 3일 누적 +50% = 단기 과열
    "min_value_avg20": 3e9,              # 20일 평균 거래대금 30억 원
    "min_mktcap": 1e11,                  # 시가총액 1,000억 원
    "dd_drop": -0.002, "dd_window": 25, "dd_expire_gain": 0.05,
    "ftd_gain": 0.0125, "ftd_min_day": 4, "correction_min": 0.08,
}


def _f(x):
    """NaN·inf를 JSON에 쓸 수 있게 None으로."""
    if x is None:
        return None
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return None if (math.isnan(x) or math.isinf(x)) else round(x, 4)


# ------------------------------------------------------------------ 추세 템플릿
def trend_template(df: pd.DataFrame) -> dict:
    c, h, lo = df["close"], df["high"], df["low"]
    n = len(df)
    ma50 = c.rolling(P["ma_short"]).mean()
    ma150 = c.rolling(P["ma_mid"]).mean()
    ma200 = c.rolling(P["ma_long"]).mean()
    last = c.iloc[-1]
    m50, m150, m200 = ma50.iloc[-1], ma150.iloc[-1], ma200.iloc[-1]
    lb = P["ma_long_rising_lookback"]
    m200_prev = ma200.iloc[-1 - lb] if n > P["ma_long"] + lb else np.nan
    w = min(P["week52"], n)
    high52, low52 = h.iloc[-w:].max(), lo.iloc[-w:].min()

    def chk(cond, *vals):
        return None if any(pd.isna(v) for v in vals) else bool(cond)

    crit = {
        "c1_price_above_ma150_ma200": chk(last > m150 and last > m200, m150, m200),
        "c2_ma150_above_ma200": chk(m150 > m200, m150, m200),
        "c3_ma200_rising_1m": chk(m200 > m200_prev, m200, m200_prev),
        "c4_ma50_above_ma150_ma200": chk(m50 > m150 and m50 > m200, m50, m150, m200),
        "c5_price_above_ma50": chk(last > m50, m50),
        "c6_above_low52_30pct": chk(last >= low52 * (1 + P["min_above_low52"]), low52) if n >= P["week52"] else None,
        "c7_within_25pct_of_high52": chk(last >= high52 * (1 - P["max_below_high52"]), high52) if n >= P["week52"] else None,
    }
    return {
        "criteria": crit,
        "ma50": _f(m50), "ma150": _f(m150), "ma200": _f(m200),
        "high52": _f(high52), "low52": _f(low52),
        "pct_from_high52": _f(last / high52 - 1), "pct_above_low52": _f(last / low52 - 1),
        "full_52w": n >= P["week52"],
    }


def rs_raw(close: pd.Series) -> float | None:
    """IBD식 가중 수익률: 최근 3개월 40%, 나머지 3개 분기 각 20%. 252봉 미만이면 None."""
    if len(close) < 253:
        return None
    c = close.values
    r = lambda k: c[-1] / c[-1 - k] - 1
    return 0.4 * r(63) + 0.2 * r(126) + 0.2 * r(189) + 0.2 * r(252)


def rs_rank(raw: dict[str, float | None]) -> dict[str, int | None]:
    """유니버스 내 백분위(1~99). RS 계산 불가 종목은 None."""
    valid = {k: v for k, v in raw.items() if v is not None and not math.isnan(v)}
    if not valid:
        return {k: None for k in raw}
    s = pd.Series(valid).rank(pct=True)
    out = {k: None for k in raw}
    for k, v in s.items():
        out[k] = int(min(99, max(1, round(v * 99))))
    return out


# ------------------------------------------------------------------ 베이스·VCP
def _contractions(h: np.ndarray, lo: np.ndarray, start: int, th: float) -> list[dict]:
    """start(베이스 고점)부터 지그재그로 고점→저점 수축 구간을 뽑는다. 마지막 구간은 진행 중일 수 있다."""
    out = []
    n = len(h)
    state = "down"
    hi_v, hi_i = h[start], start
    lo_v, lo_i = math.inf, None
    # 반전 판정은 '이전 봉까지의' 극값과 비교한다. 같은 봉의 고가·저가 폭(장대봉)을 스윙으로 세지 않기 위해서.
    for i in range(start + 1, n):
        if state == "down":
            if lo_i is not None and h[i] >= lo_v * (1 + th):
                out.append({"high": hi_v, "high_i": hi_i, "low": lo_v, "low_i": lo_i, "done": True})
                state, hi_v, hi_i = "up", h[i], i
            elif lo[i] < lo_v:
                lo_v, lo_i = lo[i], i
        else:
            if lo[i] <= hi_v * (1 - th):
                state, lo_v, lo_i = "down", lo[i], i
            elif h[i] > hi_v:
                hi_v, hi_i = h[i], i
    if state == "down" and lo_i is not None:
        out.append({"high": hi_v, "high_i": hi_i, "low": lo_v, "low_i": lo_i, "done": False})
    elif state == "up":
        out.append({"high": hi_v, "high_i": hi_i, "low": None, "low_i": None, "done": False, "rising": True})
    for c in out:
        c["depth"] = (1 - c["low"] / c["high"]) if c.get("low") else None
    return out


def analyze_base(df: pd.DataFrame) -> dict:
    n = len(df)
    h, lo, c, v = (df[k].values.astype(float) for k in ("high", "low", "close", "volume"))
    lb = min(P["base_lookback"], n)
    seg_start = n - lb
    peak = seg_start + int(np.argmax(h[seg_start:]))
    base_len = n - 1 - peak
    base_high = h[peak]
    res = {"type": None, "length": base_len, "depth": None, "contractions": [], "pivot": None,
           "dist_to_pivot": None, "last_low": None, "dryup_ratio": None, "vcp": False, "cup_handle": False}
    avg50 = v[-51:-1].mean() if n > 51 else np.nan

    if base_len < 5:
        res["type"] = "신고가 진행(베이스 없음)"
        res["pivot"] = _f(base_high)
        res["dist_to_pivot"] = _f(c[-1] / base_high - 1)
        return res

    low_since = lo[peak:].min()
    depth = 1 - low_since / base_high
    res["depth"] = _f(depth)
    cons = _contractions(h, lo, peak, P["zigzag"])
    depths = [x["depth"] for x in cons if x.get("depth") is not None]
    res["contractions"] = [_f(d) for d in depths]

    # 피벗 = 마지막 수축이 시작된 스윙 고점. 상승 중인 마지막 다리는 직전 수축의 고점을 쓴다.
    last_c = cons[-1] if cons else None
    if last_c and last_c.get("rising") and len(cons) >= 2:
        pivot_c = cons[-2]
    else:
        pivot_c = last_c
    pivot = pivot_c["high"] if pivot_c else base_high
    last_low = None
    for x in reversed(cons):
        if x.get("low") is not None:
            last_low = x["low"]
            break
    res["pivot"] = _f(pivot)
    res["last_low"] = _f(last_low)
    res["dist_to_pivot"] = _f(c[-1] / pivot - 1)

    # 수축 구간 거래량 고갈: 마지막 수축 시작 이후 평균 거래량 / 50일 평균
    start_i = pivot_c["high_i"] if pivot_c else peak
    if not math.isnan(avg50) and avg50 > 0 and n - start_i >= 3:
        res["dryup_ratio"] = _f(v[start_i:n - 1].mean() / avg50) if n - 1 > start_i else None

    if depth > P["base_max_depth"]:
        res["type"] = "깊은 조정(베이스 부적격)"
        return res
    if base_len < P["base_min_len"]:
        res["type"] = "짧은 눌림(베이스 형성 중)"
        return res

    ok_seq = len(depths) >= 2 and all(depths[i] <= depths[i - 1] * P["vcp_tolerance"] for i in range(1, len(depths)))
    res["vcp"] = bool(ok_seq and depths[-1] == min(depths) and depths[-1] <= P["vcp_last_max"]
                      and depths[0] <= P["vcp_first_max"] and len(depths) <= 6)

    # 컵핸들 후보: 깊이 12~35%, 7주 이상, 핸들(마지막 수축)이 베이스 상단 절반에서 12% 이내
    mid = base_high - (base_high - low_since) / 2
    if (0.12 <= depth <= 0.35 and base_len >= 35 and last_c and last_low is not None
            and depths and depths[-1] <= 0.12 and last_low > mid and c[-1] >= base_high * 0.85):
        res["cup_handle"] = True

    if res["vcp"]:
        res["type"] = f"VCP({len(depths)}회 수축)"
    elif res["cup_handle"]:
        res["type"] = "컵핸들 후보"
    elif depth <= P["flat_max_depth"] and base_len >= P["flat_min_len"]:
        res["type"] = "플랫베이스"
    else:
        res["type"] = "기타 베이스"
    return res


# ------------------------------------------------------------------ 당일 판정·플래그
def day_signals(df: pd.DataFrame, pivot: float | None) -> dict:
    n = len(df)
    o, h, lo, c, v = (df[k].values.astype(float) for k in ("open", "high", "low", "close", "volume"))
    avg50 = v[-51:-1].mean() if n > 51 else np.nan
    value = c * v  # 거래대금 근사(종가 × 거래량) — [계산]
    avg20_val = value[-21:-1].mean() if n > 21 else np.nan
    chg = c[-1] / c[-2] - 1 if n >= 2 else np.nan
    rng = h[-1] - lo[-1]
    close_pos = (c[-1] - lo[-1]) / rng if rng > 0 else 0.5
    vol_ratio = v[-1] / avg50 if avg50 and avg50 > 0 else np.nan
    flags = []
    if not math.isnan(chg) and chg >= P["limit_up"]:
        flags.append("상한가(갭 분류·추격 금지)")
    if (not math.isnan(avg20_val) and avg20_val > 0 and value[-1] >= avg20_val * P["dist_value_mult"]
            and c[-1] < o[-1]):
        flags.append("거래대금 폭등+음봉(분배 의심)")
    if n >= 4 and c[-1] / c[-4] - 1 >= P["surge3_pct"]:
        flags.append("3일 누적 +50% 이상(단기 과열)")
    status = None
    if pivot:
        if c[-1] > pivot:
            if vol_ratio >= P["breakout_vol_ratio"] and close_pos >= 0.5:
                status = "돌파 성공"
            else:
                status = "약한 돌파"
        elif h[-1] > pivot:
            status = "돌파 실패(장중 돌파 후 피벗 아래 종가)"
    return {
        "close": _f(c[-1]), "change": _f(chg), "close_pos": _f(close_pos),
        "vol_ratio50": _f(vol_ratio), "value_avg20": _f(avg20_val), "value_today": _f(value[-1]),
        "breakout_status": status, "flags": flags,
    }


def plan_levels(pivot: float | None, last_low: float | None) -> dict:
    """매수 허용 구간과 손절 제안. 손절 = 마지막 수축 저점 1% 아래, 단 피벗 대비 -8%보다 깊으면 -8%로 제한."""
    if not pivot:
        return {}
    stop_floor = pivot * (1 - P["max_stop"])
    stop = max(last_low * 0.99, stop_floor) if last_low else stop_floor
    stop = min(stop, pivot * 0.995)
    return {"buy_from": _f(pivot), "buy_to": _f(pivot * (1 + P["buy_zone"])),
            "stop": _f(stop), "stop_pct_from_pivot": _f(stop / pivot - 1)}


# ------------------------------------------------------------------ 시장 국면
def market_regime(idx: pd.DataFrame) -> dict:
    c, v = idx["close"].values.astype(float), idx["volume"].values.astype(float)
    dates = idx["date"].tolist()
    n = len(c)
    out = {"date": dates[-1], "close": _f(c[-1]), "change": _f(c[-1] / c[-2] - 1) if n > 1 else None}
    ma50 = pd.Series(c).rolling(50).mean().values
    ma200 = pd.Series(c).rolling(200).mean().values
    out.update({"ma50": _f(ma50[-1]), "ma200": _f(ma200[-1]),
                "above_ma50": None if np.isnan(ma50[-1]) else bool(c[-1] > ma50[-1]),
                "above_ma200": None if np.isnan(ma200[-1]) else bool(c[-1] > ma200[-1]),
                "ma50_rising": None if n < 61 or np.isnan(ma50[-11]) else bool(ma50[-1] > ma50[-11])})

    # 분산일: -0.2% 이상 하락 + 거래량 전일 대비 증가. 25거래일 경과 또는 이후 종가가 +5% 넘게 오르면 소멸.
    dd = []
    for i in range(max(1, n - P["dd_window"]), n):
        if c[i] / c[i - 1] - 1 <= P["dd_drop"] and v[i] > v[i - 1]:
            if c[i:].max() >= c[i] * (1 + P["dd_expire_gain"]):
                continue
            dd.append(dates[i])
    out["distribution_days"] = dd
    out["distribution_count"] = len(dd)

    # 상승 시도·팔로스루데이: 최근 60거래일 최저 종가 이후
    w = min(60, n - 1)
    seg = c[-w - 1:]
    low_rel = int(np.argmin(seg))
    low_i = n - w - 1 + low_rel
    prior_high = c[max(0, low_i - 120):low_i + 1].max()
    drawdown = 1 - c[low_i] / prior_high if prior_high > 0 else 0
    out["recent_low_date"] = dates[low_i]
    out["correction_from_high"] = _f(drawdown)
    day1 = next((i for i in range(low_i + 1, n) if c[i] > c[i - 1]), None)
    out["rally_day"] = (n - day1) if day1 is not None else 0
    ftd = None
    if day1 is not None:
        for j in range(day1 + P["ftd_min_day"] - 1, n):
            if c[j] / c[j - 1] - 1 >= P["ftd_gain"] and v[j] > v[j - 1]:
                ftd = dates[j]
                break
    out["follow_through_day"] = ftd
    meaningful = drawdown >= P["correction_min"]
    out["meaningful_correction"] = bool(meaningful)

    # 제안 판정 — 최종 판정은 봇이 근거와 함께 내린다.
    cnt = len(dd)
    if out["above_ma200"] is False or cnt >= 6 or (meaningful and ftd is None):
        regime = "조정·하락"
    elif cnt >= 4 or out["above_ma50"] is False:
        regime = "압박받는 상승추세"
    else:
        regime = "확인된 상승추세"
    out["suggested_regime"] = regime
    return out
