// Memory: gaps, flashcards and past sessions, kept in one JSON file on the laptop.
// A JSON file instead of SQLite: no native modules, so it installs the same way on macOS
// and Windows. The data is small.
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createEmptyCard, fsrs, type Card, type Grade } from 'ts-fsrs'
import type {
  CardRating,
  CardView,
  Gap,
  GapRecord,
  InputKind,
  MemoryView,
  Subject,
  TurnKind
} from '../../shared/contracts'

export interface SessionRecord {
  id: string
  startedAt: string
  endedAt: string
  subject: Subject
  title: string
  attempts: number
  hintsUsed: number
  solved: boolean
  revealed: boolean
  gaps: Gap[]
  /** The help log: what was said, for the student (or a teacher) to look back on. */
  turns: { role: 'tutor' | 'student'; text: string; kind?: TurnKind; hintLevel?: number; as?: InputKind }[]
}

interface CardRecord {
  id: string
  subject: Subject
  topic: string
  front: string
  back: string
  createdAt: string
  fsrs: Card
}

interface MemoryData {
  version: 1
  gaps: GapRecord[]
  cards: CardRecord[]
  sessions: SessionRecord[]
}

const scheduler = fsrs()

export function topicKey(topic: string): string {
  return topic.toLowerCase().replace(/\s+/g, ' ').trim()
}

export class MemoryStore {
  private data: MemoryData = { version: 1, gaps: [], cards: [], sessions: [] }

  constructor(private readonly file: string | null) {
    this.load()
  }

  private load(): void {
    if (!this.file) return
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as MemoryData
      if (raw.version !== 1) return
      raw.cards = raw.cards.map((c) => ({ ...c, fsrs: reviveCard(c.fsrs) }))
      this.data = raw
    } catch {
      // No file yet (first run) or unreadable: start fresh.
    }
  }

  private save(): void {
    if (!this.file) return
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data, null, 2))
    renameSync(tmp, this.file) // atomic: a crash mid-write never corrupts the file
  }

  recordGap(subject: Subject, gap: Gap, now = new Date()): GapRecord {
    const key = topicKey(gap.topic)
    let rec = this.data.gaps.find((g) => g.subject === subject && g.type === gap.type && topicKey(g.topic) === key)
    if (rec) {
      rec.timesSeen++
      rec.lastSeen = now.toISOString()
    } else {
      rec = {
        id: randomUUID(),
        subject,
        type: gap.type,
        topic: gap.topic.trim(),
        timesSeen: 1,
        firstSeen: now.toISOString(),
        lastSeen: now.toISOString()
      }
      this.data.gaps.push(rec)
    }
    this.save()
    return rec
  }

  /** One line for the tutor: the student's repeat gaps, so it can ask them to guess first. */
  historySummary(limit = 8): string | undefined {
    const repeats = [...this.data.gaps]
      .filter((g) => g.timesSeen >= 2)
      .sort((a, b) => b.timesSeen - a.timesSeen)
      .slice(0, limit)
    if (repeats.length === 0) return undefined
    return repeats.map((g) => `${g.topic} (${g.type}, ${g.timesSeen}x)`).join('; ')
  }

  addCards(subject: Subject, topic: string, cards: { front: string; back: string }[], now = new Date()): number {
    let added = 0
    for (const c of cards) {
      if (this.data.cards.some((x) => x.front.trim() === c.front.trim())) continue
      this.data.cards.push({
        id: randomUUID(),
        subject,
        topic,
        front: c.front,
        back: c.back,
        createdAt: now.toISOString(),
        fsrs: createEmptyCard(now)
      })
      added++
    }
    if (added) this.save()
    return added
  }

  rate(cardId: string, rating: CardRating, now = new Date()): void {
    const card = this.data.cards.find((c) => c.id === cardId)
    if (!card) return
    card.fsrs = scheduler.next(card.fsrs, now, rating as Grade).card
    this.save()
  }

  addSession(rec: SessionRecord): void {
    this.data.sessions.push(rec)
    this.save()
  }

  view(now = new Date()): MemoryView {
    const due: CardView[] = this.data.cards
      .filter((c) => c.fsrs.due.getTime() <= now.getTime())
      .sort((a, b) => a.fsrs.due.getTime() - b.fsrs.due.getTime())
      .map((c) => ({ id: c.id, subject: c.subject, topic: c.topic, front: c.front, back: c.back, due: c.fsrs.due.toISOString() }))
    return {
      gaps: [...this.data.gaps].sort((a, b) => b.timesSeen - a.timesSeen || b.lastSeen.localeCompare(a.lastSeen)),
      dueCards: due,
      totalCards: this.data.cards.length,
      sessions: this.data.sessions.length
    }
  }
}

function reviveCard(c: Card): Card {
  return {
    ...c,
    due: new Date(c.due),
    last_review: c.last_review ? new Date(c.last_review) : undefined
  }
}
