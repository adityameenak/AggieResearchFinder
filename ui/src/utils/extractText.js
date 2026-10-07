/**
 * Read a PDF or Word file's text in the browser.
 *
 * Why not upload the file: Vercel caps a function's request body at 4.5 MB,
 * and the file went up base64-encoded (+33%), so any PDF over ~3.3 MB came
 * back as "413 Payload Too Large" — common for journal papers, whose size is
 * mostly figures. The explainer only ever used the text, which is typically
 * 50–150 KB whatever the PDF weighs, so extracting it here removes the limit
 * and makes the upload near-instant.
 *
 * Both libraries load on demand, so they cost nothing until a file is chosen.
 */

export class ExtractError extends Error {}

async function pdfText(file) {
  // The legacy build supports older Safari/Chromium; the default build
  // targets only the newest browsers.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { default: workerUrl } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const task = pdfjs.getDocument({ data: await file.arrayBuffer() })
  const doc = await task.promise
  const pages = []
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent()
    // Keep line breaks: the server finds the reference list by a heading on
    // its own line ("\nReferences\n") and cuts it off.
    pages.push(content.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join(''))
  }
  await task.destroy()          // v6: destroy() lives on the loading task, not the document
  return pages.join('\n\n')
}

async function docxText(file) {
  const { default: mammoth } = await import('mammoth')
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return value
}

/** @returns {Promise<string>} the file's text; throws ExtractError with a user-facing message */
export async function extractText(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  let text
  try {
    if (ext === 'pdf') text = await pdfText(file)
    else if (ext === 'docx') text = await docxText(file)
    else throw new ExtractError('Only PDF and Word (.docx) files can be read here.')
  } catch (err) {
    if (err instanceof ExtractError) throw err
    if (err?.name === 'PasswordException') throw new ExtractError('This PDF is password-protected.')
    console.error('[extractText]', err)       // the user sees the friendly message below
    throw new ExtractError(`Couldn’t read ${file.name}. Try pasting the text instead.`, { cause: err })
  }
  // A scanned paper is a stack of images with no text layer.
  if ((text || '').replace(/\s+/g, '').length < 200) {
    throw new ExtractError(
      'No selectable text found — this looks like a scanned PDF. Paste the text instead, ' +
      'or use a version with selectable text.')
  }
  return text
}
