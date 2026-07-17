export interface Contact {
  id: string
  first_name: string
  last_name: string
  email?: string
  phone?: string
  company?: string
  title?: string
  city?: string
  state?: string
  country?: string
  birthday?: string        // ISO date string YYYY-MM-DD
  linkedin_url?: string
  avatar_url?: string
  tags?: string[]
  notes?: string           // quick summary note
  last_contacted?: string  // ISO date string
  tier?: 'key' | 'standard' | 'low'  // contact cadence tier
  ticker?: string                     // stock ticker for public company contacts
  news_terms?: string                 // extra keywords to disambiguate news search (e.g. "insurance")
  created_at: string
  updated_at: string
}

export interface LifeEvent {
  id: string
  contact_id: string
  title: string
  description?: string
  event_date: string       // ISO date string
  recurring?: boolean      // repeat every year (birthdays, anniversaries)
  category: EventCategory
  notify_before_days?: number
  created_at: string
}

export type EventCategory =
  | 'birthday'
  | 'anniversary'
  | 'baby'
  | 'graduation'
  | 'promotion'
  | 'wedding'
  | 'travel'
  | 'conference'
  | 'other'

export interface MeetingNote {
  id: string
  contact_id: string
  title: string
  content: string
  meeting_date: string     // ISO date string
  created_at: string
  updated_at: string
}

export interface Conference {
  id: string
  title: string
  date: string             // ISO date string YYYY-MM-DD
  location?: string
  description?: string
  url?: string
  created_at: string
}

export type ProspectStatus = 'new' | 'researching' | 'reached_out'

export interface Prospect {
  id: string
  company: string
  website?: string
  industry?: string
  ticker?: string
  contact_name?: string
  contact_title?: string
  linkedin_url?: string
  reason?: string          // why you want to engage them
  status: ProspectStatus
  created_at: string
  updated_at: string
}

export type ReflectionCategory = 'working' | 'improve' | 'idea' | 'note'

export interface Reflection {
  id: string
  content: string
  category: ReflectionCategory
  created_at: string
  updated_at: string
}

export interface Alert {
  id: string
  contact_id: string
  contact_name: string
  type: AlertType
  title: string
  message: string
  action_suggestion: string
  created_at: string
  dismissed: boolean
  data?: Record<string, unknown>
}

export type AlertType =
  | 'weather'
  | 'company_news'
  | 'linkedin_change'
  | 'local_event'
  | 'birthday_soon'
  | 'life_event_soon'
  | 'overdue_contact'
  | 'holiday_soon'
  | 'stock_move'
  | 'earnings_soon'
