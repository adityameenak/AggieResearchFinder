import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

const INTEREST_CHIPS = [
  'machine learning', 'battery materials', 'semiconductors',
  'carbon capture', 'robotics', 'drug delivery',
  'computational biology', 'nanotechnology', 'fluid dynamics',
  'renewable energy', 'materials synthesis', 'biomedical devices',
]

const STEPS = [
  'Reading file…',
  'Extracting text…',
  'Parsing resume…',
  'Ready!',
]

/* ── File → base64 helper ──────────────────────────────────── */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/* ── Upload zone ───────────────────────────────────────────── */
function UploadZone({ file, onFile }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !file && inputRef.current?.click()}
      className={`relative rounded-2xl border-2 border-dashed transition-all duration-200
                  flex flex-col items-center justify-center text-center py-12 px-8
                  ${file
                    ? 'border-maroon-400 bg-maroon-50 cursor-default'
                    : dragging
                      ? 'border-maroon-600 bg-maroon-50 scale-[1.01] cursor-copy'
                      : 'border-cream-400 bg-cream-50 hover:border-maroon-400 hover:bg-maroon-50/40 cursor-pointer'
                  }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.doc"
        className="sr-only"
        onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
      />

      {file ? (
        <>
          <div className="w-12 h-12 rounded-full bg-maroon-100 border border-maroon-200
                          flex items-center justify-center mb-3">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-maroon-700">
              <path fillRule="evenodd" d="M5.625 1.5H9a3.75 3.75 0 0 1 3.75 3.75v1.875c0 1.036.84 1.875 1.875 1.875H16.5a3.75 3.75 0 0 1 3.75 3.75v7.875c0 1.035-.84 1.875-1.875 1.875H5.625a1.875 1.875 0 0 1-1.875-1.875V3.375c0-1.036.84-1.875 1.875-1.875Zm5.845 17.03a.75.75 0 0 0 1.06 0l3-3a.75.75 0 1 0-1.06-1.06l-1.72 1.72V12a.75.75 0 0 0-1.5 0v4.19l-1.72-1.72a.75.75 0 0 0-1.06 1.06l3 3Z" clipRule="evenodd" />
              <path d="M14.25 5.25a5.23 5.23 0 0 0-1.279-3.434 9.768 9.768 0 0 1 6.963 6.963A5.23 5.23 0 0 0 16.5 7.5h-1.875a.375.375 0 0 1-.375-.375V5.25Z" />
            </svg>
          </div>
          <p className="font-semibold text-stone-800 text-sm mb-0.5">{file.name}</p>
          <p className="text-xs text-stone-400 mb-3">{(file.size / 1024).toFixed(0)} KB</p>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onFile(null) }}
            className="text-xs text-maroon-700 hover:text-maroon-600 font-medium underline underline-offset-2"
          >
            Remove file
          </button>
        </>
      ) : (
        <>
          <div className="w-12 h-12 rounded-full bg-cream-200 border border-cream-300
                          flex items-center justify-center mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                 strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-stone-500">
              <path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <p className="font-semibold text-stone-800 text-sm mb-1">Drop your resume here</p>
          <p className="text-xs text-stone-500 mb-2">or click to browse</p>
          <p className="text-[11px] text-stone-400">PDF or DOCX · max 10 MB</p>
        </>
      )}
    </div>
  )
}

/* ── Processing overlay ────────────────────────────────────── */
function ProcessingOverlay({ step }) {
  return (
    <div className="absolute inset-0 bg-cream-50/90 backdrop-blur-sm rounded-3xl
                    flex flex-col items-center justify-center z-10">
      <div className="w-10 h-10 border-[3px] border-maroon-700 border-t-transparent
                      rounded-full animate-spin mb-5" />
      <p className="font-semibold text-stone-800 text-sm mb-1">{STEPS[step] ?? 'Processing…'}</p>
      <div className="flex gap-1 mt-3">
        {STEPS.map((_, i) => (
          <span key={i} className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
            i <= step ? 'bg-maroon-700' : 'bg-cream-400'
          }`} />
        ))}
      </div>
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────── */
export default function Discover() {
  const navigate = useNavigate()
  const [file,      setFile]      = useState(null)
  const [interests, setInterests] = useState('')
  const [selectedChips, setSelectedChips] = useState(new Set())
  const [loading,   setLoading]   = useState(false)
  const [step,      setStep]      = useState(0)
  const [error,     setError]     = useState(null)

  function toggleChip(chip) {
    setSelectedChips(prev => {
      const next = new Set(prev)
      if (next.has(chip)) next.delete(chip)
      else next.add(chip)
      return next
    })
  }

  /* Merge free-text interests with selected chips for submission */
  function mergedInterests() {
    const parts = []
    const text = interests.trim()
    if (text) parts.push(text)
    for (const chip of selectedChips) {
      if (!text.toLowerCase().includes(chip.toLowerCase())) parts.push(chip)
    }
    return parts.join(', ')
  }

  const handleSubmit = useCallback(async e => {
    e?.preventDefault()
    if (!file)                                          { setError('Please upload your resume first.'); return }
    if (!interests.trim() && selectedChips.size === 0)  { setError('Please enter at least one research interest.'); return }

    setError(null)
    setLoading(true)

    try {
      setStep(0)
      const data = await fileToBase64(file)

      setStep(1)
      const res = await fetch('/api/parse', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, data, interests: mergedInterests() }),
      })

      setStep(2)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Server error ${res.status}`)
      }
      const { parsed_profile } = await res.json()

      setStep(3)
      localStorage.setItem('tamu_session', JSON.stringify({
        parsed_profile,
        interests: mergedInterests(),
        filename: file.name,
      }))

      navigate('/match')
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }, [file, interests, selectedChips, navigate])

  return (
    <div className="min-h-[calc(100vh-54px)] bg-cream-100 flex items-start justify-center
                    px-4 sm:px-6 py-12">
      <div className="w-full max-w-2xl">

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-5 h-px bg-maroon-700" />
            <span className="text-xs font-semibold text-maroon-700 uppercase tracking-[0.18em]">
              Research Discovery
            </span>
          </div>
          <h1 className="font-display font-bold text-stone-900 text-4xl sm:text-5xl
                         tracking-tight leading-[1.06] mb-4">
            Find your research<br />
            <em className="not-italic text-maroon-700">match.</em>
          </h1>
          <p className="text-[15px] text-stone-600 leading-relaxed max-w-lg">
            Upload your resume and tell us what excites you. We'll match you with
            TAMU faculty whose work aligns with where you want to go — not just
            where you've been.
          </p>
        </div>

        {/* Form */}
        <div className="relative">
          {loading && <ProcessingOverlay step={step} />}

          <form onSubmit={handleSubmit} className="space-y-6">

            <div>
              <label className="block text-[11px] font-semibold text-stone-400
                                 uppercase tracking-[0.12em] mb-2">
                01 — Your resume
              </label>
              <UploadZone file={file} onFile={setFile} />
            </div>

            <div>
              <label htmlFor="interests"
                     className="block text-[11px] font-semibold text-stone-400
                                uppercase tracking-[0.12em] mb-2">
                02 — Research interests
              </label>
              <textarea
                id="interests"
                value={interests}
                onChange={e => setInterests(e.target.value)}
                placeholder='e.g. "semiconductors, battery materials, sustainability, computational chemistry"'
                rows={3}
                className="w-full text-sm text-stone-900 bg-cream-50 border-2 border-cream-400
                           rounded-2xl px-4 py-3.5 leading-relaxed resize-none font-sans
                           placeholder-stone-400
                           focus:outline-none focus:ring-0 focus:border-maroon-700
                           transition-colors duration-200"
              />
              <p className="text-[11px] text-stone-400 mt-1.5">
                Describe what you want to explore — even if it's new territory for you.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {INTEREST_CHIPS.map(chip => {
                  const active = selectedChips.has(chip)
                  return (
                    <button key={chip} type="button" onClick={() => toggleChip(chip)}
                            className={`text-[11px] px-3 py-1 rounded-full border transition-all duration-150
                                        ${active
                                          ? 'border-maroon-700 bg-maroon-700 text-cream-100'
                                          : 'border-cream-400 text-stone-500 bg-white hover:border-maroon-400 hover:text-maroon-700 hover:bg-maroon-50'
                                        }`}>
                      {active && <span className="mr-1">&#10003;</span>}
                      {chip}
                    </button>
                  )
                })}
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 px-8 py-4
                         bg-maroon-700 text-cream-100 rounded-2xl font-semibold text-sm
                         hover:bg-maroon-600 transition-all duration-200
                         shadow-lg shadow-maroon-950/25
                         hover:shadow-xl hover:shadow-maroon-950/30
                         hover:-translate-y-0.5 active:translate-y-0
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {loading ? 'Processing…' : 'Find My Research Match'}
              {!loading && (
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
                  <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-stone-400 mt-8 leading-relaxed">
          Your resume is processed to extract text and is not stored permanently.
          <br />Matching is interest-driven — your resume provides supporting context only.
        </p>
      </div>
    </div>
  )
}
