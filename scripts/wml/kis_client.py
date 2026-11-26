"""한국투자증권(KIS) Open API 최소 시세 클라이언트 — 조회 전용, 주문 기능 없음.

확인한 스펙 (2026-11 기준, 공식 포털·공식 예제 기반 정리 글):
- 일봉: GET /uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice
  tr_id FHKST03010100 (실전·모의 동일), 1회 최대 100건,
  FID_ORG_ADJ_PRC "0" = 수정주가, "1" = 원주가 (이름과 반대이니 주의)
- 지수 일봉: GET /uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice
  tr_id FHKUP03500100, FID_COND_MRKT_DIV_CODE "U", 1회 최대 50건
- 현재가: GET /uapi/domestic-stock/v1/quotations/inquire-price, tr_id FHKST01010100
- 모든 응답 값은 문자열이므로 숫자로 변환해서 쓴다.
- 유량 제한 초과 시 EGW00201 오류. 실전 계좌가 모의 계좌보다 초당 한도가 높다.
"""
from __future__ import annotations

import os
import time
from datetime import datetime, timedelta

import requests

REAL_BASE = "https://openapi.koreainvestment.com:9443"
PAPER_BASE = "https://openapivts.koreainvestment.com:29443"


class KISError(RuntimeError):
    pass


class KISClient:
    def __init__(self, appkey: str, appsecret: str, paper: bool = False,
                 rps: float | None = None, timeout: float = 10.0):
        if not appkey or not appsecret:
            raise KISError("KIS_APP_KEY / KIS_APP_SECRET 이 비어 있습니다 (GitHub Secrets 확인).")
        self.appkey = appkey
        self.appsecret = appsecret
        self.base = PAPER_BASE if paper else REAL_BASE
        # 기본 초당 호출 수는 한도보다 낮게 잡는다 (실전 15, 모의 4).
        # 유량 제한(EGW00201)을 받으면 간격을 1.5배로 늘리고, 200회 연속 성공하면 조금씩 되돌린다(AIMD).
        self.base_interval = 1.0 / (rps or (4.0 if paper else 15.0))
        self.min_interval = self.base_interval
        self.max_interval = 1.0
        self.timeout = timeout
        self.session = requests.Session()
        self._last_call = 0.0
        self._ok_streak = 0
        self.calls = 0
        self.throttled = 0
        self.token = self._issue_token()

    @property
    def rate(self) -> float:
        return round(1.0 / self.min_interval, 2)

    def _on_throttle(self):
        self.throttled += 1
        self._ok_streak = 0
        self.min_interval = min(self.min_interval * 1.5, self.max_interval)

    def _on_success(self):
        self._ok_streak += 1
        if self._ok_streak >= 200 and self.min_interval > self.base_interval:
            self.min_interval = max(self.base_interval, self.min_interval / 1.2)
            self._ok_streak = 0

    @classmethod
    def from_env(cls) -> "KISClient":
        paper = os.environ.get("KIS_PAPER", "false").lower() in ("1", "true", "yes")
        rps = os.environ.get("KIS_RPS")
        return cls(os.environ.get("KIS_APP_KEY", ""), os.environ.get("KIS_APP_SECRET", ""),
                   paper=paper, rps=float(rps) if rps else None)

    # ---------------------------------------------------------------- 기본 통신
    def _issue_token(self) -> str:
        r = self.session.post(
            f"{self.base}/oauth2/tokenP",
            json={"grant_type": "client_credentials",
                  "appkey": self.appkey, "appsecret": self.appsecret},
            timeout=self.timeout,
        )
        if r.status_code != 200:
            raise KISError(f"토큰 발급 실패 HTTP {r.status_code}: {r.text[:300]}")
        token = r.json().get("access_token")
        if not token:
            raise KISError(f"토큰 응답에 access_token 없음: {r.text[:300]}")
        return token

    def _throttle(self):
        wait = self.min_interval - (time.monotonic() - self._last_call)
        if wait > 0:
            time.sleep(wait)
        self._last_call = time.monotonic()

    def get(self, path: str, tr_id: str, params: dict, retries: int = 6) -> dict:
        return self.get_with_headers(path, tr_id, params, retries=retries)[0]

    def get_with_headers(self, path: str, tr_id: str, params: dict, retries: int = 6,
                         tr_cont: str = "") -> tuple[dict, dict]:
        """응답 본문과 헤더를 함께 돌려준다(연속 조회 tr_cont 확인용)."""
        headers = {
            "content-type": "application/json; charset=utf-8",
            "authorization": f"Bearer {self.token}",
            "appkey": self.appkey,
            "appsecret": self.appsecret,
            "tr_id": tr_id,
            "tr_cont": tr_cont,
            "custtype": "P",
        }
        backoff = 0.5
        last_err = ""
        for _ in range(retries):
            self._throttle()
            self.calls += 1
            try:
                r = self.session.get(f"{self.base}{path}", headers=headers,
                                     params=params, timeout=self.timeout)
            except requests.RequestException as e:
                last_err = f"네트워크 오류: {e}"
                time.sleep(backoff)
                backoff = min(backoff * 2, 8)
                continue
            body = {}
            try:
                body = r.json()
            except ValueError:
                pass
            msg_cd = str(body.get("msg_cd", ""))
            if msg_cd == "EGW00201" or r.status_code == 429:  # 유량 초과 → 속도를 낮추고 짧게 쉰 뒤 재시도
                last_err = "EGW00201 유량 제한"
                self._on_throttle()
                time.sleep(self.min_interval * 2)
                continue
            if r.status_code >= 500:
                last_err = f"HTTP {r.status_code} {msg_cd} {body.get('msg1', '')}".strip()
                time.sleep(backoff)
                backoff = min(backoff * 2, 8)
                continue
            if r.status_code != 200 or str(body.get("rt_cd", "0")) != "0":
                raise KISError(f"{tr_id} {params.get('FID_INPUT_ISCD')} 실패: "
                               f"HTTP {r.status_code} {msg_cd} {body.get('msg1', '')}".strip())
            self._on_success()
            return body, {k.lower(): v for k, v in r.headers.items()}
        raise KISError(f"{tr_id} {params.get('FID_INPUT_ISCD')} 재시도 초과: {last_err}")

    # ---------------------------------------------------------------- 시세 조회
    def daily_bars(self, code: str, start: str, end: str, adjusted: bool = True,
                   max_pages: int = 4) -> tuple[list[dict], dict]:
        """종목 일봉. start/end는 YYYYMMDD. 100건씩 과거로 페이징.
        반환: (봉 리스트 오래된 순, output1 요약)"""
        bars: dict[str, dict] = {}
        summary: dict = {}
        cursor = end
        for _ in range(max_pages):
            body = self.get(
                "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice",
                "FHKST03010100",
                {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": code,
                 "FID_INPUT_DATE_1": start, "FID_INPUT_DATE_2": cursor,
                 "FID_PERIOD_DIV_CODE": "D", "FID_ORG_ADJ_PRC": "0" if adjusted else "1"},
            )
            if not summary:
                summary = body.get("output1") or {}
            rows = [x for x in (body.get("output2") or []) if x.get("stck_bsop_date")]
            if not rows:
                break
            for x in rows:
                bars[x["stck_bsop_date"]] = x
            oldest = min(x["stck_bsop_date"] for x in rows)
            if oldest <= start or len(rows) < 100:
                break
            cursor = (datetime.strptime(oldest, "%Y%m%d") - timedelta(days=1)).strftime("%Y%m%d")
        out = []
        for d in sorted(bars):
            x = bars[d]
            try:
                out.append({
                    "date": d,
                    "open": float(x["stck_oprc"]), "high": float(x["stck_hgpr"]),
                    "low": float(x["stck_lwpr"]), "close": float(x["stck_clpr"]),
                    "volume": float(x["acml_vol"]), "value": float(x.get("acml_tr_pbmn") or 0),
                })
            except (KeyError, ValueError):
                continue
        # 거래정지일 등 0원 봉 제거
        out = [b for b in out if b["close"] > 0 and b["high"] > 0]
        return out, summary

    def index_bars(self, index_code: str, start: str, end: str, max_pages: int = 8) -> list[dict]:
        """업종지수 일봉 (0001 = 코스피 종합, 1001 = 코스닥 종합). 50건씩 페이징."""
        bars: dict[str, dict] = {}
        cursor = end
        for _ in range(max_pages):
            body = self.get(
                "/uapi/domestic-stock/v1/quotations/inquire-daily-indexchartprice",
                "FHKUP03500100",
                {"FID_COND_MRKT_DIV_CODE": "U", "FID_INPUT_ISCD": index_code,
                 "FID_INPUT_DATE_1": start, "FID_INPUT_DATE_2": cursor,
                 "FID_PERIOD_DIV_CODE": "D"},
            )
            rows = [x for x in (body.get("output2") or []) if x.get("stck_bsop_date")]
            if not rows:
                break
            for x in rows:
                bars[x["stck_bsop_date"]] = x
            oldest = min(x["stck_bsop_date"] for x in rows)
            if oldest <= start or len(rows) < 50:
                break
            cursor = (datetime.strptime(oldest, "%Y%m%d") - timedelta(days=1)).strftime("%Y%m%d")
        out = []
        for d in sorted(bars):
            x = bars[d]
            try:
                out.append({
                    "date": d,
                    "open": float(x["bstp_nmix_oprc"]), "high": float(x["bstp_nmix_hgpr"]),
                    "low": float(x["bstp_nmix_lwpr"]), "close": float(x["bstp_nmix_prpr"]),
                    "volume": float(x["acml_vol"]), "value": float(x.get("acml_tr_pbmn") or 0),
                })
            except (KeyError, ValueError):
                continue
        return [b for b in out if b["close"] > 0]

    def price_flags(self, code: str) -> dict:
        """현재가 응답의 위험 플래그. 값 체계가 필드마다 달라 원문 값을 같이 남긴다."""
        body = self.get("/uapi/domestic-stock/v1/quotations/inquire-price", "FHKST01010100",
                        {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": code})
        o = body.get("output") or {}
        keys = ["mang_issu_cls_code", "mrkt_warn_cls_code", "invt_caful_yn", "sltr_yn",
                "short_over_yn", "temp_stop_yn", "iscd_stat_cls_code", "bstp_kor_isnm",
                "hts_avls", "lstn_stcn", "per", "eps", "pbr"]
        return {k: o.get(k) for k in keys}
