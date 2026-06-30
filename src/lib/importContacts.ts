import * as XLSX from 'xlsx'
import { Contact } from '../types'

export type ImportedContact = Omit<Contact, 'id' | 'created_at' | 'updated_at'>

// ── Email Signature Parser ────────────────────────────────────────────────────

export function parseEmailSignature(text: string): Partial<ImportedContact> {
  const result: Partial<ImportedContact> = {}
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  // Email
  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/)
  if (emailMatch) result.email = emailMatch[0]

  // Phone — match common formats, require at least 10 digits
  const phoneMatch = text
    .match(/(\+?[\d().\-\s]{7,})/g)
    ?.find((p) => p.replace(/\D/g, '').length >= 10)
  if (phoneMatch) result.phone = phoneMatch.trim()

  // LinkedIn URL
  const liMatch = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[^\s|<>]+/)
  if (liMatch) {
    result.linkedin_url = liMatch[0].startsWith('http')
      ? liMatch[0]
      : `https://${liMatch[0]}`
  }

  const contactLine = /[@+\d(]|linkedin|www\.|http/i
  const titleKw =
    /\b(director|manager|vice\s*president|vp|president|ceo|cfo|cto|coo|svp|evp|avp|head of|lead|senior|associate|partner|founder|owner|principal|consultant|analyst|engineer|executive|officer)\b/i

  // Name — first short non-contact line that looks like a person name
  for (const line of lines) {
    if (contactLine.test(line) || line.length < 3 || line.length > 60) continue
    const words = line.split(/\s+/).filter(Boolean)
    if (words.length >= 2 && words.length <= 4 && !titleKw.test(line)) {
      result.first_name = words[0]
      result.last_name = words.slice(1).join(' ')
      break
    }
  }

  // Title — line matching job title keywords
  for (const line of lines) {
    if (contactLine.test(line)) continue
    if (titleKw.test(line) && line.length < 100) {
      result.title = line
      break
    }
  }

  // Company — non-name, non-title, non-contact line that looks like an org
  const usedLines = new Set([
    `${result.first_name ?? ''} ${result.last_name ?? ''}`.trim(),
    result.title ?? '',
  ])
  for (const line of lines) {
    if (contactLine.test(line) || usedLines.has(line) || titleKw.test(line)) continue
    if (line.length < 2 || line.length > 80) continue
    if (
      /^[A-Z]/.test(line) &&
      /\b(inc|llc|ltd|corp|group|co\.|company|associates|partners|solutions|services|technologies|capital|consulting|holdings|ventures|foundation|institute)\b/i.test(
        line
      )
    ) {
      result.company = line
      break
    }
    // Fallback: single capitalized word that's not a name
    const words = line.split(/\s+/)
    if (
      words.length === 1 &&
      /^[A-Z]/.test(line) &&
      line !== result.first_name &&
      line !== result.last_name
    ) {
      result.company = line
      break
    }
  }

  return result
}

// ── vCard Parser ──────────────────────────────────────────────────────────────

function vcardField(card: string, field: string): string {
  const match = card.match(new RegExp(`^${field}[^:\r\n]*:([^\r\n]*)`, 'mi'))
  return match ? match[1].replace(/\\n/g, '\n').trim() : ''
}

export function parseVCards(vcf: string): Partial<ImportedContact>[] {
  // Split on BEGIN:VCARD, drop empty first chunk
  const blocks = vcf.split(/BEGIN:VCARD/i).slice(1)

  return blocks
    .map((card) => {
      const result: Partial<ImportedContact> = {}

      // Structured name: N:Last;First;Middle;;
      const n = vcardField(card, 'N')
      if (n) {
        const parts = n.split(';')
        if (parts[1]) result.first_name = parts[1].trim()
        if (parts[0]) result.last_name = parts[0].trim()
      }

      // Full name fallback
      const fn = vcardField(card, 'FN')
      if (fn && (!result.first_name)) {
        const parts = fn.split(/\s+/)
        result.first_name = parts[0]
        result.last_name = parts.slice(1).join(' ') || undefined
      }

      // Email — try several type variants
      const emailMatch = card.match(/^EMAIL[^:\r\n]*:([^\r\n]+)/mi)
      if (emailMatch) result.email = emailMatch[1].trim()

      // Phone
      const telMatch = card.match(/^TEL[^:\r\n]*:([^\r\n]+)/mi)
      if (telMatch) result.phone = telMatch[1].trim()

      // Org and title
      const org = vcardField(card, 'ORG')
      if (org) result.company = org.split(';')[0].trim()
      const title = vcardField(card, 'TITLE')
      if (title) result.title = title

      // LinkedIn URL
      const urlMatch = card.match(/^URL[^:\r\n]*:(https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s\r\n]+)/mi)
      if (urlMatch) result.linkedin_url = urlMatch[1].trim()

      // Address: ADR:;;Street;City;State;Zip;Country
      const adrMatch = card.match(/^ADR[^:\r\n]*:([^\r\n]+)/mi)
      if (adrMatch) {
        const parts = adrMatch[1].split(';')
        if (parts[3]) result.city = parts[3].trim()
        if (parts[4]) result.state = parts[4].trim()
        if (parts[6]) result.country = parts[6].trim()
      }

      // Birthday
      const bday = vcardField(card, 'BDAY')
      if (bday) {
        // YYYYMMDD or YYYY-MM-DD
        const clean = bday.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3').slice(0, 10)
        if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) result.birthday = clean
      }

      return result
    })
    .filter((c) => c.first_name || c.last_name || c.email)
}

// ── CSV Parser ────────────────────────────────────────────────────────────────

type ContactField = keyof ImportedContact | 'full_name' | null

const COL: Record<string, ContactField> = {
  // First name
  firstname: 'first_name', fname: 'first_name', givenname: 'first_name',
  first: 'first_name',
  // Last name
  lastname: 'last_name', lname: 'last_name', surname: 'last_name',
  familyname: 'last_name', last: 'last_name',
  // Full name
  name: 'full_name', fullname: 'full_name', contactname: 'full_name',
  displayname: 'full_name',
  // Email
  email: 'email', emailaddress: 'email', email1: 'email',
  email1value: 'email', emailaddress1: 'email', workemail: 'email',
  primaryemail: 'email',
  // Phone
  phone: 'phone', phonenumber: 'phone', mobile: 'phone',
  mobilephone: 'phone', cellphone: 'phone', telephone: 'phone',
  workphone: 'phone', phone1value: 'phone', phonenumber1: 'phone',
  primaryphone: 'phone', businessphone: 'phone',
  // Company
  company: 'company', organization: 'company', org: 'company',
  account: 'company', employer: 'company', companyname: 'company',
  organizationname: 'company', accountname: 'company',
  // Title
  title: 'title', jobtitle: 'title', position: 'title',
  role: 'title', jobfunction: 'title',
  // City
  city: 'city', location: 'city',
  // State
  state: 'state', province: 'state', region: 'state',
  // Country
  country: 'country', countryregion: 'country',
  // LinkedIn
  linkedin: 'linkedin_url', linkedinurl: 'linkedin_url',
  linkedinprofile: 'linkedin_url', profileurl: 'linkedin_url',
  // Notes
  notes: 'notes', note: 'notes', comments: 'notes', description: 'notes',
  // Birthday
  birthday: 'birthday', birthdate: 'birthday', dob: 'birthday',
  dateofbirth: 'birthday',
}

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_\-."']+/g, '')
}

function splitLine(line: string, sep: string): string[] {
  const fields: string[] = []
  let cur = ''
  let inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === sep && !inQ) { fields.push(cur.trim().replace(/^"|"$/g, '')); cur = '' }
    else cur += ch
  }
  fields.push(cur.trim().replace(/^"|"$/g, ''))
  return fields
}

export function parseCSVContacts(csv: string): Partial<ImportedContact>[] {
  const raw = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = raw.split('\n').filter((l) => l.trim())
  if (lines.length < 1) return []

  // Detect separator: whichever of , or ; or \t appears more in the first row
  const header = lines[0]
  const counts = { ',': (header.match(/,/g) ?? []).length, ';': (header.match(/;/g) ?? []).length, '\t': (header.match(/\t/g) ?? []).length }
  const sep = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]

  const headers = splitLine(lines[0], sep)
  let fieldMap: ContactField[] = headers.map((h) => COL[normHeader(h)] ?? null)
  let dataLines = lines.slice(1)

  // No recognized headers — file has no header row, auto-detect column types from data
  if (!fieldMap.some((f) => f !== null)) {
    dataLines = lines
    const colCount = headers.length
    const sampleRows = lines.slice(0, Math.min(10, lines.length)).map((l) => splitLine(l, sep))

    const emailCol = (() => {
      for (let i = 0; i < colCount; i++) {
        const vals = sampleRows.map((r) => r[i]?.trim()).filter(Boolean)
        if (vals.filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)).length / vals.length >= 0.4) return i
      }
      return -1
    })()

    const phoneCol = (() => {
      for (let i = 0; i < colCount; i++) {
        if (i === emailCol) continue
        const vals = sampleRows.map((r) => r[i]?.trim()).filter(Boolean)
        if (vals.filter((v) => v.replace(/\D/g, '').length >= 10).length / vals.length >= 0.5) return i
      }
      return -1
    })()

    // Among remaining text columns, shortest average value length → person name
    const textCols = Array.from({ length: colCount }, (_, i) => i).filter((i) => i !== emailCol && i !== phoneCol)
    const nameCol = textCols.length === 0 ? -1 : textCols.reduce((best, i) => {
      const vals = sampleRows.map((r) => r[i]?.trim()).filter(Boolean)
      const avg = vals.reduce((s, v) => s + v.length, 0) / (vals.length || 1)
      const bestVals = sampleRows.map((r) => r[best]?.trim()).filter(Boolean)
      const bestAvg = bestVals.reduce((s, v) => s + v.length, 0) / (bestVals.length || 1)
      return avg < bestAvg ? i : best
    }, textCols[0])

    fieldMap = Array.from({ length: colCount }, (_, i) => {
      if (i === emailCol) return 'email'
      if (i === phoneCol) return 'phone'
      if (i === nameCol) return 'full_name'
      return 'company'
    })
  }

  return dataLines
    .map((line) => {
      const vals = splitLine(line, sep)
      const contact: Partial<ImportedContact> = {}
      vals.forEach((val, i) => {
        const field = fieldMap[i]
        const v = val.trim()
        if (!field || !v) return
        if (field === 'full_name') {
          const parts = v.split(/\s+/)
          if (!contact.first_name) contact.first_name = parts[0]
          if (!contact.last_name && parts.length > 1) contact.last_name = parts.slice(1).join(' ')
        } else {
          (contact as Record<string, string>)[field] = v
        }
      })
      return contact
    })
    .filter((c) => c.first_name || c.last_name || c.email)
}

// ── XLSX Parser ───────────────────────────────────────────────────────────────

export function parseXLSXContacts(buffer: ArrayBuffer): Partial<ImportedContact>[] {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const csv = XLSX.utils.sheet_to_csv(sheet)
  return parseCSVContacts(csv)
}
