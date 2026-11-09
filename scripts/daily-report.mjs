/**
 * 투자전략 팀 자동 리포트
 *   node scripts/daily-report.mjs morning   # 08:00 모닝 브리핑
 *   node scripts/daily-report.mjs close     # 16:00 장 마감 분석
 * 옵션: --force (휴장일에도 실행), --dry-run (노션·카톡 전송 없이 콘솔 출력)
 */
import { runMorning, summarizeMemory } from '../src/lib/morningTeam.js'
import { runTeam } from '../src/lib/investTeam.js'
import { estimateCost, addUsage } from '../src/lib/claudeClient.js'
import { todayKST, isKrxTradingDay } from './lib/calendar.mjs'
import { recentEntries, createReportPage } from './lib/notion.mjs'
import { sendToMe } from './lib/kakao.mjs'

const mode = process.argv[2]
const force = process.argv.includes('--force')
const dryRun = process.argv.includes('--dry-run')
const KIND = { morning: '모닝 브리핑', close: '장 마감' }

if (!KIND[mode]) {
  console.error('사용법: node scripts/daily-report.mjs <morning|close> [--force] [--dry-run]')
  process.exit(1)
}

function requireEnv(names) {
  const missing = names.filter(n => !process.env[n])
  if (missing.length) throw new Error(`환경변수 누락: ${missing.join(', ')}`)
}

function loadProfile() {
  // GitHub Actions Variables의 INVEST_PROFILE(JSON)로 투자자 프로필 설정
  const defaults = { market: 'KR', risk: '중립', horizon: '스윙(수주~수개월)', holdings: '', watchlist: '', memo: '' }
  try { return { ...defaults, ...JSON.parse(process.env.INVEST_PROFILE || '{}') } } catch { return defaults }
}

const extractSummary = (md) =>
  (md.match(/^>\s*(.+)$/m)?.[1] || md.split('\n').find(l => l.trim() && !l.startsWith('#')) || '').replace(/\*\*/g, '').trim()

function appendix(result) {
  const parts = ['\n\n---\n\n# 부록: 팀 보고서']
  result.analysts.filter(a => a.status === 'done').forEach(a => parts.push(`\n\n## ${a.name}\n\n${a.text}`))
  if (result.risk) parts.push(`\n\n## 리스크 매니저\n\n${result.risk}`)
  if (result.sources?.length) {
    parts.push('\n\n## 출처\n\n' + result.sources.slice(0, 60).map(s => `- [${(s.title || s.url).replace(/[[\]]/g, '')}](${s.url})`).join('\n'))
  }
  return parts.join('')
}

const log = (id, patch) => patch.status && console.log(`  [${id}] ${patch.status}`)

async function main() {
  const date = todayKST()
  if (!force && !isKrxTradingDay(date)) {
    console.log(`${date}: 한국거래소 휴장일 — 건너뜀`)
    return
  }
  requireEnv(['ANTHROPIC_API_KEY', ...(dryRun ? [] : ['NOTION_TOKEN', 'NOTION_DATABASE_ID', 'KAKAO_REST_API_KEY', 'KAKAO_REFRESH_TOKEN'])])

  const profile = loadProfile()
  console.log(`${date} ${KIND[mode]} 시작`)

  let result
  if (mode === 'morning') {
    const [mornings, closes] = dryRun ? [[], []] : await Promise.all([recentEntries('모닝 브리핑', 5), recentEntries('장 마감', 1)])
    const recentNews = mornings.filter(m => m.date !== date).map(m => `(${m.date})\n${m.memory}`).join('\n')
    const prevClose = closes.find(c => c.date < date)
    result = await runMorning(
      { ...profile, date, recentNews, previousReport: prevClose ? { date: prevClose.date, text: prevClose.memory } : null },
      log,
    )
  } else {
    const [closes, mornings] = dryRun ? [[], []] : await Promise.all([recentEntries('장 마감', 1), recentEntries('모닝 브리핑', 1)])
    const prevClose = closes.find(c => c.date < date)
    const todayMorning = mornings.find(m => m.date === date)
    const prevText = [
      prevClose ? `[전일 장 마감 기록]\n${prevClose.memory}` : '',
      todayMorning ? `[오늘 아침 모닝 브리핑 예상 — 적중 여부도 복기할 것]\n${todayMorning.memory}` : '',
    ].filter(Boolean).join('\n\n')
    result = await runTeam(
      { ...profile, date, previousReport: prevText ? { date: prevClose?.date || date, text: prevText } : null },
      log,
    )
  }

  const memory = await summarizeMemory(mode, result.cio)
  const usage = addUsage(result.usage, memory.usage)
  const cost = estimateCost(usage)
  const summary = extractSummary(result.cio)
  const markdown = result.cio + appendix(result)
  console.log(`완료 — 웹 검색 ${usage.searches}회, 추정 비용 $${cost.toFixed(2)}`)

  if (dryRun) {
    console.log('\n' + markdown + '\n\n[메모리]\n' + memory.text)
    return
  }

  const page = await createReportPage({
    title: `${date} ${KIND[mode]}`,
    date,
    kind: KIND[mode],
    summary,
    memory: memory.text,
    cost,
    markdown,
  })
  console.log(`노션 업데이트: ${page.url}`)

  const icon = mode === 'morning' ? '🌅' : '🌆'
  await sendToMe(`${icon} ${date.slice(5).replace('-', '/')} ${KIND[mode]}\n\n${summary}`, page.url)
  console.log('카카오톡 알림 전송 완료')
}

main().catch(async (e) => {
  console.error('실패:', e.message)
  // 실패도 카톡으로 알림 (카카오 설정이 살아있는 경우)
  if (!dryRun && process.env.KAKAO_REFRESH_TOKEN) {
    try {
      const run = process.env.GITHUB_RUN_ID
        ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : 'https://github.com'
      await sendToMe(`⚠️ ${KIND[mode]} 생성 실패\n${e.message}`, run)
    } catch { /* 알림 실패는 무시 */ }
  }
  process.exit(1)
})
