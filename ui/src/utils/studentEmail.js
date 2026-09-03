/**
 * The student's own school email, remembered per school so the email modal
 * can open Gmail in the right account and record it on tracker entries.
 * Key follows the app-wide `${schoolCode}_*` localStorage namespacing.
 */

export const studentEmailKey = code => `${code}_student_email`

export function getStudentEmail(code) {
  try {
    return localStorage.getItem(studentEmailKey(code)) || ''
  } catch {
    return ''
  }
}

export function setStudentEmail(code, email) {
  const value = (email || '').trim()
  try {
    if (value) localStorage.setItem(studentEmailKey(code), value)
    else       localStorage.removeItem(studentEmailKey(code))
  } catch {
    // Private browsing / quota — remembering the address is a convenience only.
  }
}
