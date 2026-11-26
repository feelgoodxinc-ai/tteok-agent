"""오프라인 전체 흐름 테스트 — 가짜 KIS 클라이언트로 screener.main()을 돌린다. 네트워크 불필요.
실행: python scripts/wml/test_offline_pipeline.py
"""
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timedelta

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import screener  # noqa: E402
import universe as uni  # noqa: E402


def bdays(end: str, n: int):
    d = datetime.strptime(end, "%Y%m%d")
    out = []
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d.strftime("%Y%m%d"))
        d -= timedelta(days=1)
    return out[::-1]


class FakeKIS:
    """종목코드 끝 자리로 모양을 정한다: 0~3 VCP 상승주, 4~6 하락주, 7~9 횡보주. split_codes는 다음 실행에 수정주가가 바뀐다."""
    base = "fake-real"

    def __init__(self, today, split_codes=()):
        self.today, self.calls, self.split_codes = today, 0, set(split_codes)

    def series(self, code):
        rng = np.random.default_rng(int(code))
        k = int(code[-2])
        n = 280
        if k <= 3:
            up = np.linspace(10000, 30000, n - 44)
            pk = up[-1]
            legs = [np.linspace(pk, pk * .76, 12)[1:], np.linspace(pk * .76, pk * .98, 12)[1:],
                    np.linspace(pk * .98, pk * .98 * .88, 8)[1:], np.linspace(pk * .98 * .88, pk * .98 * .99, 8)[1:],
                    np.linspace(pk * .98 * .99, pk * .98 * .99 * .95, 5)[1:], np.linspace(pk * .98 * .99 * .95, pk * .98 * .99 * .985, 5)[1:]]
            c = np.r_[up, np.concatenate(legs)]
            v = np.r_[np.full(len(up), 1.2e6), np.linspace(1.1e6, 5e5, n - len(up))]
        elif k <= 6:
            c = np.linspace(30000, 12000, n) * (1 + rng.normal(0, .005, n))
            v = np.full(n, 8e5)
        else:
            c = 20000 * (1 + rng.normal(0, .01, n)).cumprod() ** 0.2
            v = np.full(n, 6e5)
        c, v = c[:n], v[:n]
        dates = bdays("20261125", n)  # 시세는 날짜에 고정. 이후 영업일은 +1%씩 이어 붙인다
        d = datetime.strptime(dates[-1], "%Y%m%d")
        while True:
            d += timedelta(days=1)
            if d.strftime("%Y%m%d") > self.today:
                break
            if d.weekday() < 5:
                dates.append(d.strftime("%Y%m%d"))
                c, v = np.r_[c, c[-1] * 1.01], np.r_[v, v[-1]]
        if code in self.split_codes:
            c = c / 2  # 액면분할 → 과거 수정주가가 절반으로 바뀜
        return dates, c, v

    def daily_bars(self, code, start, end, adjusted=True, max_pages=4):
        self.calls += 1
        dates, c, v = self.series(code)
        bars = [{"date": d, "open": c[i - 1] if i else c[i], "high": max(c[i], c[i - 1] if i else c[i]) * 1.004,
                 "low": min(c[i], c[i - 1] if i else c[i]) * 0.996, "close": c[i], "volume": v[i], "value": c[i] * v[i]}
                for i, d in enumerate(dates) if start <= d <= end]
        return bars, {"lstn_stcn": "20000000", "hts_kor_isnm": f"종목{code}"}

    def index_bars(self, code, start, end, max_pages=8):
        self.calls += 1
        dates = bdays(self.today, 270)
        c = np.linspace(2400, 2700, 270)
        return [{"date": d, "open": c[i], "high": c[i] * 1.003, "low": c[i] * .997, "close": c[i],
                 "volume": 1e6, "value": 1e6} for i, d in enumerate(dates) if start <= d <= end]

    def price_flags(self, code):
        self.calls += 1
        warn = "02" if code.endswith("10") else "00"
        return {"mang_issu_cls_code": "N", "mrkt_warn_cls_code": warn, "sltr_yn": "N", "temp_stop_yn": "N",
                "invt_caful_yn": "N", "short_over_yn": "N", "bstp_kor_isnm": "전기전자" if int(code[-2]) <= 3 else "화학"}


def fake_universe():
    return [{"code": f"{100000 + i * 10:06d}", "name": f"종목{i}", "market": "KOSPI" if i % 2 else "KOSDAQ", "group": "ST"}
            for i in range(40)]


def run(tmp, today, split_codes=(), extra_args=()):
    fake = FakeKIS(today, split_codes)
    screener.KISClient.from_env = classmethod(lambda cls: fake)
    screener.load_universe = fake_universe
    real_now = screener.datetime

    class FixedDT(real_now):
        @classmethod
        def now(cls, tz=None):
            return real_now.strptime(today + " 1600", "%Y%m%d %H%M").replace(tzinfo=tz)
    screener.datetime = FixedDT
    sys.argv = ["screener", "--out", os.path.join(tmp, "out"), "--cache", os.path.join(tmp, "cache"), *extra_args]
    code = 0
    try:
        screener.main()
    except SystemExit as e:
        code = e.code
    finally:
        screener.datetime = real_now
    out = json.load(open(os.path.join(tmp, "out", "latest.json"), encoding="utf-8"))
    return code, out, fake.calls


def test_universe_tail_detection():
    tail = "ST" + "0" * 226
    lines = [f"{100000 + i:06d}   KR7{100000 + i:06d}003종목명{i}   " + tail for i in range(50)]
    lines += [f"{200000 + i:06d}   KR7{200000 + i:06d}003코덱스ETF{i} " + "EF" + "0" * 226 for i in range(5)]
    assert uni.detect_tail_length(lines) == 228
    rows = uni.parse_master(lines, "KOSPI")
    assert rows[0]["code"] == "100000" and rows[0]["group"] == "ST"
    kept = [r for r in rows if uni.is_common_stock(r)]
    assert all(r["group"] == "ST" and r["code"].endswith("0") for r in kept)
    assert not any("ETF" in r["name"] for r in kept)


def test_pipeline():
    tmp = tempfile.mkdtemp()
    try:
        day1 = "20261125"
        code, out, calls1 = run(tmp, day1)
        assert code == 0, out["errors"]
        assert out["as_of"] == day1 and out["is_today"]
        assert out["evaluated"] == 40
        cands = out["candidates"]
        assert cands, "VCP 종목이 실행 후보로 나와야 함"
        assert all(int(c["code"][-2]) <= 3 for c in cands)
        assert not any(c["code"].endswith("10") for c in cands), "투자경고 종목은 후보에서 빠져야 함"
        assert any("투자경고" in w["flags"] and "위험 플래그로 실행 후보에서 제외" in w["reasons"] for w in out["watch"])
        for c in cands:
            assert c["template_passed"] >= 7 and c["template_unknown"] == 0
            assert -0.03 <= c["dist_to_pivot"] <= 0.05
            assert c["plan"]["stop_pct_from_pivot"] >= -0.0801
        md = open(os.path.join(tmp, "out", "latest.md"), encoding="utf-8").read()
        assert "실행 후보" in md and "시장 국면" in md

        # 같은 날 재실행 → 종목 일봉은 캐시 사용, 시가총액도 유지되어 같은 결과
        code, out2, calls2 = run(tmp, day1)
        assert out2["fetch_modes"].get("cache") == 40, out2["fetch_modes"]
        assert len(out2["candidates"]) == len(cands)
        assert calls2 < calls1

        # 다음 영업일 → 증분 조회, 분할 종목은 전체 재조회
        code, out3, _ = run(tmp, "20261126", split_codes={"100000"})
        assert out3["fetch_modes"].get("incremental", 0) >= 30, out3["fetch_modes"]
        assert out3["fetch_modes"].get("refetch(수정주가 변경)") == 1, out3["fetch_modes"]
        # 토요일 예약 실행 → 기준일(금요일) ≠ 오늘 → 종료 코드 3, 결과 파일은 덮어쓰지 않음
        before = open(os.path.join(tmp, "out", "latest.json"), encoding="utf-8").read()
        code, _, calls_sat = run(tmp, "20261128", extra_args=["--require-today"])
        assert code == 3 and calls_sat <= 3, (code, calls_sat)
        assert open(os.path.join(tmp, "out", "latest.json"), encoding="utf-8").read() == before
        print("calls: first", calls1, "same-day", calls2, "| modes day2", out3["fetch_modes"])
        print("candidates:", [(c["name"], c["base_type"], c["pivot"], c["plan"]["stop_pct_from_pivot"]) for c in cands[:3]])
    finally:
        shutil.rmtree(tmp)


if __name__ == "__main__":
    test_universe_tail_detection()
    print("ok test_universe_tail_detection")
    test_pipeline()
    print("ok test_pipeline")
