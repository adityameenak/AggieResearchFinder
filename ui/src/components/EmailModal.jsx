import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useSchool, useSchoolPath } from '../SchoolContext'
import { useApp } from '../AppContext'
import { buildComposeLinks, openCompose, bodyTooLong } from '../utils/mailLinks'
import { getStudentEmail, setStudentEmail } from '../utils/studentEmail'
import { fmtDate } from '../utils/trackerStorage'

const TONES = [
  { id: 'professional', label: 'Professional' },
  { id: 'warm',         label: 'Warm' },
  { id: 'concise',      label: 'Concise' },
]

const STEP_EYEBROW = {
  draft: 'Draft Outreach Email',
  send:  'Send Email',
  sent:  'Sent',
}

function CopyIcon({ done }) {
  return done ? (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
      <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a3 3 0 0 0-.879-2.121L10.5 5.379A3 3 0 0 0 8.379 4.5H7v-1Z" />
      <path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-5.879a1.5 1.5 0 0 0-.44-1.06L9.44 6.439A1.5 1.5 0 0 0 8.378 6H4.5Z" />
    </svg>
  )
}

function PaperclipIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0 mt-0.5">
      <path fillRule="evenodd" d="M15.621 4.379a3 3 0 0 0-4.242 0l-7 7a3 3 0 0 0 4.241 4.243h.001l.497-.5a.75.75 0 0 1 1.064 1.057l-.498.501-.002.002a4.5 4.5 0 0 1-6.364-6.364l7-7a4.5 4.5 0 0 1 6.368 6.36l-3.455 3.553A2.625 2.625 0 1 1 9.52 9.52l3.45-3.451a.75.75 0 1 1 1.061 1.06l-3.45 3.451a1.125 1.125 0 0 0 1.587 1.595l3.454-3.553a3 3 0 0 0 0-4.242Z" clipRule="evenodd" />
    </svg>
  )
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 flex-shrink-0 text-emerald-600">
      <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
    </svg>
  )
}

const inputCls = `w-full text-sm text-stone-800 bg-white border border-cream-300 rounded-xl
                  px-4 py-2.5 font-sans focus:outline-none focus:ring-2
                  focus:ring-maroon-700/25 focus:border-maroon-700 transition-colors`

const labelCls = 'block text-[11px] font-semibold text-stone-400 uppercase tracking-[0.12em] mb-1.5'

// session = { parsed_profile, interests, filename } from localStorage (may be null on ProfDetail)
export default function EmailModal({ prof, session, onClose }) {
  const school = useSchool()
  const tx     = useSchoolPath()
  const { markEmailed, undoEmailed } = useApp()

  const [tone,     setTone]     = useState('professional')
  const [draft,    setDraft]    = useState(null)
  const [bodyEdit, setBodyEdit] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [copied,   setCopied]   = useState(false)

  // draft → send → sent
  const [step,         setStep]         = useState('draft')
  const [studentEmail, setStudentEmailState] = useState(() => getStudentEmail(school.code))
  const [sentInfo,     setSentInfo]     = useState(null)   // { id, previousStatus, created, viaLabel, at }
  const [undoneTo,     setUndoneTo]     = useState(null)   // status set by "Still drafting"

  useEffect(() => { generate('professional') }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function generate(selectedTone) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prof,
          parsed_profile: session?.parsed_profile ?? null,
          interests:      session?.interests ?? '',
          tone:           selectedTone,
          school_name:    school.name,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Server error ${res.status}`)
      }
      const data = await res.json()
      setDraft(data)
      setBodyEdit(data.body)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleToneChange(t) {
    if (t === tone) return
    // Regenerating replaces the body — don't silently throw away edits.
    const edited = draft && bodyEdit.trim() && bodyEdit !== draft.body
    if (edited && !window.confirm('Regenerating will discard your edits to the email body. Continue?')) return
    setTone(t)
    generate(t)
  }

  async function copy() {
    await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${bodyEdit}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleStudentEmail(value) {
    setStudentEmailState(value)
    setStudentEmail(school.code, value)
  }

  function handleOpen(link) {
    // Open first, synchronously, so popup blockers see a user gesture.
    openCompose(link.url)
    const info = markEmailed(prof, { studentEmail })
    setSentInfo({ ...info, viaLabel: link.label, at: new Date().toISOString() })
    setUndoneTo(null)
    setStep('sent')
  }

  function handleStillDrafting() {
    if (!sentInfo) return
    setUndoneTo(undoEmailed(sentInfo))
  }

  const canSend      = Boolean(draft) && !loading
  const hasRecipient = Boolean((prof.email || '').trim())
  const composeLinks = draft
    ? buildComposeLinks({
        to: prof.email, subject: draft.subject, body: bodyEdit,
        provider: school.mailProvider, studentEmail,
      })
    : []

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center
                 bg-stone-950/60 backdrop-blur-sm px-4 py-6"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-2xl bg-cream-50 rounded-2xl border border-cream-300
                      shadow-2xl shadow-stone-950/30 flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4
                        border-b border-cream-300">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-maroon-700 uppercase
                            tracking-[0.14em] mb-0.5">
              {STEP_EYEBROW[step]}
            </div>
            <h2 className="font-display font-bold text-stone-900 text-lg leading-snug truncate">
              {prof.name}
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">{prof.title || prof.department}</p>
          </div>
          <button onClick={onClose}
                  className="flex-shrink-0 p-2 rounded-xl text-stone-400 hover:text-stone-700
                             hover:bg-cream-200 transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/>
            </svg>
          </button>
        </div>

        {/* Tone selector — draft step only */}
        {step === 'draft' && (
          <div className="px-6 py-3 border-b border-cream-300 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-stone-400 font-semibold uppercase tracking-wide mr-1">Tone:</span>
            {TONES.map(t => (
              <button key={t.id} onClick={() => handleToneChange(t.id)} disabled={loading}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                        tone === t.id
                          ? 'bg-maroon-700 text-cream-100 border-maroon-700'
                          : 'border-cream-400 text-stone-600 hover:border-maroon-300 hover:text-maroon-700'
                      } disabled:opacity-40`}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-7 h-7 border-2 border-maroon-700 border-t-transparent
                              rounded-full animate-spin mb-4" />
              <p className="text-sm text-stone-400">Drafting your email…</p>
            </div>
          )}
          {error && !loading && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* ── Step 1: draft ─────────────────────────────────── */}
          {step === 'draft' && draft && !loading && (
            <>
              <div>
                <label className={labelCls}>Subject line</label>
                <div className="text-sm font-medium text-stone-800 bg-cream-100
                                border border-cream-300 rounded-xl px-4 py-2.5">
                  {draft.subject}
                </div>
              </div>
              <div>
                <label className={labelCls}>Email body — edit before sending</label>
                <textarea
                  value={bodyEdit}
                  onChange={e => setBodyEdit(e.target.value)}
                  rows={14}
                  className="w-full text-sm text-stone-800 bg-white border border-cream-300
                             rounded-xl px-4 py-3 leading-relaxed resize-y font-sans
                             focus:outline-none focus:ring-2 focus:ring-maroon-700/25
                             focus:border-maroon-700 transition-colors"
                />
              </div>
            </>
          )}

          {/* ── Step 2: send ──────────────────────────────────── */}
          {step === 'send' && draft && !loading && (
            <>
              {/* Recipient */}
              <div>
                <label className={labelCls}>To</label>
                {hasRecipient ? (
                  <div className="text-sm font-medium text-stone-800 bg-cream-100
                                  border border-cream-300 rounded-xl px-4 py-2.5">
                    {prof.email}
                  </div>
                ) : (
                  <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    No email address on file for this professor. Copy the draft and find their
                    address on{' '}
                    {prof.profile_url
                      ? <a href={prof.profile_url} target="_blank" rel="noopener noreferrer"
                           className="font-semibold underline underline-offset-2">their profile page</a>
                      : 'their department page'}.
                  </div>
                )}
              </div>

              {/* Student's school email */}
              <div>
                <label htmlFor="student-email" className={labelCls}>Your school email (optional)</label>
                <input
                  id="student-email"
                  type="email"
                  autoComplete="email"
                  value={studentEmail}
                  onChange={e => handleStudentEmail(e.target.value)}
                  placeholder={`you@${school.emailDomain || 'university.edu'}`}
                  className={inputCls}
                />
                <p className="text-[11px] text-stone-400 mt-1.5 leading-relaxed">
                  Opens Gmail in the right account when you're signed in to more than one, and is
                  recorded on your My List entry. Remembered for {school.shortName}.
                </p>
              </div>

              {/* Resume reminder */}
              <div className="flex gap-2.5 rounded-xl bg-amber-50 border border-amber-200
                              px-4 py-3 text-amber-900">
                <PaperclipIcon />
                <p className="text-sm leading-relaxed">
                  {session?.filename ? (
                    <>
                      Attach your resume: <span className="font-semibold">{session.filename}</span>.
                      Mail links can't attach files, so add it in your mail client before sending —
                      the draft tells the professor it's attached.
                    </>
                  ) : (
                    <>
                      Remember to attach your resume in your mail client before sending — the
                      draft tells the professor it's attached.
                    </>
                  )}
                </p>
              </div>

              {bodyTooLong(bodyEdit) && (
                <p className="text-[12px] text-stone-500 leading-relaxed">
                  This is a long draft. Some mail apps cut off long prefilled bodies — use
                  &ldquo;Copy draft&rdquo; as a backup and paste if anything is missing.
                </p>
              )}

              {/* Compose buttons */}
              <div className="space-y-2 pt-1">
                {composeLinks.map(link => (
                  <button
                    key={link.id}
                    onClick={() => handleOpen(link)}
                    disabled={!hasRecipient}
                    className={link.primary
                      ? `w-full flex items-center justify-center gap-2 px-5 py-3 bg-maroon-700
                         text-cream-100 text-sm font-semibold rounded-xl hover:bg-maroon-600
                         transition-colors disabled:opacity-40 disabled:cursor-not-allowed`
                      : `w-full flex items-center justify-center gap-2 px-5 py-2.5 border
                         border-cream-400 text-stone-700 text-sm font-semibold rounded-xl
                         hover:border-maroon-300 hover:text-maroon-700 hover:bg-maroon-50
                         transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {link.label}
                    <svg viewBox="0 0 12 12" fill="currentColor" className="w-2.5 h-2.5 opacity-60">
                      <path d="M3.5 3a.5.5 0 0 0 0 1H7.29L2.15 9.15a.5.5 0 1 0 .7.7L8 4.71V8.5a.5.5 0 0 0 1 0v-5a.5.5 0 0 0-.5-.5h-5Z"/>
                    </svg>
                  </button>
                ))}
                <p className="text-[11px] text-stone-400 text-center pt-1">
                  Opens a new compose window with the draft filled in. Clicking any option marks
                  this professor as <span className="font-semibold">Emailed</span> in My List.
                </p>
              </div>
            </>
          )}

          {/* ── Step 3: sent ──────────────────────────────────── */}
          {step === 'sent' && sentInfo && (
            <div className="space-y-4">
              <div className="flex gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-4">
                <CheckCircleIcon />
                <div className="text-sm text-emerald-900 leading-relaxed">
                  {undoneTo ? (
                    <>
                      Status set back to <span className="font-semibold">{undoneTo}</span>.{' '}
                      {prof.name} stays on your list — mark them Emailed from My List once you've sent it.
                    </>
                  ) : (
                    <>
                      Opened {sentInfo.viaLabel === 'Default mail app' ? 'your mail app' : sentInfo.viaLabel.replace('Open in ', '')} with
                      your draft. <span className="font-semibold">{prof.name}</span> was added to My List
                      as <span className="font-semibold">Emailed</span> ({fmtDate(sentInfo.at)}).
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-xl bg-cream-100 border border-cream-300 px-4 py-3 text-[12.5px]
                              text-stone-600 leading-relaxed">
                Didn't finish? Attach <span className="font-semibold">{session?.filename || 'your resume'}</span> and
                hit send in the compose window that opened. If nothing opened, your browser may have
                blocked the popup — try again or use &ldquo;Copy draft&rdquo;.
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleStillDrafting}
                  disabled={Boolean(undoneTo)}
                  className="px-4 py-2 text-sm font-semibold rounded-xl border border-cream-400
                             text-stone-700 hover:border-maroon-300 hover:text-maroon-700
                             hover:bg-maroon-50 transition-colors disabled:opacity-40
                             disabled:cursor-not-allowed"
                >
                  Still drafting
                </button>
                <Link
                  to={tx('/tracker')}
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-semibold rounded-xl border border-cream-400
                             text-stone-700 hover:border-maroon-300 hover:text-maroon-700
                             hover:bg-maroon-50 transition-colors"
                >
                  View My List →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-cream-300 flex items-center
                        justify-between gap-3 bg-cream-100/80">
          {step === 'draft' && (
            <>
              <p className="text-[11px] text-stone-400 leading-relaxed max-w-xs">
                Review carefully before sending. Always personalize further.
              </p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={onClose}
                        className="px-4 py-2 text-sm text-stone-500 hover:text-stone-800
                                   transition-colors font-medium">
                  Cancel
                </button>
                <button onClick={copy} disabled={!canSend}
                        className="flex items-center gap-2 px-4 py-2 border border-cream-400
                                   text-stone-700 text-sm font-semibold rounded-xl
                                   hover:border-maroon-300 hover:text-maroon-700 hover:bg-maroon-50
                                   transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  <CopyIcon done={copied} />
                  {copied ? 'Copied!' : 'Copy draft'}
                </button>
                <button onClick={() => setStep('send')} disabled={!canSend}
                        className="px-5 py-2 bg-maroon-700 text-cream-100 text-sm font-semibold
                                   rounded-xl hover:bg-maroon-600 transition-colors
                                   disabled:opacity-40 disabled:cursor-not-allowed">
                  Next: Send →
                </button>
              </div>
            </>
          )}

          {step === 'send' && (
            <>
              <button onClick={() => setStep('draft')}
                      className="px-2 py-2 text-sm text-stone-500 hover:text-stone-800
                                 transition-colors font-medium">
                ← Back to draft
              </button>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={copy} disabled={!canSend}
                        className="flex items-center gap-2 px-4 py-2 border border-cream-400
                                   text-stone-700 text-sm font-semibold rounded-xl
                                   hover:border-maroon-300 hover:text-maroon-700 hover:bg-maroon-50
                                   transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  <CopyIcon done={copied} />
                  {copied ? 'Copied!' : 'Copy draft'}
                </button>
                <button onClick={onClose}
                        className="px-4 py-2 text-sm text-stone-500 hover:text-stone-800
                                   transition-colors font-medium">
                  Cancel
                </button>
              </div>
            </>
          )}

          {step === 'sent' && (
            <>
              <button onClick={() => setStep('send')}
                      className="px-2 py-2 text-sm text-stone-500 hover:text-stone-800
                                 transition-colors font-medium">
                ← Open again
              </button>
              <button onClick={onClose}
                      className="px-5 py-2 bg-maroon-700 text-cream-100 text-sm font-semibold
                                 rounded-xl hover:bg-maroon-600 transition-colors">
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
