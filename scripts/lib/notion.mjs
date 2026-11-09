import { markdownToBlocks } from '@tryfabric/martian'

const API = 'https://api.notion.com/v1'
const VERSION = '2022-06-28'

async function notion(path, method, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Notion ${method} ${path} 실패 (${res.status}): ${data.message}`)
  return data
}

const rt = (text) => [{ type: 'text', text: { content: String(text ?? '').slice(0, 1990) } }]
const plain = (prop) => (prop?.rich_text || prop?.title || []).map(t => t.plain_text).join('')

/** 구분(모닝 브리핑/장 마감)별 최근 기록 조회 */
export async function recentEntries(kind, limit = 5) {
  const data = await notion(`/databases/${process.env.NOTION_DATABASE_ID}/query`, 'POST', {
    filter: { property: '구분', select: { equals: kind } },
    sorts: [{ property: '날짜', direction: 'descending' }],
    page_size: limit,
  })
  return data.results.map(p => ({
    id: p.id,
    url: p.url,
    date: p.properties['날짜']?.date?.start,
    summary: plain(p.properties['한줄요약']),
    memory: plain(p.properties['메모리']),
  }))
}

/** 리포트 페이지 생성 (Markdown → Notion 블록, 100개 단위 분할 업로드) */
export async function createReportPage({ title, date, kind, summary, memory, cost, markdown }) {
  const blocks = markdownToBlocks(markdown, { notionLimits: { truncate: true } })
  const page = await notion('/pages', 'POST', {
    parent: { database_id: process.env.NOTION_DATABASE_ID },
    properties: {
      '제목': { title: rt(title) },
      '날짜': { date: { start: date } },
      '구분': { select: { name: kind } },
      '한줄요약': { rich_text: rt(summary) },
      '메모리': { rich_text: rt(memory) },
      '비용USD': { number: Math.round(cost * 100) / 100 },
    },
    children: blocks.slice(0, 100),
  })
  for (let i = 100; i < blocks.length; i += 100) {
    await notion(`/blocks/${page.id}/children`, 'PATCH', { children: blocks.slice(i, i + 100) })
  }
  return { id: page.id, url: page.url }
}
