"""종목 유니버스 — 한국투자증권 종목 마스터파일(kospi_code.mst / kosdaq_code.mst).

마스터파일은 cp949 고정폭 텍스트다. 앞부분 = 단축코드(9) + 표준코드(12) + 한글명,
뒷부분 = 고정 길이 속성 영역(코스피 228자로 확인. 코스닥 길이는 확인하지 못함).
속성 영역 전체 폭을 하드코딩하지 않고, 속성 영역 첫 2자가 그룹코드(ST=주권 등)라는 점을
이용해 파일마다 꼬리 길이를 자동 판별한다. 관리종목·시장경고 같은 위험 플래그는
여기서 읽지 않고 최종 후보만 현재가 API(price_flags)로 재확인한다.
"""
from __future__ import annotations

import io
import re
import zipfile

import requests

MASTER_URLS = {
    "KOSPI": "https://new.real.download.dws.co.kr/common/master/kospi_code.mst.zip",
    "KOSDAQ": "https://new.real.download.dws.co.kr/common/master/kosdaq_code.mst.zip",
}
TAIL_CANDIDATES = range(200, 260)
GROUP_RE = re.compile(r"^[A-Z]{2}$")


def _download(url: str) -> list[str]:
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        name = z.namelist()[0]
        raw = z.read(name)
    return [ln for ln in raw.decode("cp949", errors="replace").splitlines() if ln.strip()]


def detect_tail_length(lines: list[str]) -> int:
    """'ST' 그룹코드가 가장 많이 나오는 꼬리 길이를 고른다. 90% 이상이 영문 2자 그룹코드여야 통과."""
    sample = lines[:: max(1, len(lines) // 400)][:400]
    best_n, best_score, best_st = 0, 0.0, 0.0
    for n in TAIL_CANDIDATES:
        groups = [ln[-n:][:2] for ln in sample if len(ln) > n + 21]
        if not groups:
            continue
        valid = sum(bool(GROUP_RE.match(g)) for g in groups) / len(groups)
        st = sum(g == "ST" for g in groups) / len(groups)
        if valid >= 0.9 and st > best_st:
            best_n, best_score, best_st = n, valid, st
    if not best_n:
        raise RuntimeError("마스터파일 형식 판별 실패 — 파일 구조가 바뀌었을 수 있습니다.")
    return best_n


def parse_master(lines: list[str], market: str) -> list[dict]:
    tail = detect_tail_length(lines)
    rows = []
    for ln in lines:
        if len(ln) <= tail + 21:
            continue
        head, attr = ln[:-tail], ln[-tail:]
        code = head[0:9].strip()
        name = head[21:].strip()
        rows.append({"code": code, "name": name, "market": market, "group": attr[:2]})
    return rows


def is_common_stock(row: dict) -> bool:
    """보통주 주권만 남긴다: 그룹코드 ST, 6자리 숫자 코드, 끝자리 0(우선주는 5·7·9 등), 스팩·리츠 제외."""
    code, name = row["code"], row["name"]
    if row["group"] != "ST":
        return False
    if not (len(code) == 6 and code.isdigit() and code.endswith("0")):
        return False
    if "스팩" in name or "기업인수목적" in name or name.endswith("리츠"):
        return False
    return True


def load_universe() -> list[dict]:
    out = []
    for market, url in MASTER_URLS.items():
        rows = parse_master(_download(url), market)
        out.extend(r for r in rows if is_common_stock(r))
    if len(out) < 1500:  # 코스피+코스닥 보통주는 2,000종목을 넘는다. 너무 적으면 파싱 이상
        raise RuntimeError(f"유니버스 {len(out)}종목 — 비정상적으로 적습니다. 마스터파일 확인 필요.")
    return out
