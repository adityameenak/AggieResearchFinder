// Shared PDF/DOCX → plain text extraction for the upload endpoints
// (api/parse.js for resumes, api/paper.js for research papers).

export class ExtractError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/**
 * @param {string} filename  used only for its extension
 * @param {string} data      base64 file contents
 * @returns {Promise<string>} extracted text (never empty — throws instead)
 */
export async function extractText(filename, data) {
  if (!data) throw new ExtractError(400, 'No file data provided.')
  const buffer = Buffer.from(data, 'base64')
  const ext = String(filename || '').split('.').pop().toLowerCase()

  let text = ''
  try {
    if (ext === 'pdf') {
      // pdf-parse is CommonJS; dynamic import wraps module.exports as default
      const pdfParse = (await import('pdf-parse')).default
      text = (await pdfParse(buffer)).text
    } else if (ext === 'docx' || ext === 'doc') {
      const mammoth = await import('mammoth')
      text = (await mammoth.extractRawText({ buffer })).value
    } else {
      throw new ExtractError(422, 'Only PDF and DOCX files are supported.')
    }
  } catch (e) {
    if (e instanceof ExtractError) throw e
    throw new ExtractError(500, `Text extraction failed: ${e.message}`)
  }

  if (!text.trim()) {
    throw new ExtractError(422, 'No text could be extracted from the file.')
  }
  return text
}
