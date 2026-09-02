import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * In-app feedback form. Posts to /api/feedback, which files a GitHub issue.
 *
 * Deliberately does NOT call useSchool() — this renders on the Landing and
 * State pages too, which are outside SchoolProvider, and useSchool() throws
 * there. The active school is read off the <html data-school> attribute that
 * SchoolApp stamps (and clears on unmount), so "no school" is the natural
 * value on the top-level pages.
 */

const CATEGORIES = [
  { value: 'missing', label: 'Missing faculty or department' },
  { value: 'wrong',   label: 'Incorrect information' },
  { value: 'feature', label: 'Feature request' },
  { value: 'other',   label: 'Something else' },
]

const inputBase = `w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-xl
  text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2
  focus:border-transparent transition-shadow`

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-[0.09em] mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

export default function FeedbackModal({ onClose }) {
  const { pathname } = useLocation()
  const firstFieldRef = useRef(null)

  // Inside a school the maroon-* vars are repainted to that school's palette;
  // on Landing/StatePage there is no data-school, so fall back to the platform
  // indigo rather than showing TAMU maroon on an indigo page. Class strings are
  // written out in full — Tailwind's JIT can't follow interpolation.
  const [schooled] = useState(() => !!document.documentElement.dataset.school)
  const primaryBtn = schooled
    ? 'bg-maroon-700 hover:bg-maroon-600 text-cream-100'
    : 'bg-indigo-600 hover:bg-indigo-500 text-white'
  const focusRing = schooled ? 'focus:ring-maroon-300' : 'focus:ring-indigo-300'

  const [category, setCategory] = useState('missing')
  const [message,  setMessage]  = useState('')
  const [email,    setEmail]    = useState('')
  const [website,  setWebsite]  = useState('')   // honeypot — must stay empty
  const [sending,  setSending]  = useState(false)
  const [sent,     setSent]     = useState(false)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const t = setTimeout(() => firstFieldRef.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    const text = message.trim()
    if (text.length < 10) {
      setError('Please add a little more detail so we can act on it.')
      return
    }
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          category,
          email: email.trim(),
          school: document.documentElement.dataset.school || '',
          path: pathname,
          website,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Server error ${res.status}`)
      }
      setSent(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center
                 bg-stone-950/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-title"
    >
      <div
        className="w-full sm:max-w-lg max-h-[95dvh] bg-white rounded-t-2xl sm:rounded-2xl
                   shadow-2xl shadow-stone-900/25 flex flex-col overflow-hidden
                   animate-[modalSlideUp_0.22s_cubic-bezier(0.16,1,0.3,1)_forwards]"
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-stone-100">
          <div>
            <h2 id="feedback-title" className="font-display font-bold text-stone-900 text-lg leading-none">
              Send feedback
            </h2>
            <p className="text-[12px] text-stone-400 mt-1">
              Missing a department? Wrong details on a professor? Tell us.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-stone-400 hover:text-stone-700 transition-colors -mr-1 -mt-0.5"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {sent ? (
          <div className="px-5 py-10 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200
                            flex items-center justify-center mx-auto mb-4">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-emerald-600">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="font-display font-bold text-stone-900 text-lg mb-1.5">Thanks — got it</h3>
            <p className="text-sm text-stone-500 max-w-xs mx-auto leading-relaxed mb-6">
              Your note went straight to our issue tracker. It genuinely shapes what we build next.
            </p>
            <button
              onClick={onClose}
              className={`px-5 py-2 text-sm font-semibold rounded-xl
                          transition-colors ${primaryBtn}`}
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
              <Field label="What kind of feedback?">
                <select
                  ref={firstFieldRef}
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className={`${inputBase} ${focusRing}`}
                >
                  {CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Your feedback" required>
                <textarea
                  value={message}
                  onChange={e => { setMessage(e.target.value); setError(null) }}
                  rows={5}
                  maxLength={4000}
                  placeholder="e.g. the medical and public health listings are thin — I'm pre-med and can't find labs in my area."
                  className={`${inputBase} ${focusRing} resize-none ${error ? 'border-red-300 ring-red-200' : ''}`}
                />
                {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
              </Field>

              <Field label="Email (optional)">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Only if you'd like a reply"
                  className={`${inputBase} ${focusRing}`}
                />
              </Field>

              {/* Honeypot — hidden from people, tempting to bots. */}
              <input
                type="text"
                name="website"
                value={website}
                onChange={e => setWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
              />

              <p className="text-[11px] text-stone-400 leading-relaxed">
                Heads up: feedback is filed as a public issue on our GitHub repo, so
                please don't include anything private. Your email, if you leave one,
                is posted there too.
              </p>
            </div>

            <div className="px-5 py-4 border-t border-stone-100 bg-stone-50/80
                            flex items-center justify-end gap-3 sticky bottom-0">
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-stone-500 hover:text-stone-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending}
                className={`px-5 py-2 text-sm font-semibold rounded-xl transition-colors
                            disabled:opacity-40 disabled:cursor-not-allowed ${primaryBtn}`}
              >
                {sending ? 'Sending…' : 'Send feedback'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
