import { readFileSync } from 'node:fs'

const holidays = JSON.parse(readFileSync(new URL('../krx-holidays.json', import.meta.url), 'utf8'))

export function todayKST() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
}

/** 한국거래소 개장일 여부 (주말 + scripts/krx-holidays.json) */
export function isKrxTradingDay(date) {
  const day = new Date(`${date}T12:00:00+09:00`).getUTCDay()
  if (day === 0 || day === 6) return false
  return !Object.entries(holidays)
    .filter(([k]) => !k.startsWith('_'))
    .some(([, list]) => list.some(h => h.date === date))
}
