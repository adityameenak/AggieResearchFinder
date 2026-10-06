import { useState, useRef } from 'react'

/* ── File → base64 helper ──────────────────────────────────── */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/* ── Upload zone ───────────────────────────────────────────── */
const MAX_BYTES = 10 * 1024 * 1024
const ACCEPTED  = /\.(pdf|docx?)$/i

export default function UploadZone({ file, onFile, prompt = 'Drop your resume here', what = 'your resume' }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [rejected, setRejected] = useState('')

  // The zone promised "PDF or DOCX · max 10 MB" and checked neither: a drop
  // bypasses the input's `accept`, and a 40 MB scan went straight to the parser.
  function take(f) {
    if (!f) return
    if (!ACCEPTED.test(f.name)) { setRejected(`${f.name} isn’t a PDF or Word file.`); return }
    if (f.size > MAX_BYTES) { setRejected(`${f.name} is over 10 MB.`); return }
    setRejected('')
    onFile(f)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    take(e.dataTransfer.files[0])
  }

  function browse() {
    if (!file) inputRef.current?.click()
  }

  return (
    <>
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={browse}
      // A clickable div is invisible to the keyboard without these.
      role={file ? undefined : 'button'}
      tabIndex={file ? undefined : 0}
      aria-label={file ? undefined : `Upload ${what} (PDF or DOCX, up to 10 MB)`}
      onKeyDown={e => { if (!file && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); browse() } }}
      className={`relative rounded-2xl border-2 border-dashed transition-all duration-200
                  flex flex-col items-center justify-center text-center py-12 px-8
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-700/40
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
        onChange={e => { take(e.target.files?.[0]); e.target.value = '' }}
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
          <p className="font-semibold text-stone-800 text-sm mb-1">{prompt}</p>
          <p className="text-xs text-stone-500 mb-2">or click to browse</p>
          <p className="text-[11px] text-stone-400">PDF or DOCX · max 10 MB</p>
        </>
      )}
    </div>
    {rejected && (
      <p role="alert" className="mt-2 text-xs text-red-700">{rejected}</p>
    )}
    </>
  )
}
