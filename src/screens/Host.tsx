/**
 * /live/host — the host's side.
 *
 *   /live/host                          the library: decks (shared by everyone with the admin key), templates, sessions
 *   /live/host?deck=<id>                the editor, with a live preview
 *   /live/host?code=<CODE>              the presenter: the screen you share
 *   /live/host?code=<CODE>&view=console the console: notes, next slide, held answers, controls. Open it in a second
 *                                       window or on your phone (its QR hands over the host key in the URL's #hash)
 *   /live/host?report=<CODE>            the report after a session
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { KIND_LABEL, TEMPLATES, cleanDeck, uid, type Deck } from '../lib/deck'
import { BRAND, BrandMark } from '../brand'
import { joinHost, live, readJson, writeJson } from '../lib/api'
import { Console } from './Console'
import { Editor } from './Editor'
import { HOST_NAME, THEME, hostings, rememberHosting, useLibrary, type Hosting, type Saved } from '../lib/hostStore'
import { Presenter } from './Presenter'
import { Report } from './Report'

function useRoute() {
  const read = () => new URLSearchParams(location.search)
  const [q, setQ] = useState(read)
  useEffect(() => {
    const on = () => setQ(read())
    addEventListener('popstate', on)
    return () => removeEventListener('popstate', on)
  }, [])
  const go = useCallback((search: string) => {
    history.pushState(null, '', `/live/host${search}`)
    setQ(read())
    scrollTo(0, 0)
  }, [])
  return { deck: q.get('deck'), code: q.get('code'), view: q.get('view'), report: q.get('report'), go }
}

function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (readJson<string>(THEME, 'dark') === 'light' ? 'light' : 'dark'))
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-sds-theme', theme)
    document.documentElement.classList.toggle('dark', theme === 'dark')
    writeJson(THEME, theme)
  }, [theme])
  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }
}

/** A console opened from its QR carries the host key in the hash (#k=…): keep it in this browser, then drop it from the URL. */
function adoptHandover(code: string | null) {
  const k = new URLSearchParams(location.hash.slice(1)).get('k')
  if (!code || !k || !/^[0-9a-f]{48}$/.test(k)) return
  if (!hostings().some((h) => h.code === code)) {
    rememberHosting({ code, token: k, title: 'Live session', at: Date.now() })
    // The link carries only the code and the host key, so the card starts as "Live session". The session's public
    // state has the deck's title; keep the placeholder if that one call fails.
    live
      .state(code)
      .then((s) => {
        const saved = hostings().find((h) => h.code === code)
        if (s.title && saved && saved.title === 'Live session') rememberHosting({ ...saved, title: s.title })
      })
      .catch(() => {})
  }
  history.replaceState(null, '', location.pathname + location.search)
}

function NoKey({ code, go }: { code: string; go: (s: string) => void }) {
  return (
    <div className="lv lv-host">
      <div className="lv-library">
        <div className="lv-error">This browser does not hold the host key for {code}. Present from the browser that started the session, or scan the console QR code from it.</div>
        <button className="lv-btn" style={{ justifySelf: 'start' }} onClick={() => go('')}>
          Back to the library
        </button>
      </div>
    </div>
  )
}

export function Host() {
  const route = useRoute()
  adoptHandover(route.code)
  const theme = useTheme()
  const library = useLibrary()
  const [notice, setNotice] = useState('')
  const themeBtn = (
    <button className="lv-btn is-quiet is-small" onClick={theme.toggle} aria-label="Switch light and dark">
      {theme.theme === 'dark' ? 'Light' : 'Dark'}
    </button>
  )

  if (route.report) {
    const h = hostings().find((x) => x.code === route.report)
    return h ? <Report hosting={h} onBack={() => route.go('')} themeBtn={themeBtn} /> : <NoKey code={route.report} go={route.go} />
  }
  if (route.code) {
    const h = hostings().find((x) => x.code === route.code)
    if (!h) return <NoKey code={route.code} go={route.go} />
    if (route.view === 'console') return <Console hosting={h} themeBtn={themeBtn} />
    return <Presenter hosting={h} onExit={() => route.go('')} onReport={() => route.go(`?report=${h.code}`)} themeBtn={themeBtn} />
  }

  const editing = route.deck ? library.decks.find((d) => d.id === route.deck) : undefined
  if (editing)
    return (
      <Editor
        key={editing.id}
        saved={editing}
        themeBtn={themeBtn}
        shared={library.status === 'shared'}
        onSave={(deck) => library.update(editing.id, deck)}
        onBack={() => route.go('')}
        onLive={(h: Hosting) => {
          rememberHosting(h)
          route.go(`?code=${h.code}`)
        }}
      />
    )

  const create = (deck: Deck) => {
    const id = uid()
    library.add({ id, deck, updated: Date.now(), by: readJson<string>(HOST_NAME, '') })
    route.go(`?deck=${id}`)
  }
  return (
    <div className="lv lv-host">
      <header className="lv-hostbar">
        <div className="lv-brand">
          <BrandMark />
          <span>{BRAND.name} · Host</span>
        </div>
        <div className="lv-hostbar-actions">
          <ImportButton onDeck={create} onError={setNotice} />
          {themeBtn}
        </div>
      </header>
      <main className="lv-library">
        {notice && (
          <div className="lv-error lv-notice" role="alert">
            {notice}
            <button className="lv-btn is-small is-quiet" onClick={() => setNotice('')}>
              Dismiss
            </button>
          </div>
        )}
        <div style={{ display: 'grid', gap: 12 }}>
          <div className="lv-eyebrow">Polls, word clouds, quizzes and Q&amp;A for live sessions</div>
          <h1 className="lv-title">Make the room talk back.</h1>
          <p className="lv-serif lv-muted" style={{ margin: 0, fontSize: 17, maxWidth: '60ch', lineHeight: 1.5 }}>
            Build a deck, go live, share the presenter. People join on their phone at {joinHost()} with the code in the corner. Run it from the console on a second screen or your
            phone.
          </p>
        </div>

        <Sessions go={route.go} />

        <section className="lv-section">
          <div className="lv-sectionhead">
            <div className="lv-eyebrow">Decks</div>
            <LibraryStatus library={library} />
          </div>
          {library.decks.length === 0 ? (
            <p className="lv-muted" style={{ margin: 0 }}>
              None yet. Start from a template below.
            </p>
          ) : (
            <div className="lv-grid">
              {library.decks.map((d) => (
                <DeckTile
                  key={d.id}
                  saved={d}
                  onOpen={() => route.go(`?deck=${d.id}`)}
                  onDuplicate={() => create(structuredClone({ ...d.deck, title: `${d.deck.title} (copy)` }))}
                  onDelete={() => library.remove(d.id)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="lv-section">
          <div className="lv-sectionhead">
            <div className="lv-eyebrow">Start from a template</div>
          </div>
          <div className="lv-grid">
            {TEMPLATES.map((t) => (
              <Tile key={t.id} meta={slideCount(t.deck().slides.length)} title={t.name} go="Use template" onGo={() => create(t.deck())}>
                <p>{t.blurb}</p>
              </Tile>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

const slideCount = (n: number) => `${n} ${n === 1 ? 'slide' : 'slides'}`

/**
 * One card for sessions, decks and templates. The whole card is its main action (the go button's ::after covers it);
 * the quieter actions sit on the same line at the right of the foot, so the buttons never wrap into rows.
 */
function Tile({
  meta,
  title,
  go,
  onGo,
  more,
  foot,
  children,
}: {
  meta: string
  title: string
  go: string
  onGo: () => void
  more?: ReactNode
  foot?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="lv-tile">
      <div className="lv-tile-body">
        <span className="lv-tile-meta">{meta}</span>
        <h2>{title}</h2>
        {children}
      </div>
      <div className="lv-tile-foot">
        {foot ?? (
          <>
            <button className="lv-tile-go" onClick={onGo}>
              {go}
              <span className="lv-tile-arrow" aria-hidden>
                →
              </span>
            </button>
            {more && <div className="lv-tile-more">{more}</div>}
          </>
        )}
      </div>
    </div>
  )
}

/** The sessions this browser hosts, newest first: one row of them, the rest behind "Show all". */
function Sessions({ go }: { go: (s: string) => void }) {
  const [all, setAll] = useState(false)
  const sessions = hostings()
  if (sessions.length === 0) return null
  const ROW = 4
  return (
    <section className="lv-section">
      <div className="lv-sectionhead">
        <div className="lv-eyebrow">Your sessions</div>
        {sessions.length > ROW && (
          <button className="lv-btn is-small is-quiet" onClick={() => setAll(!all)}>
            {all ? 'Show fewer' : `Show all ${sessions.length}`}
          </button>
        )}
      </div>
      <div className="lv-grid">
        {(all ? sessions : sessions.slice(0, ROW)).map((h) => (
          <Tile
            key={h.code}
            meta={new Date(h.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            title={h.title}
            go="Present"
            onGo={() => go(`?code=${h.code}`)}
            more={<button onClick={() => go(`?report=${h.code}`)}>Report</button>}
          >
            <span className="lv-tile-code">{h.code}</span>
          </Tile>
        ))}
      </div>
    </section>
  )
}

/** A saved deck. Delete asks on the card itself, not in a browser dialog. */
function DeckTile({ saved, onOpen, onDuplicate, onDelete }: { saved: Saved; onOpen: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const [asking, setAsking] = useState(false)
  useEffect(() => {
    if (!asking) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAsking(false)
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [asking])
  const { deck } = saved
  const kinds = deck.slides.map((s) => KIND_LABEL[s.kind]).join(' · ')
  const chips = [deck.settings?.paced && 'Self-paced', deck.settings?.hold && 'Word filter'].filter(Boolean)
  return (
    <Tile
      meta={[slideCount(deck.slides.length), new Date(saved.updated).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), saved.by].filter(Boolean).join(' · ')}
      title={deck.title}
      go="Open"
      onGo={onOpen}
      more={
        <>
          <button onClick={onDuplicate}>Duplicate</button>
          <button onClick={() => setAsking(true)}>Delete</button>
        </>
      }
      foot={
        asking ? (
          // The confirm sits on the left, away from where Delete was, so a double click lands on Keep.
          <div className="lv-tile-more lv-tile-ask">
            <button className="is-strong" onClick={onDelete}>
              Delete for good
            </button>
            <button autoFocus onClick={() => setAsking(false)}>
              Keep
            </button>
          </div>
        ) : undefined
      }
    >
      <p className="lv-tile-kinds" title={kinds}>
        {kinds}
      </p>
      {chips.length > 0 && (
        <div className="lv-chips">
          {chips.map((c) => (
            <span key={c as string}>{c}</span>
          ))}
        </div>
      )}
    </Tile>
  )
}

/** Where the decks live. One quiet line; the key field opens only when asked for. */
function LibraryStatus({ library }: { library: ReturnType<typeof useLibrary> }) {
  const [key, setKey] = useState('')
  const [open, setOpen] = useState(false)
  const [tried, setTried] = useState(false)
  const [name, setName] = useState(() => readJson<string>(HOST_NAME, ''))
  if (library.status === 'shared')
    return (
      <div className="lv-libstatus">
        <span className="lv-dot is-on" aria-hidden />
        Shared library · saving as
        <input
          className="lv-input"
          placeholder="Your name"
          aria-label="Your name, shown on decks you save"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            writeJson(HOST_NAME, e.target.value.slice(0, 40))
          }}
        />
      </div>
    )
  if (library.status === 'loading') return <div className="lv-libstatus">Connecting…</div>
  if (library.status === 'local') return <div className="lv-libstatus">This browser only · the shared library is not reachable</div>
  if (!open)
    return (
      <div className="lv-libstatus">
        This browser only
        <button className="lv-btn is-small" onClick={() => setOpen(true)}>
          Connect shared library
        </button>
      </div>
    )
  return (
    <form
      className="lv-libstatus"
      onSubmit={(e) => {
        e.preventDefault()
        if (!key.trim()) return
        setTried(true)
        library.setKey(key.trim())
      }}
    >
      {tried && <span className="lv-libstatus-error">That key did not work.</span>}
      <input className="lv-input" type="password" placeholder="Admin key" aria-label="Admin key" autoFocus value={key} onChange={(e) => setKey(e.target.value)} />
      <button className="lv-btn is-small is-ink" disabled={!key.trim()}>
        Connect
      </button>
      <button
        type="button"
        className="lv-btn is-small is-quiet"
        onClick={() => {
          setOpen(false)
          setTried(false)
        }}
      >
        Cancel
      </button>
    </form>
  )
}

function ImportButton({ onDeck, onError }: { onDeck: (d: Deck) => void; onError: (message: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <>
      <button className="lv-btn is-small is-quiet" onClick={() => ref.current?.click()}>
        Import JSON
      </button>
      <input
        ref={ref}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          try {
            const raw = JSON.parse(await f.text()) as unknown
            const deck = cleanDeck((raw as { deck?: unknown })?.deck ?? raw)
            if (!deck) throw new Error()
            onError('')
            onDeck(deck)
          } catch {
            onError(`${f.name} is not a deck file.`)
          }
        }}
      />
    </>
  )
}
