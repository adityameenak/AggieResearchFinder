import { useState, useEffect } from 'react'
import { apiPost } from '../utils/api'

const TONES = [
  { id: 'professional', label: 'Professional' },
  { id: 'warm',         label: 'Warm' },
  { id: 'concise',      label: 'Concise' },
]

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

export default function EmailModal({ prof, sessionId, interests, onClose }) {
  const [tone,    setTone]    = useState('professional')
  const [draft,   setDraft]   = useState(null)   // { subject, body }
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [copied,  setCopied]  = useState(false)
  const [bodyEdit, setBodyEdit] = useState('')

  // Generate on mount with default tone
  useEffect(() => {
    generate('professional')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function generate(selectedTone) {
    setLoading(true)
    setError(null)
    try {
      const res = await apiPost('/email/draft', {
        faculty_id: prof.id,
        tone: selectedTone,
        session_id: sessionId || null,
        interests: interests || '',
      })
      setDraft(res)
      setBodyEdit(res.body)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleToneChange(t) {
    setTone(t)
    generate(t)
  }

  async function copy() {
    const text = `Subject: ${draft.subject}\n\n${bodyEdit}`
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center
                 bg-stone-950/60 backdrop-blur-sm px-4 py-6"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-2xl bg-cream-50 rounded-2xl border border-cream-300
                   shadow-2xl shadow-stone-950/30 flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4
                        border-b border-cream-300">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-maroon-700 uppercase
                            tracking-[0.14em] mb-0.5">
              Draft Outreach Email
            </div>
            <h2 className="font-display font-bold text-stone-900 text-lg leading-snug truncate">
              {prof.name}
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">{prof.title || prof.department}</p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-2 rounded-xl text-stone-400 hover:text-stone-700
                       hover:bg-cream-200 transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Tone selector */}
        <div className="px-6 py-3 border-b border-cream-300 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-stone-400 font-semibold uppercase tracking-wide mr-1">
            Tone:
          </span>
          {TONES.map(t => (
            <button
              key={t.id}
              onClick={() => handleToneChange(t.id)}
              disabled={loading}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                tone === t.id
                  ? 'bg-maroon-700 text-cream-100 border-maroon-700'
                  : 'border-cream-400 text-stone-600 hover:border-maroon-300 hover:text-maroon-700'
              } disabled:opacity-40`}
            >
              {t.label}
            </button>
          ))}
        </div>

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

          {draft && !loading && (
            <>
              {/* Subject */}
              <div>
                <label className="block text-[11px] font-semibold text-stone-400
                                   uppercase tracking-[0.12em] mb-1.5">
                  Subject line
                </label>
                <div className="text-sm font-medium text-stone-800 bg-cream-100
                                border border-cream-300 rounded-xl px-4 py-2.5">
                  {draft.subject}
                </div>
              </div>

              {/* Body — editable */}
              <div>
                <label className="block text-[11px] font-semibold text-stone-400
                                   uppercase tracking-[0.12em] mb-1.5">
                  Email body — edit before sending
                </label>
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
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-cream-300 flex items-center
                        justify-between gap-3 bg-cream-100/80">
          <p className="text-[11px] text-stone-400 leading-relaxed max-w-xs">
            Review carefully before sending. This is a draft — always personalize further.
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-stone-500 hover:text-stone-800
                         transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={copy}
              disabled={!draft || loading}
              className="flex items-center gap-2 px-5 py-2 bg-maroon-700 text-cream-100
                         text-sm font-semibold rounded-xl hover:bg-maroon-600
                         transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CopyIcon done={copied} />
              {copied ? 'Copied!' : 'Copy draft'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
