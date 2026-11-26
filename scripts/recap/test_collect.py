"""시황 수집기 오프라인 테스트: python scripts/recap/test_collect.py (네트워크 불필요)"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import collect  # noqa: E402

AS_OF = "20261126"


class FakeKIS:
    """150종목. i번째 종목 거래대금 = (150-i)×20억 → 상위 100개 중 1,000억 이상은 (150-i)×20e8 ≥ 1e11 ⇒ i ≤ 100 (101종목) → 상위 100으로 잘림.
    투자자 금액은 백만원 단위로 내려준다(단위 자동 판별 검증)."""

    def __init__(self, date=AS_OF):
        self.calls, self.date = 0, date
        self.universe = [{"code": f"{100000 + i * 10:06d}", "name": f"종목{i}", "market": "KOSPI" if i % 2 else "KOSDAQ", "group": "ST"} for i in range(150)]

    def index_bars(self, code, start, end, max_pages=1):
        self.calls += 1
        return [{"date": "20261125", "close": 2600}, {"date": self.date, "close": 2610}]

    def _i(self, code):
        return (int(code) - 100000) // 10

    def get(self, path, tr_id, params):
        self.calls += 1
        code = params.get("FID_INPUT_ISCD")
        if tr_id == "FHKST01010100":  # 현재가
            if code == "123455":  # 우선주 상한가(유니버스 밖)
                return {"output": {"stck_prpr": "13000", "acml_vol": "100000", "acml_tr_pbmn": "1300000000", "prdy_ctrt": "29.97",
                                   "bstp_kor_isnm": "화학", "lstn_stcn": "1000000", "w52_hgpr": "13000", "w52_hgpr_date": self.date,
                                   "mrkt_warn_cls_code": "00", "rprs_mrkt_kor_name": "KOSPI"}}
            i = self._i(code)
            value = (150 - i) * 20e8
            close = 10000 + i
            chg = "29.99" if i == 7 else "1.5"
            return {"output": {"stck_prpr": str(close), "acml_vol": str(int(value / close)), "acml_tr_pbmn": str(int(value)),
                               "prdy_ctrt": chg, "bstp_kor_isnm": ["전기전자", "운수장비", "화학"][i % 3], "lstn_stcn": "50000000",
                               "w52_hgpr": str(close), "w52_hgpr_date": self.date if i < 5 else "20260101",
                               "mrkt_warn_cls_code": "02" if i == 3 else "00", "mang_issu_cls_code": "N"}}
        if tr_id == "FHKST130000C0":  # 상하한가 포착
            return {"output": [{"mksc_shrn_iscd": "123455", "hts_kor_isnm": "우선주A", "prdy_ctrt": "29.97"},
                               {"mksc_shrn_iscd": "100070", "hts_kor_isnm": "종목7", "prdy_ctrt": "29.99"}]}
        if tr_id == "FHKST01010900":  # 종목 투자자(백만원 단위)
            value = 1.3e9 if code == "123455" else (150 - self._i(code)) * 20e8
            m = value / 1e6
            return {"output": [{"stck_bsop_date": self.date, "prsn_ntby_tr_pbmn": str(round(m * 0.05)), "frgn_ntby_tr_pbmn": str(round(-m * 0.03)),
                                "orgn_ntby_tr_pbmn": str(round(-m * 0.02)), "prsn_shnu_tr_pbmn": str(round(m * 0.5)),
                                "frgn_shnu_tr_pbmn": str(round(m * 0.2)), "orgn_shnu_tr_pbmn": str(round(m * 0.1)),
                                "prsn_ntby_qty": "100", "frgn_ntby_qty": "-60", "orgn_ntby_qty": "-40"},
                               {"stck_bsop_date": "20261125", "prsn_ntby_tr_pbmn": "1"}]}
        if tr_id == "FHKST01010600":  # 회원사
            return {"output": {"shnu_mbcr_name1": "키움증권", "total_shnu_qty1": "5000", "shnu_mbcr_rlim1": "20.1", "shnu_mbcr_glob_yn_1": "N",
                               "seln_mbcr_name1": "모건스탠리", "total_seln_qty1": "7000", "seln_mbcr_rlim1": "25.0", "seln_mbcr_glob_yn_1": "Y",
                               "glob_ntby_qty": "-3000", "glob_shnu_rlim": "5.0", "glob_seln_rlim": "25.0"}}
        if tr_id == "FHPUP02140000":  # 업종 시세
            mk_head = {"bstp_cls_code": code, "hts_kor_isnm": "종합", "bstp_nmix_prpr": "2610", "bstp_nmix_prdy_ctrt": "0.38",
                       "acml_tr_pbmn": "12000000", "prdy_tr_pbmn": "10000000", "ascn_issu_cnt": "500", "down_issu_cnt": "380"}
            return {"output1": mk_head, "output2": [
                {"bstp_cls_code": code, "hts_kor_isnm": "종합", "bstp_nmix_prpr": "2610", "bstp_nmix_prdy_ctrt": "0.38"},
                {"bstp_cls_code": "0013", "hts_kor_isnm": "전기전자", "bstp_nmix_prpr": "30000", "bstp_nmix_prdy_ctrt": "2.1", "acml_tr_pbmn_rlim": "35.2", "ascn_issu_cnt": "20", "down_issu_cnt": "10", "uplm_issu_cnt": "1"},
                {"bstp_cls_code": "0015", "hts_kor_isnm": "운수장비", "bstp_nmix_prpr": "2000", "bstp_nmix_prdy_ctrt": "-1.2", "acml_tr_pbmn_rlim": "8.1", "ascn_issu_cnt": "5", "down_issu_cnt": "30", "uplm_issu_cnt": "0"}]}
        if tr_id == "FHPTJ04040000":  # 시장·업종 투자자
            idx = {"0001": "2610", "1001": "2610", "0013": "30000", "0015": "9999"}[code]  # 0015는 지수 불일치 → 채택 안 됨
            return {"output": [{"stck_bsop_date": self.date, "bstp_nmix_prpr": idx, "bstp_nmix_prdy_ctrt": "0.38",
                                "prsn_ntby_tr_pbmn": "-523400", "frgn_ntby_tr_pbmn": "612000", "orgn_ntby_tr_pbmn": "-88600",
                                "scrt_ntby_tr_pbmn": "-30000", "fund_ntby_tr_pbmn": "12000", "etc_corp_ntby_tr_pbmn": "1000"}]}
        raise AssertionError(f"unexpected tr_id {tr_id}")


def test_collect():
    fake = FakeKIS()
    out = collect.collect(fake, fake.universe, AS_OF, log=lambda m: None)
    assert out["status"] == "ok" and out["as_of"] == AS_OF and out["is_today"]
    top = out["top_value"]
    assert len(top) == 100, len(top)
    assert all(s["value"] >= 1e11 for s in top)
    assert [s["value"] for s in top] == sorted((s["value"] for s in top), reverse=True)
    assert top[0]["top_value_rank"] == 1 and top[0]["code"] == "100000"
    # 상한가: 우선주(유니버스 밖) + 등락률 29.99% 종목
    lu = {s["code"]: s for s in out["limit_ups"]}
    assert set(lu) == {"123455", "100070"}, lu.keys()
    assert lu["123455"]["preferred"] and lu["123455"]["limit_up"]
    # 단위 판별: 현재가 원(1), 투자자 백만원(1e6) → 순매수가 원 단위로 환산
    assert out["units"]["price_api_value_factor"] == 1.0
    assert out["units"]["stock_investor_factor"] == 1e6
    s0 = top[0]
    assert abs(s0["investors"]["net"]["개인"] - s0["value"] * 0.05) / s0["value"] < 0.001
    # 거래원·외국계, 위험 플래그, 52주 신고가
    assert s0["members"]["sell_top5"][0]["name"] == "모건스탠리" and s0["members"]["sell_top5"][0]["foreign"]
    assert s0["members"]["foreign_net_value_est"] == -3000 * s0["close"]
    assert "투자경고" in next(s for s in top if s["code"] == "100030")["flags"]
    assert s0["new_52w_high"] and not next(s for s in top if s["code"] == "100100")["new_52w_high"]
    # 업종: 지수가 맞는 업종만 투자자 데이터 채택, 시장별 투자자 원값 보존
    sec = {s["code"]: s for s in out["sectors"] if s["market"] == "KOSPI"}
    assert "investors" in sec["0013"] and "investors" not in sec["0015"]
    assert "0001" not in sec and all(s["name"] != "종합" for s in out["sectors"])
    assert out["market"]["KOSPI"]["investors"]["net_value_raw"]["외국인"] == 612000
    flows = {a["sector"]: a for a in out["sector_flows_from_top"]}
    assert flows["전기전자"]["stocks"] == 34 and flows["전기전자"]["외국인"] < 0
    # 마크다운
    d = tempfile.mkdtemp()
    collect.write_md(out, os.path.join(d, "latest.md"))
    md = open(os.path.join(d, "latest.md"), encoding="utf-8").read()
    assert "거래대금 상위 100종목" in md and "상한가 2종목" in md and "모건스탠리" in md
    assert abs(out["market"]["KOSPI"]["summary"]["value_vs_prev"] - 1.2) < 1e-9 and "1.20배" in md
    json.dumps(out, ensure_ascii=False)  # 직렬화 가능
    print("calls:", out["api_calls"], "| top1:", s0["name"], f"{s0['value']/1e8:,.0f}억")


def test_threshold_cuts_below_1000eok():
    fake = FakeKIS()
    # i=100은 정확히 1,000억(포함), i≥101은 미만(제외). 유니버스 밖 상한가 종목(2,860억)도 거래대금 순위에 들어가야 한다
    out = collect.collect(fake, fake.universe[100:], AS_OF, log=lambda m: None)
    assert [s["code"] for s in out["top_value"]] == ["100070", "101000"], [s["code"] for s in out["top_value"]]
    out = collect.collect(fake, fake.universe[101:], AS_OF, log=lambda m: None)
    assert [s["code"] for s in out["top_value"]] == ["100070"]
    assert {s["code"] for s in out["limit_ups"]} == {"123455", "100070"}
    assert all(s["value"] >= 1e11 for s in out["top_value"])


def test_nearest_unit():
    assert collect.nearest_unit(1.2) == 1.0
    assert collect.nearest_unit(1.25e6) == 1e6
    assert collect.nearest_unit(900) == 1e3
    assert collect.nearest_unit(None) is None


if __name__ == "__main__":
    for fn in (test_nearest_unit, test_threshold_cuts_below_1000eok, test_collect):
        fn()
        print("ok", fn.__name__)
