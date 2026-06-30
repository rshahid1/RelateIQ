import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Search, StickyNote } from 'lucide-react'
import { MeetingNote, Contact } from '../types'
import Avatar from '../components/Avatar'
import { format, parseISO } from 'date-fns'

interface Props {
  notes: MeetingNote[]
  contacts: Contact[]
}

export default function NotesPage({ notes, contacts }: Props) {
  const [search, setSearch] = useState('')

  const contactMap = useMemo(() => {
    const m = new Map<string, Contact>()
    contacts.forEach((c) => m.set(c.id, c))
    return m
  }, [contacts])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return notes
      .filter((n) => {
        if (!q) return true
        const contact = contactMap.get(n.contact_id)
        return (
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          `${contact?.first_name} ${contact?.last_name}`.toLowerCase().includes(q) ||
          contact?.company?.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))
  }, [notes, search, contactMap])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meeting Notes</h1>
          <p className="text-sm text-gray-500 mt-0.5">{notes.length} notes across {contacts.length} contacts</p>
        </div>
      </div>

      <div className="relative mb-5">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="input pl-8"
          placeholder="Search notes by keyword, contact, or company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <StickyNote size={36} className="mx-auto mb-3 opacity-30" />
          <p>No notes found. Open a contact to add meeting notes.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((note) => {
            const contact = contactMap.get(note.contact_id)
            if (!contact) return null
            const name = `${contact.first_name} ${contact.last_name}`
            return (
              <Link
                key={note.id}
                to={`/contacts/${contact.id}`}
                className="card block hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={name} url={contact.avatar_url} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm text-gray-900">{note.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {name} · {contact.company && `${contact.company} · `}
                          {format(parseISO(note.meeting_date), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mt-2 line-clamp-2">{note.content}</p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
