"""WML 스크리너 — 코스피·코스닥 보통주 전 종목에 WML 프레임을 적용해 결과 파일을 만든다.

실행: python scripts/wml/screener.py --out out --cache cache
환경변수: KIS_APP_KEY, KIS_APP_SECRET (필수), KIS_PAPER(true=모의투자 서버), KIS_RPS(초당 호출 수)
결과: out/latest.json, out/latest.md, out/metrics.csv, out/archive/YYYYMMDD.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
import indicators as ind  # noqa: E402
from kis_client import KISClient, KISError  # noqa: E402
from universe import load_universe  # noqa: E402

KST = timezone(timedelta(hours=9))
HISTORY_DAYS = 400          # 달력 기준 약 270거래일
OVERLAP_DAYS = 14           # 증분 조회 시 겹치는 구간(수정주가 변경 감지용)
ADJ_TOLERANCE = 0.005
MAX_CANDIDATES, MAX_WATCH, MAX_FLAG_CALLS = 10, 20, 150
COLS = ["date", "open", "high", "low", "close", "volume"]


def log(msg: str):
    print(f"[{datetime.now(KST):%H:%M:%S}] {msg}", flush=True)


# ------------------------------------------------------------------ 캐시
def load_cache(path: str) -> dict[str, pd.DataFrame]:
    if not os.path.exists(path):
        return {}
    df = pd.read_csv(path, dtype={"code": str, "date": str})
    return {c: g[COLS].reset_index(drop=True) for c, g in df.groupby("code")}


def save_cache(path: str, data: dict[str, pd.DataFrame]):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    frames = [g.assign(code=c) for c, g in data.items() if len(g)]
    if frames:
        pd.concat(frames, ignore_index=True)[["code"] + COLS].to_csv(path, index=False, compression="gzip")


def fetch_history(cli: KISClient, code: str, today: str, cached: pd.DataFrame | None,
                  as_of: str) -> tuple[pd.DataFrame, dict, str]:
    """캐시가 있으면 겹치는 구간만 받아 붙이고, 수정주가가 바뀌었으면 전체를 다시 받는다."""
    full_start = (datetime.strptime(today, "%Y%m%d") - timedelta(days=HISTORY_DAYS)).strftime("%Y%m%d")
    if cached is not None and len(cached) and cached["date"].iloc[-1] >= as_of:
        return cached, {}, "cache"
    stale_limit = (datetime.strptime(today, "%Y%m%d") - timedelta(days=60)).strftime("%Y%m%d")
    if cached is not None and len(cached) >= 200 and cached["date"].iloc[-1] >= stale_limit:
        start =(datetime.strptime(cached["date"].iloc[-1], "%Y%m%d") - timedelta(days=OVERLAP_DAYS)).strftime("%Y%m%d")
        bars, summary = cli.daily_bars(code, start, today, adjusted=True, max_pages=1)
        new = pd.DataFrame(bars)
        if len(new):
            m = cached.merge(new[["date", "close"]], on="date", suffixes=("", "_new"))
            if len(m) and ((m["close_new"] / m["close"] - 1).abs() > ADJ_TOLERANCE).any():
                bars, summary = cli.daily_bars(code, full_start, today, adjusted=True)
                return pd.DataFrame(bars)[COLS] if bars else cached, summary, "refetch(수정주가 변경)"
            merged = pd.concat([cached[cached["date"] < new["date"].min()], new[COLS]], ignore_index=True)
            merged = merged[merged["date"] >= full_start].reset_index(drop=True)
            return merged, summary, "incremental"
        return cached, summary, "no-new-bars"
    bars, summary = cli.daily_bars(code, full_start, today, adjusted=True)
    return (pd.DataFrame(bars)[COLS] if bars else pd.DataFrame(columns=COLS)), summary, "full"


# ------------------------------------------------------------------ 종목 평가
def evaluate(code: str, meta: dict, df: pd.DataFrame, summary: dict) -> dict | None:
    if len(df) < 60:
        return None
    t = ind.trend_template(df)
    b = ind.analyze_base(df)
    s = ind.day_signals(df, b.get("pivot"))
    shares = None
    try:
        shares = float(summary.get("lstn_stcn") or 0) or None
    except (TypeError, ValueError):
        pass
    mktcap = shares * df["close"].iloc[-1] if shares else None
    h, lo = df["high"].values, df["low"].values
    prior = slice(-251, -1) if len(df) > 251 else slice(0, -1)
    return {
        "code": code, "name": summary.get("hts_kor_isnm") or meta["name"], "market": meta["market"],
        "bars": len(df), "last_date": df["date"].iloc[-1],
        "template": t, "base": b, "day": s,
        "plan": ind.plan_levels(b.get("pivot"), b.get("last_low")),
        "mktcap": ind._f(mktcap),
        "rs_raw": ind.rs_raw(df["close"]),
        "new_high": bool(len(df) > 60 and h[-1] >= h[prior].max()),
        "new_low": bool(len(df) > 60 and lo[-1] <= lo[prior].min()),
    }


def template_score(r: dict) -> tuple[int, int]:
    crit = dict(r["template"]["criteria"])
    rs = r.get("rs")
    crit["c8_rs_top30"] = None if rs is None else rs >= ind.P["rs_min"]
    r["template"]["criteria"] = crit
    passed = sum(v is True for v in crit.values())
    unknown = sum(v is None for v in crit.values())
    return passed, unknown


def liquidity_ok(r: dict) -> list[str]:
    why = []
    if (r["day"].get("value_avg20") or 0) < ind.P["min_value_avg20"]:
        why.append("20일 평균 거래대금 30억 원 미만")
    if r["mktcap"] is None:
        why.append("시가총액 미확인")
    elif r["mktcap"] < ind.P["min_mktcap"]:
        why.append("시가총액 1,000억 원 미만")
    return why


def risk_from_flags(f: dict) -> list[str]:
    """현재가 API 플래그 → 제외 사유. 값 체계가 필드마다 달라 'N'·'00'·빈값 이외는 위험으로 본다."""
    out = []
    yes = lambda v: v not in (None, "", "N", "0", "00")
    if yes(f.get("mang_issu_cls_code")):
        out.append(f"관리종목({f.get('mang_issu_cls_code')})")
    w = str(f.get("mrkt_warn_cls_code") or "00").zfill(2)
    if w != "00":
        out.append({"01": "투자주의", "02": "투자경고", "03": "투자위험"}.get(w, f"시장경고 {w}"))
    if yes(f.get("sltr_yn")):
        out.append("정리매매")
    if yes(f.get("temp_stop_yn")):
        out.append("거래정지")
    if yes(f.get("invt_caful_yn")):
        out.append("투자유의")
    if yes(f.get("short_over_yn")):
        out.append("단기과열")
    return out


def compact(r: dict) -> dict:
    t, b, d = r["template"], r["base"], r["day"]
    return {
        "code": r["code"], "name": r["name"], "market": r["market"], "sector": r.get("sector"),
        "close": d["close"], "change": d["change"], "rs": r.get("rs"),
        "template_passed": r["tpl_passed"], "template_unknown": r["tpl_unknown"],
        "template_criteria": t["criteria"],
        "ma50": t["ma50"], "ma150": t["ma150"], "ma200": t["ma200"],
        "high52": t["high52"], "low52": t["low52"], "pct_from_high52": t["pct_from_high52"],
        "base_type": b["type"], "base_length": b["length"], "base_depth": b["depth"],
        "contractions": b["contractions"], "pivot": b["pivot"], "dist_to_pivot": b["dist_to_pivot"],
        "dryup_ratio": b["dryup_ratio"], "vol_ratio50": d["vol_ratio50"], "close_pos": d["close_pos"],
        "breakout_status": d["breakout_status"], "plan": r["plan"],
        "value_avg20_eok": ind._f((d["value_avg20"] or 0) / 1e8),
        "mktcap_eok": ind._f((r["mktcap"] or 0) / 1e8) if r["mktcap"] else None,
        "flags": d["flags"] + r.get("risk", []), "reasons": r.get("reasons", []),
    }


# ------------------------------------------------------------------ 메인
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="out")
    ap.add_argument("--cache", default="cache")
    ap.add_argument("--limit", type=int, default=0, help="테스트용: 앞에서부터 N종목만")
    ap.add_argument("--require-today", action="store_true",
                    help="지수 기준일이 오늘이 아니면(휴장일) 종목 조회 없이 종료 코드 3으로 끝낸다")
    args = ap.parse_args()
    os.makedirs(os.path.join(args.out, "archive"), exist_ok=True)
    started = time.time()
    now = datetime.now(KST)
    today = now.strftime("%Y%m%d")
    status = {"generated_at": now.isoformat(timespec="seconds"), "status": "ok", "errors": []}

    try:
        cli = KISClient.from_env()
        log(f"KIS 연결 ({'모의' if 'vts' in cli.base else '실전'} 서버)")
        idx_start = (now - timedelta(days=HISTORY_DAYS)).strftime("%Y%m%d")
        idx = {name: pd.DataFrame(cli.index_bars(code, idx_start, today))
               for name, code in (("KOSPI", "0001"), ("KOSDAQ", "1001"))}
        if any(len(v) < 60 for v in idx.values()):
            raise KISError("지수 일봉이 부족합니다 (KOSDAQ 지수코드 1001 확인 필요).")
        as_of = idx["KOSPI"]["date"].iloc[-1]
        universe = load_universe()
    except Exception as e:  # 연결·유니버스 단계 실패 → 상태 파일만 남기고 실패 종료
        status.update(status="error", errors=[f"{type(e).__name__}: {e}"])
        with open(os.path.join(args.out, "latest.json"), "w", encoding="utf-8") as fp:
            json.dump(status, fp, ensure_ascii=False, indent=1)
        log(f"실패: {e}")
        sys.exit(1)

    status["as_of"] = as_of
    status["is_today"] = as_of == today
    if args.require_today and not status["is_today"]:
        log(f"기준일 {as_of} ≠ 오늘 {today} — 휴장일로 보고 건너뜀")
        sys.exit(3)
    if args.limit:
        universe = universe[: args.limit]
    log(f"기준일 {as_of} · 유니버스 {len(universe)}종목")

    cache_path = os.path.join(args.cache, "ohlcv.csv.gz")
    meta_path = os.path.join(args.cache, "summary.json")
    cache = load_cache(cache_path)
    summaries: dict[str, dict] = json.load(open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else {}
    results, failed, modes = [], [], {}
    for i, meta in enumerate(universe, 1):
        code = meta["code"]
        try:
            df, summary, mode = fetch_history(cli, code, today, cache.get(code), as_of)
            modes[mode] = modes.get(mode, 0) + 1
            if len(df):
                cache[code] = df
            if summary:  # 상장주수·종목명은 캐시해 두고 같은 날 재실행 때 재사용
                summaries[code] = {"lstn_stcn": summary.get("lstn_stcn"), "hts_kor_isnm": summary.get("hts_kor_isnm")}
            r = evaluate(code, meta, df, summary or summaries.get(code, {}))
            if r:
                results.append(r)
        except Exception as e:  # 한 종목 오류가 전체 실행을 멈추지 않게
            failed.append({"code": code, "name": meta["name"], "error": f"{type(e).__name__}: {str(e)[:180]}"})
        if i % 200 == 0:
            log(f"{i}/{len(universe)} · 호출 {cli.calls} · 실패 {len(failed)}")
            save_cache(cache_path, cache)
    save_cache(cache_path, cache)
    with open(meta_path, "w", encoding="utf-8") as fp:
        json.dump(summaries, fp, ensure_ascii=False)

    # RS 순위 → 템플릿 8번 기준
    ranks = ind.rs_rank({r["code"]: r["rs_raw"] for r in results})
    for r in results:
        r["rs"] = ranks.get(r["code"])
        r["tpl_passed"], r["tpl_unknown"] = template_score(r)

    # 분류
    cand, watch, breakouts = [], [], []
    for r in results:
        if r["last_date"] != as_of:
            continue  # 당일 봉 없음(거래정지 등)
        reasons = liquidity_ok(r)
        if reasons:
            continue
        tp, b, d = r["tpl_passed"], r["base"], r["day"]
        dist = b.get("dist_to_pivot")
        base_ok = b["type"] not in (None, "깊은 조정(베이스 부적격)", "신고가 진행(베이스 없음)",
                                    "짧은 눌림(베이스 형성 중)")
        in_zone = dist is not None and ind.P["pivot_near"] <= dist <= ind.P["buy_zone"]
        if tp >= 7 and d["breakout_status"] in ("돌파 성공", "약한 돌파", "돌파 실패(장중 돌파 후 피벗 아래 종가)"):
            breakouts.append(r)
        if tp >= 7 and r["tpl_unknown"] == 0 and base_ok and in_zone and not d["flags"]:
            cand.append(r)
        elif tp >= 6:
            why = []
            if r["tpl_unknown"]:
                why.append(f"템플릿 미확인 {r['tpl_unknown']}개")
            if tp < 7:
                why.append(f"템플릿 {tp}/8")
            if not base_ok:
                why.append(b["type"] or "베이스 판독 불가")
            if dist is not None and not in_zone:
                why.append(f"피벗 대비 {dist * 100:+.1f}%")
            why += d["flags"]
            r["reasons"] = why
            watch.append(r)

    key = lambda r: (r.get("rs") or 0, -(r["base"]["contractions"][-1] if r["base"]["contractions"] else 1))
    cand.sort(key=key, reverse=True)
    watch.sort(key=key, reverse=True)
    cand, watch = cand[:MAX_CANDIDATES * 2], watch[:MAX_WATCH]

    # 최종 후보·신고가 종목은 현재가 API로 업종·위험 플래그 재확인
    new_highs = sorted([r for r in results if r["new_high"] and r["last_date"] == as_of],
                       key=lambda r: r.get("rs") or 0, reverse=True)
    to_check = {r["code"]: r for r in cand + watch + breakouts + new_highs}
    for n_call, (code, r) in enumerate(to_check.items()):
        if n_call >= MAX_FLAG_CALLS:
            break
        try:
            f = cli.price_flags(code)
            r["sector"] = f.get("bstp_kor_isnm")
            r["risk"] = risk_from_flags(f)
        except KISError as e:
            r["risk"] = [f"플래그 조회 실패: {str(e)[:80]}"]
    moved = [r for r in cand if r.get("risk")]
    for r in moved:
        r["reasons"] = ["위험 플래그로 실행 후보에서 제외"]
    cand = [r for r in cand if not r.get("risk")][:MAX_CANDIDATES]
    watch = (moved + watch)[:MAX_WATCH]

    # 신고가 업종 분포
    sectors: dict[str, list[str]] = {}
    for r in new_highs[:MAX_FLAG_CALLS]:
        sectors.setdefault(r.get("sector") or "업종 미확인", []).append(r["name"])
    sector_map = sorted(({"sector": k, "count": len(v), "names": v[:12]} for k, v in sectors.items()),
                        key=lambda x: x["count"], reverse=True)

    breadth = {}
    for mk in ("KOSPI", "KOSDAQ"):
        rows = [r for r in results if r["market"] == mk and r["last_date"] == as_of]
        breadth[mk] = {"new_highs": sum(r["new_high"] for r in rows), "new_lows": sum(r["new_low"] for r in rows),
                       "universe": len(rows)}

    fail_rate = len(failed) / max(1, len(universe))
    if fail_rate > 0.10:
        status["status"] = "incomplete"
        status["errors"].append(f"조회 실패 {len(failed)}종목 ({fail_rate:.0%})")
    if not status["is_today"]:
        status["errors"].append(f"기준일 {as_of} ≠ 실행일 {today} (휴장일이거나 당일 데이터 미반영)")

    out = {
        **status,
        "data_source": "한국투자증권 Open API — 종목 일봉 FHKST03010100(수정주가), 지수 FHKUP03500100, 현재가 FHKST01010100",
        "note": "모든 지표는 [계산]값. 거래대금은 종가×거래량 근사. 판정 기준은 params 참조.",
        "universe_count": len(universe), "evaluated": len(results), "failed": failed[:50],
        "failed_count": len(failed), "api_calls": cli.calls, "fetch_modes": modes,
        "elapsed_sec": int(time.time() - started),
        "market": {k: ind.market_regime(v) for k, v in idx.items()},
        "breadth": breadth, "new_high_sectors": sector_map,
        "candidates": [compact(r) for r in cand],
        "watch": [compact(r) for r in watch],
        "breakouts_today": [compact(r) for r in sorted(breakouts, key=key, reverse=True)[:30]],
        "params": ind.P,
    }
    with open(os.path.join(args.out, "latest.json"), "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, indent=1)
    with open(os.path.join(args.out, "archive", f"{as_of}.json"), "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False)
    write_metrics_csv(results, os.path.join(args.out, "metrics.csv"))
    write_markdown(out, os.path.join(args.out, "latest.md"))
    log(f"완료: 후보 {len(out['candidates'])} · 관찰 {len(out['watch'])} · 호출 {cli.calls} · {out['elapsed_sec']}초")
    if status["status"] != "ok":
        sys.exit(2)


def write_metrics_csv(results: list[dict], path: str):
    rows = []
    for r in results:
        t, b, d = r["template"], r["base"], r["day"]
        rows.append({
            "code": r["code"], "name": r["name"], "market": r["market"], "last_date": r["last_date"],
            "close": d["close"], "change": d["change"], "rs": r.get("rs"),
            "tpl_passed": r.get("tpl_passed"), "tpl_unknown": r.get("tpl_unknown"),
            "ma50": t["ma50"], "ma150": t["ma150"], "ma200": t["ma200"],
            "high52": t["high52"], "low52": t["low52"], "base_type": b["type"], "pivot": b["pivot"],
            "dist_to_pivot": b["dist_to_pivot"], "last_low": b["last_low"],
            "vol_ratio50": d["vol_ratio50"], "breakout_status": d["breakout_status"],
            "flags": "|".join(d["flags"]),
        })
    pd.DataFrame(rows).to_csv(path, index=False, encoding="utf-8-sig")


def pct(x, nd=1):
    return "—" if x is None else f"{x * 100:+.{nd}f}%"


def num(x):
    return "—" if x is None else f"{x:,.0f}"


def write_markdown(o: dict, path: str):
    L = [f"# WML 스크리너 결과 — 기준일 {o.get('as_of')}",
         f"상태: **{o['status']}** · 유니버스 {o['universe_count']} · 평가 {o['evaluated']} · 실패 {o['failed_count']} · API {o['api_calls']}회 · {o['elapsed_sec']}초",
         f"출처: {o['data_source']}. 모든 값은 [계산].", ""]
    if o["errors"]:
        L += ["> ⚠ " + e for e in o["errors"]] + [""]
    L += ["## 시장 국면 (제안 판정 — 최종 판정은 봇)",
          "| 지수 | 종가 | 등락 | 50일선 위 | 200일선 위 | 분산일(25일) | 최근 저점 | 상승 시도 | 팔로스루데이 | 제안 판정 |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    for k, m in o["market"].items():
        L.append(f"| {k} | {m['close']:,.2f} | {pct(m['change'], 2)} | {m['above_ma50']} | {m['above_ma200']} | "
                 f"{m['distribution_count']} | {m['recent_low_date']} ({pct(m['correction_from_high'])}) | "
                 f"{m['rally_day']}일차 | {m['follow_through_day'] or '없음'} | {m['suggested_regime']} |")
    L += ["", "## 신고가·신저가", "| 시장 | 신고가 | 신저가 |", "|---|---|---|"]
    L += [f"| {k} | {v['new_highs']} | {v['new_lows']} |" for k, v in o["breadth"].items()]
    L += ["", "## 신고가 업종 분포", "| 업종 | 종목 수 | 종목 |", "|---|---|---|"]
    L += [f"| {s['sector']} | {s['count']} | {', '.join(s['names'])} |" for s in o["new_high_sectors"][:12]]

    def table(title, rows, extra=False):
        L.extend(["", f"## {title}",
                  "| 종목 | 시장 | 업종 | 종가 | RS | 템플릿 | 베이스 | 수축 | 피벗 | 피벗 대비 | 매수구간 | 손절(%) | 거래량/50일 | 비고 |",
                  "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"])
        for r in rows:
            p = r["plan"] or {}
            cons = " → ".join(pct(-c, 0) for c in (r["contractions"] or [])[-4:])
            note = ", ".join(r["flags"] + (r["reasons"] if extra else []) + ([r["breakout_status"]] if r["breakout_status"] else []))
            vr = "—" if r["vol_ratio50"] is None else f"{r['vol_ratio50']:.2f}x"
            L.append(f"| {r['name']}({r['code']}) | {r['market']} | {r.get('sector') or '—'} | {num(r['close'])} | {r['rs']} | "
                     f"{r['template_passed']}/8 | {r['base_type']} | {cons or '—'} | {num(r['pivot'])} | {pct(r['dist_to_pivot'])} | "
                     f"{num(p.get('buy_from'))}~{num(p.get('buy_to'))} | {num(p.get('stop'))} ({pct(p.get('stop_pct_from_pivot'))}) | "
                     f"{vr} | {note or '—'} |")
    table("실행 후보 (국면별 최대 개수는 봇이 적용)", o["candidates"])
    table("관찰", o["watch"], extra=True)
    table("오늘 피벗 돌파 시도 (템플릿 7/8 이상)", o["breakouts_today"])
    with open(path, "w", encoding="utf-8") as fp:
        fp.write("\n".join(L) + "\n")


if __name__ == "__main__":
    main()
