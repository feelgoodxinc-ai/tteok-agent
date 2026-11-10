// 오늘(KST)이 한국거래소 개장일인지 출력: "2026-11-10 true"
import { todayKST, isKrxTradingDay } from './lib/calendar.mjs'

const date = todayKST()
console.log(`${date} ${isKrxTradingDay(date)}`)
