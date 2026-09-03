/**
 * Compose deep-links for the "send" step of the email modal.
 *
 * The app can't send mail itself (no user accounts, no server-side token
 * storage, and gmail.send is a Google restricted scope that university
 * Workspace admins routinely block), so we hand the draft to the student's
 * own mail client with to/subject/body prefilled. No URL scheme can attach a
 * file — the resume must be added by hand, and the modal says so.
 */

/** Soft threshold above which some mail clients truncate mailto: bodies. */
export const MAX_BODY_CHARS = 2000

export function bodyTooLong(body) {
  return (body || '').length > MAX_BODY_CHARS
}

/**
 * Gmail web compose. `authuser` (a signed-in address) makes Gmail open the
 * compose window in that account instead of the default one — this is what
 * lets a student send from their .edu account when they're also signed in to
 * a personal Gmail. Gmail simply prompts for an account if it's unknown.
 */
export function gmailComposeUrl({ to = '', subject = '', body = '', authuser = '' }) {
  const params = new URLSearchParams({ view: 'cm', fs: '1', to, su: subject, body })
  if (authuser) params.set('authuser', authuser)
  return `https://mail.google.com/mail/?${params.toString()}`
}

/** Outlook on the web (Microsoft 365) compose deep-link. */
export function outlookComposeUrl({ to = '', subject = '', body = '' }) {
  const params = new URLSearchParams({ to, subject, body })
  return `https://outlook.office.com/mail/deeplink/compose?${params.toString()}`
}

/**
 * Standard mailto: for whatever the OS default client is. Encoded with
 * encodeURIComponent rather than URLSearchParams on purpose — the latter
 * encodes spaces as "+", which many desktop mail clients render literally.
 */
export function mailtoUrl({ to = '', subject = '', body = '' }) {
  const q = [
    subject && `subject=${encodeURIComponent(subject)}`,
    body    && `body=${encodeURIComponent(body)}`,
  ].filter(Boolean).join('&')
  return `mailto:${encodeURIComponent(to)}${q ? `?${q}` : ''}`
}

/**
 * All three options in display order, with the school's provider first and
 * flagged `primary`. Every option is always returned so a wrong provider
 * guess in schools.js only affects which button is emphasised.
 */
export function buildComposeLinks({ to, subject, body, provider, studentEmail }) {
  const args  = { to: to || '', subject: subject || '', body: body || '' }
  const links = {
    gmail:   { id: 'gmail',   label: 'Open in Gmail',    url: gmailComposeUrl({ ...args, authuser: studentEmail || '' }) },
    outlook: { id: 'outlook', label: 'Open in Outlook',  url: outlookComposeUrl(args) },
    mailto:  { id: 'mailto',  label: 'Default mail app', url: mailtoUrl(args) },
  }
  const primaryId = provider === 'google' ? 'gmail' : provider === 'microsoft' ? 'outlook' : 'mailto'
  const order     = [primaryId, ...['gmail', 'outlook', 'mailto'].filter(id => id !== primaryId)]
  return order.map(id => ({ ...links[id], primary: id === primaryId }))
}

/**
 * Open a compose URL. Must be called synchronously inside a click handler so
 * popup blockers treat it as user-initiated; if the popup is still blocked
 * (window.open returns null) fall back to navigating the current tab.
 */
export function openCompose(url) {
  const w = window.open(url, '_blank', 'noopener')
  if (!w) window.location.assign(url)
}
