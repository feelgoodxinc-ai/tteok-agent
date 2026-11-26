"""시황정리봇 데이터 수집기 — 한국투자증권 Open API (조회 전용).

대상: 오늘 상한가 전 종목 + 거래대금 1,000억 원 이상 중 상위 100개 종목
수집: 전 종목 현재가 스윕(거래대금 순위) → 대상 종목의 투자자별 순매수·거래원 상위 5
      → 시장(코스피·코스닥)·업종별 투자자 순매수, 업종별 등락·거래대금
결과: out/recap/latest.json, latest.md, archive/YYYYMMDD.json

API 스펙 출처: github.com/koreainvestment/open-trading-api examples_llm/domestic_stock
  inquire-price FHKST01010100 / capture-uplowprice FHKST130000C0 / inquire-investor FHKST01010900
  inquire-member FHKST01010600 / inquire-investor-daily-by-market FHPTJ04040000
  inquire-index-category-price FHPUP02140000
금액 단위는 문서에 없어서 같은 종목의 총 거래대금과 대조해 자동 판별한다(calibrate_*).

실행: python scripts/recap/collect.py --out out/recap [--require-today] [--limit N]
"""
from __future__ import annotations

import argparse
import json
import math
import os
import statistics
import sys
import time
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "wml"))
from kis_client import KISClient, KISError  # noqa: E402
from universe import load_universe  # noqa: E402

KST = timezone(timedelta(hours=9))
MIN_VALUE = 1e11          # 거래대금 1,000억 원
TOP_N = 100
LIMIT_UP_PCT = 29.5
Q = "/uapi/domestic-stock/v1/quotations"
INVESTORS = [  # (표시명, 필드 접두어) — 시장별 투자자매매동향
    ("개인", "prsn"), ("외국인", "frgn"), ("기관계", "orgn"), ("금융투자", "scrt"), ("투자신탁", "ivtr"),
    ("사모펀드", "pe_fund"), ("은행", "bank"), ("보험", "insu"), ("종금", "mrbn"), ("연기금", "fund"),
    ("기타", "etc"), ("기타단체", "etc_orgt"), ("기타법인", "etc_corp"),
]


def log(m):
    print(f"[{datetime.now(KST):%H:%M:%S}] {m}", flush=True)


def num(x):
    if x is None:
        return None
    try:
        v = float(str(x).replace(",", "").strip())
    except ValueError:
        return None
    return None if math.isnan(v) else v


def r(x, nd=2):
    return None if x is None else round(x, nd)


def nearest_unit(ratio: float | None, units=(1.0, 1e3, 1e6)) -> float | None:
    """ratio에 가장 가까운 단위(원·천원·백만원)를 로그 거리로 고른다."""
    if not ratio or ratio <= 0:
        return None
    return min(units, key=lambda u: abs(math.log10(ratio / u)))


# ------------------------------------------------------------------ API 호출
def get_price(cli, code):
    return cli.get(f"{Q}/inquire-price", "FHKST01010100",
                   {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": code}).get("output") or {}


def get_investor_rows(cli, code):
    out = cli.get(f"{Q}/inquire-investor", "FHKST01010900",
                  {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": code}).get("output") or []
    return out if isinstance(out, list) else [out]


def get_member(cli, code):
    out = cli.get(f"{Q}/inquire-member", "FHKST01010600",
                  {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": code}).get("output") or {}
    return out[0] if isinstance(out, list) and out else (out if isinstance(out, dict) else {})


def get_limit_ups(cli):
    out = cli.get(f"{Q}/capture-uplowprice", "FHKST130000C0", {
        "FID_COND_MRKT_DIV_CODE": "J", "FID_COND_SCR_DIV_CODE": "11300", "FID_PRC_CLS_CODE": "0",
        "FID_DIV_CLS_CODE": "0", "FID_INPUT_ISCD": "0000", "FID_TRGT_CLS_CODE": "",
        "FID_TRGT_EXLS_CLS_CODE": "", "FID_INPUT_PRICE_1": "", "FID_INPUT_PRICE_2": "", "FID_VOL_CNT": ""}
    ).get("output") or []
    return out if isinstance(out, list) else [out]


def get_sectors(cli, market):
    iscd, cls = ("0001", "K") if market == "KOSPI" else ("1001", "Q")
    body = cli.get(f"{Q}/inquire-index-category-price", "FHPUP02140000", {
        "FID_COND_MRKT_DIV_CODE": "U", "FID_INPUT_ISCD": iscd, "FID_COND_SCR_DIV_CODE": "20214",
        "FID_MRKT_CLS_CODE": cls, "FID_BLNG_CLS_CODE": "0"})
    head = body.get("output1") or {}
    head = head[0] if isinstance(head, list) and head else head
    rows = body.get("output2") or []
    return head, (rows if isinstance(rows, list) else [rows])


def get_market_investors(cli, market, sector_code, date):
    out = cli.get(f"{Q}/inquire-investor-daily-by-market", "FHPTJ04040000", {
        "FID_COND_MRKT_DIV_CODE": "U", "FID_INPUT_ISCD": sector_code, "FID_INPUT_DATE_1": date,
        "FID_INPUT_ISCD_1": "KSP" if market == "KOSPI" else "KSQ", "FID_INPUT_DATE_2": date,
        "FID_INPUT_ISCD_2": sector_code}).get("output") or []
    rows = out if isinstance(out, list) else [out]
    return next((x for x in rows if x.get("stck_bsop_date") == date), None)


# ------------------------------------------------------------------ 가공
def parse_price(code, meta, o):
    close, vol, val = num(o.get("stck_prpr")), num(o.get("acml_vol")), num(o.get("acml_tr_pbmn"))
    shares = num(o.get("lstn_stcn"))
    flags = []
    if (o.get("mang_issu_cls_code") or "N") not in ("N", "", "0", "00"):
        flags.append("관리종목")
    w = str(o.get("mrkt_warn_cls_code") or "00").zfill(2)
    if w != "00":
        flags.append({"01": "투자주의", "02": "투자경고", "03": "투자위험"}.get(w, f"시장경고 {w}"))
    for k, label in (("temp_stop_yn", "거래정지"), ("sltr_yn", "정리매매"), ("short_over_yn", "단기과열"), ("invt_caful_yn", "투자유의")):
        if (o.get(k) or "N") not in ("N", "", "0"):
            flags.append(label)
    return {
        "code": code, "name": meta.get("name"), "market": meta.get("market") or o.get("rprs_mrkt_kor_name"),
        "sector": o.get("bstp_kor_isnm"), "close": close, "change_pct": num(o.get("prdy_ctrt")),
        "volume": vol, "value_raw": val, "shares": shares,
        "mktcap": shares * close if shares and close else None,
        "per": num(o.get("per")), "eps": num(o.get("eps")), "pbr": num(o.get("pbr")),
        "w52_high": num(o.get("w52_hgpr")), "w52_high_date": o.get("w52_hgpr_date"),
        "high": num(o.get("stck_hgpr")), "upper_limit_price": num(o.get("stck_mxpr")),
        "foreign_ownership_pct": num(o.get("hts_frgn_ehrt")), "flags": flags,
    }


def calibrate_price_unit(rows):
    """현재가 acml_tr_pbmn 단위: 종가×거래량(원)과 비교."""
    ratios = [x["close"] * x["volume"] / x["value_raw"] for x in rows
              if x["close"] and x["volume"] and x["value_raw"]]
    if not ratios:
        return 1.0
    return nearest_unit(statistics.median(ratios))


def calibrate_investor_unit(pairs):
    """투자자 금액 단위: 총 거래대금(원) / (개인+외국인+기관 매수 합계 원값). 기타법인이 빠져 1~1.5배가 정상."""
    ratios = [total / buys for total, buys in pairs if total and buys and buys > 0]
    if not ratios:
        return None
    return nearest_unit(statistics.median(ratios))


def parse_member(m, close):
    def side(prefix, qty_key):
        out = []
        for i in range(1, 6):
            name = (m.get(f"{prefix}_mbcr_name{i}") or "").strip()
            if not name:
                continue
            out.append({"name": name, "qty": num(m.get(f"{qty_key}{i}")),
                        "share_pct": num(m.get(f"{prefix}_mbcr_rlim{i}")),
                        "foreign": (m.get(f"{prefix}_mbcr_glob_yn_{i}") or "N") == "Y"})
        return out
    gq = num(m.get("glob_ntby_qty"))
    return {"buy_top5": side("shnu", "total_shnu_qty"), "sell_top5": side("seln", "total_seln_qty"),
            "foreign_net_qty": gq, "foreign_net_value_est": gq * close if gq is not None and close else None,
            "foreign_buy_share_pct": num(m.get("glob_shnu_rlim")), "foreign_sell_share_pct": num(m.get("glob_seln_rlim"))}


def investor_today(rows, date):
    row = next((x for x in rows if x.get("stck_bsop_date") == date), None)
    if not row:
        return None
    g = lambda k: num(row.get(k))
    return {"net_raw": {"개인": g("prsn_ntby_tr_pbmn"), "외국인": g("frgn_ntby_tr_pbmn"), "기관계": g("orgn_ntby_tr_pbmn")},
            "buy_raw_sum": sum(v for v in (g("prsn_shnu_tr_pbmn"), g("frgn_shnu_tr_pbmn"), g("orgn_shnu_tr_pbmn")) if v),
            "net_qty": {"개인": g("prsn_ntby_qty"), "외국인": g("frgn_ntby_qty"), "기관계": g("orgn_ntby_qty")}}


def market_flow(row):
    if not row:
        return None
    return {"index": num(row.get("bstp_nmix_prpr")), "change_pct": num(row.get("bstp_nmix_prdy_ctrt")),
            "net_value_raw": {label: num(row.get(f"{p}_ntby_tr_pbmn")) for label, p in INVESTORS},
            "net_qty": {label: num(row.get(f"{p}_ntby_qty") or row.get(f"{p}_ntby_vol")) for label, p in INVESTORS}}


def parse_sector(row, market):
    return {"market": market, "code": row.get("bstp_cls_code"), "name": (row.get("hts_kor_isnm") or "").strip(),
            "index": num(row.get("bstp_nmix_prpr")), "change_pct": num(row.get("bstp_nmix_prdy_ctrt")),
            "value_raw": num(row.get("acml_tr_pbmn")), "value_share_pct": num(row.get("acml_tr_pbmn_rlim")),
            "prev_value_raw": num(row.get("prdy_tr_pbmn")),
            "value_vs_prev": (num(row.get("acml_tr_pbmn")) / num(row.get("prdy_tr_pbmn"))
                              if num(row.get("acml_tr_pbmn")) and num(row.get("prdy_tr_pbmn")) else None),
            "up": num(row.get("ascn_issu_cnt")), "down": num(row.get("down_issu_cnt")),
            "limit_up": num(row.get("uplm_issu_cnt")), "limit_down": num(row.get("lslm_issu_cnt"))}


def aggregate_by_sector(stocks):
    agg = {}
    for s in stocks:
        k = s.get("sector") or "업종 미확인"
        a = agg.setdefault(k, {"sector": k, "stocks": 0, "value": 0.0, "개인": 0.0, "외국인": 0.0, "기관계": 0.0,
                               "foreign_broker_net_est": 0.0, "names": []})
        a["stocks"] += 1
        a["value"] += s.get("value") or 0
        for inv in ("개인", "외국인", "기관계"):
            a[inv] += ((s.get("investors") or {}).get("net") or {}).get(inv) or 0
        a["foreign_broker_net_est"] += (s.get("members") or {}).get("foreign_net_value_est") or 0
        a["names"].append(s["name"])
    out = sorted(agg.values(), key=lambda a: a["value"], reverse=True)
    for a in out:
        a["names"] = a["names"][:8]
    return out


# ------------------------------------------------------------------ 메인
def collect(cli, universe, today, limit=0, log=log):
    status = {"errors": []}
    idx = cli.index_bars("0001", (datetime.strptime(today, "%Y%m%d") - timedelta(days=10)).strftime("%Y%m%d"), today, max_pages=1)
    as_of = idx[-1]["date"] if idx else None
    status["as_of"], status["is_today"] = as_of, as_of == today
    if not as_of:
        raise KISError("지수 일봉 조회 실패 — 기준일을 정할 수 없습니다.")

    # 1) 전 종목 현재가 스윕 → 거래대금 순위
    if limit:
        universe = universe[:limit]
    meta = {u["code"]: u for u in universe}
    prices, failed = {}, []
    for i, u in enumerate(universe, 1):
        try:
            prices[u["code"]] = parse_price(u["code"], u, get_price(cli, u["code"]))
        except Exception as e:  # 한 종목 오류로 전체가 멈추지 않게
            failed.append({"code": u["code"], "error": str(e)[:120]})
        if i % 300 == 0:
            log(f"현재가 {i}/{len(universe)} · 호출 {cli.calls}")
    p_unit = calibrate_price_unit(list(prices.values()))
    for p in prices.values():
        p["value"] = p["value_raw"] * p_unit if p["value_raw"] is not None else None

    # 2) 상한가: 상하한가 포착(우선주 포함) + 스윕 등락률
    lu_codes = []
    try:
        for x in get_limit_ups(cli):
            c = (x.get("mksc_shrn_iscd") or "").strip()
            if c:
                lu_codes.append(c)
    except KISError as e:
        status["errors"].append(f"상하한가 포착 실패: {e}")
    lu_codes += [c for c, p in prices.items() if (p["change_pct"] or 0) >= LIMIT_UP_PCT]
    lu_codes = list(dict.fromkeys(lu_codes))
    for c in lu_codes:  # 유니버스 밖(우선주 등)은 현재가를 따로 조회
        if c not in prices:
            try:
                p = parse_price(c, {"name": None}, get_price(cli, c))
                p["value"] = p["value_raw"] * p_unit if p["value_raw"] is not None else None
                prices[c] = p
            except KISError as e:
                status["errors"].append(f"상한가 {c} 현재가 실패: {e}")

    ranked = sorted((p for p in prices.values() if (p.get("value") or 0) >= MIN_VALUE),
                    key=lambda p: p["value"], reverse=True)[:TOP_N]
    top_codes = [p["code"] for p in ranked]
    target = list(dict.fromkeys(lu_codes + top_codes))
    log(f"기준일 {as_of} · 스윕 {len(prices)} · 상한가 {len(lu_codes)} · 1,000억 이상 {len(top_codes)} · 대상 {len(target)}")

    # 3) 대상 종목 투자자·거래원
    inv_pairs, details = [], {}
    for c in target:
        p = prices.get(c)
        if not p:
            continue
        d = {}
        try:
            d["investor_raw"] = investor_today(get_investor_rows(cli, c), as_of)
            if d["investor_raw"] and p.get("value"):
                inv_pairs.append((p["value"], d["investor_raw"]["buy_raw_sum"]))
        except KISError as e:
            d["investor_error"] = str(e)[:120]
        try:
            d["members"] = parse_member(get_member(cli, c), p.get("close"))
        except KISError as e:
            d["member_error"] = str(e)[:120]
        details[c] = d
    inv_unit = calibrate_investor_unit(inv_pairs)
    if inv_unit is None:
        status["errors"].append("종목별 투자자 금액 단위 판별 실패 — 원값만 기록")

    def stock_record(c):
        p, d = dict(prices[c]), details.get(c, {})
        p["limit_up"] = c in lu_codes
        p["top_value_rank"] = top_codes.index(c) + 1 if c in top_codes else None
        p["new_52w_high"] = bool(p.get("w52_high_date") == as_of)
        p["preferred"] = not c.endswith("0")
        ir = d.get("investor_raw")
        if ir:
            p["investors"] = {"net_raw": ir["net_raw"], "net_qty": ir["net_qty"],
                              "net": {k: (v * inv_unit if v is not None and inv_unit else None) for k, v in ir["net_raw"].items()}}
        elif "investor_error" in d:
            p["investors"] = {"error": d["investor_error"]}
        else:
            p["investors"] = {"error": "당일 투자자 데이터 없음(장 종료 후 제공 — 수집 시각 확인)"}
        p["members"] = d.get("members") or {"error": d.get("member_error", "미조회")}
        p.pop("value_raw", None)
        return p

    limit_ups = [stock_record(c) for c in lu_codes if c in prices]
    top = [stock_record(c) for c in top_codes]

    # 4) 시장·업종
    market, sectors = {}, []
    for mk, code in (("KOSPI", "0001"), ("KOSDAQ", "1001")):
        m = {}
        try:
            head, rows = get_sectors(cli, mk)
            m["summary"] = parse_sector(head, mk) if head else None
            secs = [parse_sector(x, mk) for x in rows if x.get("bstp_cls_code") and x.get("bstp_cls_code") != code]
        except KISError as e:
            status["errors"].append(f"{mk} 업종 시세 실패: {e}")
            secs = []
        try:
            m["investors"] = market_flow(get_market_investors(cli, mk, code, as_of))
        except KISError as e:
            status["errors"].append(f"{mk} 투자자별 실패: {e}")
        # 업종별 투자자: 지수값이 업종 시세와 맞을 때만 채택(파라미터 해석 검증)
        for s in secs:
            if s["code"] in (code,):
                continue
            try:
                f = market_flow(get_market_investors(cli, mk, s["code"], as_of))
            except KISError:
                f = None
            if f and f["index"] and s["index"] and abs(f["index"] / s["index"] - 1) < 0.005:
                s["investors"] = f
        market[mk] = m
        sectors += secs

    all_flows = [s for s in sectors if s.get("investors")]
    status["sector_investor_valid"] = len(all_flows)
    out = {
        **status,
        "generated_at": datetime.now(KST).isoformat(timespec="seconds"),
        "data_source": "한국투자증권 Open API (현재가·상하한가 포착·종목 투자자·회원사·시장별 투자자·업종 시세)",
        "criteria": {"limit_up": "상하한가 포착 + 등락률 29.5% 이상", "top_value": f"거래대금 {MIN_VALUE/1e8:,.0f}억 원 이상 중 상위 {TOP_N}"},
        "units": {"stock_value": "원", "price_api_value_factor": p_unit, "stock_investor_factor": inv_unit,
                  "market_investor_value": "원값(API) — 단위 미확인, KRX 인용 보도 수치와 대조해 판별",
                  "sector_value": "원값(API) — 단위 미확인"},
        "universe_swept": len(prices), "sweep_failed": len(failed), "api_calls": cli.calls,
        "market": market, "sectors": sectors,
        "limit_ups": limit_ups, "top_value": top,
        "sector_flows_from_top": aggregate_by_sector(top),
    }
    if len(failed) > 0.1 * max(1, len(universe)):
        out["status"] = "incomplete"
        out["errors"].append(f"현재가 조회 실패 {len(failed)}종목")
    else:
        out["status"] = "ok"
    return out


def eok(x):
    return "—" if x is None else f"{x / 1e8:,.0f}"


def pct(x):
    return "—" if x is None else f"{x:+.2f}%"


def write_md(o, path):
    L = [f"# 시황 데이터 — 기준일 {o.get('as_of')}",
         f"상태 {o['status']} · 스윕 {o['universe_swept']}종목(실패 {o['sweep_failed']}) · API {o['api_calls']}회 · 기준: {o['criteria']['top_value']}",
         f"출처: {o['data_source']}", ""]
    if o["errors"]:
        L += ["> ⚠ " + e for e in o["errors"]] + [""]
    L += ["## 시장 개요", "| 시장 | 지수 | 등락 | 상승/하락 | 상한/하한 | 거래대금 전일 대비 |", "|---|---|---|---|---|---|"]
    for mk, m in o["market"].items():
        s = m.get("summary") or {}
        ratio = "—" if s.get("value_vs_prev") is None else f"{s['value_vs_prev']:.2f}배"
        L.append(f"| {mk} | {s.get('index') or '—'} | {pct(s.get('change_pct'))} | {s.get('up') or 0:.0f}/{s.get('down') or 0:.0f} | "
                 f"{s.get('limit_up') or 0:.0f}/{s.get('limit_down') or 0:.0f} | {ratio} |")
    L += ["", "## 시장별 투자자 순매수 (API 원값, 단위 미확인)", "| 시장 | 지수 | 등락 | 개인 | 외국인 | 기관계 | 금융투자 | 투신 | 연기금 | 기타법인 |", "|---|---|---|---|---|---|---|---|---|---|"]
    for mk, m in o["market"].items():
        f = m.get("investors") or {}
        v = f.get("net_value_raw") or {}
        g = lambda k: "—" if v.get(k) is None else f"{v[k]:,.0f}"
        L.append(f"| {mk} | {f.get('index') or '—'} | {pct(f.get('change_pct'))} | {g('개인')} | {g('외국인')} | {g('기관계')} | {g('금융투자')} | {g('투자신탁')} | {g('연기금')} | {g('기타법인')} |")
    secs = sorted([s for s in o["sectors"] if s.get("change_pct") is not None], key=lambda s: s["change_pct"], reverse=True)
    L += ["", "## 업종 등락 상위·하위 5", "| 시장 | 업종 | 등락 | 거래대금 비중 | 상승/하락 | 상한 |", "|---|---|---|---|---|---|"]
    for s in (secs if len(secs) <= 10 else secs[:5] + secs[-5:]):
        L.append(f"| {s['market']} | {s['name']} | {pct(s['change_pct'])} | {s['value_share_pct'] or '—'}% | {s['up'] or 0:.0f}/{s['down'] or 0:.0f} | {s['limit_up'] or 0:.0f} |")
    L += ["", "## 거래대금 상위 종목의 업종별 자금 흐름 [계산, 억 원]", "| 업종 | 종목 수 | 거래대금 | 개인 | 외국인 | 기관계 | 외국계 창구(추정) | 종목 |", "|---|---|---|---|---|---|---|---|"]
    for a in o["sector_flows_from_top"][:15]:
        L.append(f"| {a['sector']} | {a['stocks']} | {eok(a['value'])} | {eok(a['개인'])} | {eok(a['외국인'])} | {eok(a['기관계'])} | {eok(a['foreign_broker_net_est'])} | {', '.join(a['names'])} |")

    def stock_table(title, rows):
        L.extend(["", f"## {title}", "| # | 종목 | 업종 | 등락 | 거래대금(억) | 시총(억) | 개인 | 외국인 | 기관계 | 외국계 창구(억, 추정) | 매수 1위 창구 | 매도 1위 창구 | 비고 |",
                  "|---|---|---|---|---|---|---|---|---|---|---|---|---|"])
        for i, s in enumerate(rows, 1):
            n = (s.get("investors") or {}).get("net") or {}
            mb = s.get("members") or {}
            b1 = (mb.get("buy_top5") or [{}])[0].get("name", "—")
            s1 = (mb.get("sell_top5") or [{}])[0].get("name", "—")
            note = ", ".join(s.get("flags", []) + (["52주 신고가"] if s.get("new_52w_high") else []) + (["상한가"] if s.get("limit_up") else []) + (["우선주"] if s.get("preferred") else []))
            L.append(f"| {i} | {s.get('name') or s['code']}({s['code']}) | {s.get('sector') or '—'} | {pct(s.get('change_pct'))} | {eok(s.get('value'))} | {eok(s.get('mktcap'))} | "
                     f"{eok(n.get('개인'))} | {eok(n.get('외국인'))} | {eok(n.get('기관계'))} | {eok(mb.get('foreign_net_value_est'))} | {b1} | {s1} | {note or '—'} |")
    stock_table(f"상한가 {len(o['limit_ups'])}종목", o["limit_ups"])
    stock_table(f"거래대금 상위 {len(o['top_value'])}종목", o["top_value"])
    with open(path, "w", encoding="utf-8") as fp:
        fp.write("\n".join(L) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="out/recap")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--require-today", action="store_true")
    a = ap.parse_args()
    os.makedirs(os.path.join(a.out, "archive"), exist_ok=True)
    today = datetime.now(KST).strftime("%Y%m%d")
    started = time.time()
    try:
        cli = KISClient.from_env()
        if a.require_today:
            idx = cli.index_bars("0001", (datetime.now(KST) - timedelta(days=10)).strftime("%Y%m%d"), today, max_pages=1)
            if not idx or idx[-1]["date"] != today:
                log("오늘은 휴장일로 보고 건너뜀")
                sys.exit(3)
        out = collect(cli, load_universe(), today, a.limit)
    except SystemExit:
        raise
    except Exception as e:
        err = {"status": "error", "errors": [f"{type(e).__name__}: {e}"], "generated_at": datetime.now(KST).isoformat(timespec="seconds")}
        with open(os.path.join(a.out, "latest.json"), "w", encoding="utf-8") as fp:
            json.dump(err, fp, ensure_ascii=False, indent=1)
        log(f"실패: {e}")
        sys.exit(1)
    out["elapsed_sec"] = int(time.time() - started)
    with open(os.path.join(a.out, "latest.json"), "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, indent=1)
    with open(os.path.join(a.out, "archive", f"{out['as_of']}.json"), "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False)
    write_md(out, os.path.join(a.out, "latest.md"))
    log(f"완료: 상한가 {len(out['limit_ups'])} · 상위 {len(out['top_value'])} · 호출 {out['api_calls']} · {out['elapsed_sec']}초")
    sys.exit(0 if out["status"] == "ok" else 2)


if __name__ == "__main__":
    main()
