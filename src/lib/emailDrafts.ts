import { Alert, Contact } from '../types'

export interface EmailDraft {
  label: string   // e.g. "Warm & personal"
  subject: string
  body: string
}

function firstName(contact: Contact) { return contact.first_name }
function company(contact: Contact) { return contact.company || 'your company' }

export function generateEmailDrafts(alert: Alert, contact: Contact): EmailDraft[] {
  const name = firstName(contact)
  const co = company(contact)
  const headline = (alert.data?.url ? alert.message : alert.message) ?? ''
  const newsUrl = alert.data?.url as string | undefined

  switch (alert.type) {

    case 'birthday_soon':
      return [
        {
          label: 'Warm & personal',
          subject: `Happy Birthday, ${name}! 🎂`,
          body: `Hi ${name},\n\nJust wanted to pop in and wish you a very happy birthday! Hope you're able to take some time to celebrate — you deserve it.\n\nLet's find a time to catch up soon. I'd love to hear how things are going at ${co}.\n\nWarm wishes,`,
        },
        {
          label: 'Professional',
          subject: `Happy Birthday, ${name}`,
          body: `Hi ${name},\n\nI wanted to take a moment to wish you a happy birthday. I hope you have a great day.\n\nLooking forward to our continued work together — let me know if you'd like to connect soon.\n\nBest regards,`,
        },
        {
          label: 'Short & punchy',
          subject: `Happy Birthday! 🎉`,
          body: `Hi ${name},\n\nHappy birthday! Hope it's a fantastic one.\n\nLet's grab coffee soon to celebrate!\n\nCheers,`,
        },
      ]

    case 'company_news':
      return [
        {
          label: 'Curious & conversational',
          subject: `Saw the news about ${co} — wanted to reach out`,
          body: `Hi ${name},\n\nI came across some coverage of ${co} and immediately thought of you:\n\n"${headline}"\n\nWould love to hear your perspective on this. Are you available for a quick call this week?\n\nBest,`,
        },
        {
          label: 'Professional',
          subject: `Following ${co}'s recent news`,
          body: `Hi ${name},\n\nI noticed some recent news around ${co} — "${headline}" — and wanted to check in to see how things are on your end.\n\nHappy to discuss if there's anything relevant to our conversations. Would you have 15 minutes this week?\n\nBest regards,`,
        },
        {
          label: 'Short & direct',
          subject: `${co} in the news`,
          body: `Hi ${name},\n\n${co} has been getting some coverage lately — "${headline}"\n\nWorth a quick call to catch up? Let me know.\n\nCheers,`,
        },
      ]

    case 'overdue_contact': {
      const lastLine = contact.notes
        ? `P.S. — ${contact.notes.split('.')[0]}.`
        : ''
      return [
        {
          label: 'Warm check-in',
          subject: `Long overdue catch-up, ${name}!`,
          body: `Hi ${name},\n\nI realized it's been a while since we last connected, and I've been meaning to reach out. How are things going at ${co}?\n\nI'd love to catch up — even a quick 15-minute call would be great. What does your schedule look like in the next couple of weeks?\n\n${lastLine}\n\nWarm regards,`,
        },
        {
          label: 'Professional reconnect',
          subject: `Checking in — ${name}`,
          body: `Hi ${name},\n\nI wanted to reach out and reconnect. It's been some time since we last spoke, and I'd love to hear how things are progressing at ${co}.\n\nWould you be open to a brief call in the coming weeks?\n\nBest regards,`,
        },
        {
          label: 'Casual & brief',
          subject: `Hey ${name} — it's been too long!`,
          body: `Hi ${name},\n\nIt's been way too long! How are you doing? How's everything at ${co}?\n\nLet's find a time to catch up soon — coffee or a quick call, whatever works for you.\n\nCheers,`,
        },
      ]
    }

    case 'life_event_soon': {
      const eventTitle = alert.title.split('—')[0].trim()
      const isCongrats = ['graduation', 'promotion', 'baby', 'wedding'].some((k) =>
        alert.message.toLowerCase().includes(k)
      )
      const opener = isCongrats ? 'Congratulations' : 'Best wishes'
      return [
        {
          label: 'Warm & celebratory',
          subject: `${opener} on ${eventTitle}, ${name}!`,
          body: `Hi ${name},\n\nI heard about ${eventTitle} coming up — what an exciting time! Wanted to reach out and send my warmest ${isCongrats ? 'congratulations' : 'wishes'}.\n\nHow are you feeling about it all? Would love to celebrate with you soon.\n\nWarm regards,`,
        },
        {
          label: 'Professional',
          subject: `${opener}, ${name}`,
          body: `Hi ${name},\n\nI wanted to reach out ahead of ${eventTitle} to extend my sincere ${isCongrats ? 'congratulations' : 'best wishes'}. It's a wonderful milestone.\n\nPlease don't hesitate to reach out if there's anything I can do to help during this time.\n\nBest regards,`,
        },
        {
          label: 'Short & genuine',
          subject: `${eventTitle} — so exciting!`,
          body: `Hi ${name},\n\n${isCongrats ? 'Huge congratulations' : 'Thinking of you'} on ${eventTitle}! That's wonderful news.\n\nLet me know if you need anything at all.\n\nCheers,`,
        },
      ]
    }

    case 'weather': {
      const city = contact.city || 'your area'
      const weatherType = alert.title.split(' in ')[0].replace('in ', '')
      return [
        {
          label: 'Warm check-in',
          subject: `Checking in — ${weatherType} in ${city}`,
          body: `Hi ${name},\n\nI saw there's ${weatherType.toLowerCase()} hitting ${city} right now and immediately thought of you. Hope you and everyone around you are safe and staying comfortable!\n\nLet me know if it's affected any of your plans. Happy to reschedule anything on our end.\n\nTake care,`,
        },
        {
          label: 'Brief & genuine',
          subject: `Hoping you're safe — ${weatherType} in ${city}`,
          body: `Hi ${name},\n\nJust saw the ${weatherType.toLowerCase()} warnings for ${city}. Hope you're all good!\n\nStay safe out there.\n\nBest,`,
        },
        {
          label: 'Professional',
          subject: `Weather check-in, ${name}`,
          body: `Hi ${name},\n\nI noticed there's some severe weather in ${city} at the moment. Wanted to check in and make sure you're doing well, and to flag that I'm happy to be flexible on any upcoming meetings if needed.\n\nHope everything is safe on your end.\n\nBest regards,`,
        },
      ]
    }

    case 'linkedin_change':
      return [
        {
          label: 'Congratulatory',
          subject: `Congrats on the new role, ${name}!`,
          body: `Hi ${name},\n\nI noticed your LinkedIn has some exciting updates — looks like you've made a move! Congratulations! That's fantastic news.\n\nI'd love to hear all about it. Are you free for a quick call this week to catch up?\n\nWarm regards,`,
        },
        {
          label: 'Professional',
          subject: `Congratulations, ${name}`,
          body: `Hi ${name},\n\nI came across your updated LinkedIn profile and wanted to reach out to offer my congratulations on your new role.\n\nI'd love to reconnect and hear more about your new direction. Would you have time for a brief call?\n\nBest regards,`,
        },
        {
          label: 'Casual',
          subject: `Saw your LinkedIn update — congrats!`,
          body: `Hi ${name},\n\nJust spotted your LinkedIn update — congrats on the new role! Big move!\n\nWould love to catch up and hear all about it. Coffee soon?\n\nCheers,`,
        },
      ]

    case 'local_event': {
      const eventName = alert.title.replace(`Happening in ${contact.city || ''}: `, '')
      return [
        {
          label: 'Casual invite',
          subject: `${eventName} in ${contact.city} — want to go?`,
          body: `Hi ${name},\n\nI came across ${eventName} happening in ${contact.city || 'your area'} and immediately thought it could be fun to attend together!\n\n${alert.message}\n\nWould you be up for it? Could be a great excuse to catch up in person.\n\nLet me know!`,
        },
        {
          label: 'Professional networking angle',
          subject: `Upcoming event in ${contact.city} — thought of you`,
          body: `Hi ${name},\n\nI noticed ${eventName} is coming up in ${contact.city || 'your area'} — ${alert.message}. It looks like a solid networking opportunity and I thought it might be right up your alley.\n\nWould you be interested in attending? Happy to coordinate.\n\nBest,`,
        },
        {
          label: 'Brief',
          subject: `${eventName} — worth checking out?`,
          body: `Hi ${name},\n\n${eventName} is happening in ${contact.city || 'your area'} — ${alert.message}.\n\nCould be a fun reason to meet up in person. Interested?\n\nCheers,`,
        },
      ]
    }

    case 'holiday_soon': {
      const holidayName = (alert.data?.holiday_name as string) || 'the holiday'
      return [
        {
          label: 'Warm seasonal',
          subject: `Happy ${holidayName}, ${name}!`,
          body: `Hi ${name},\n\nJust wanted to wish you and yours a wonderful ${holidayName}! Hope you get a chance to rest and celebrate.\n\nLooking forward to catching up when things settle down.\n\nWarm wishes,`,
        },
        {
          label: 'Personal & brief',
          subject: `Happy ${holidayName}!`,
          body: `Hi ${name},\n\nHappy ${holidayName}! Hope it's a great one for you and the family.\n\nCheers,`,
        },
        {
          label: 'Professional',
          subject: `Wishing you a great ${holidayName}`,
          body: `Hi ${name},\n\nI wanted to take a moment to wish you a happy ${holidayName}. I hope you enjoy the time with your loved ones.\n\nLooking forward to connecting again in the new year.\n\nBest regards,`,
        },
      ]
    }

    case 'stock_move': {
      const ticker = (alert.data?.ticker as string) || co
      const pct = alert.data?.change_percent as number ?? 0
      const up = pct >= 0
      const pctStr = Math.abs(pct).toFixed(1)
      return up
        ? [
            {
              label: 'Casual congrats',
              subject: `Strong day for ${ticker} — congrats!`,
              body: `Hi ${name},\n\nSaw ${ticker} up ${pctStr}% today — nice! Must be exciting to see the market responding. How's the momentum feeling on the ground?\n\nWould love to catch up soon.\n\nCheers,`,
            },
            {
              label: 'Professional',
              subject: `Following ${co}'s performance`,
              body: `Hi ${name},\n\nI noticed ${ticker} had a strong session today, up ${pctStr}%. Wanted to reach out and say congratulations — it's always great to see the market validate the work happening inside the business.\n\nWould you have time for a quick call this week?\n\nBest regards,`,
            },
            {
              label: 'Short & direct',
              subject: `${ticker} up ${pctStr}% — well done!`,
              body: `Hi ${name},\n\n${ticker} up ${pctStr}% today — impressive. How are things feeling on your end?\n\nLet's find a time to catch up.\n\nCheers,`,
            },
          ]
        : [
            {
              label: 'Thoughtful check-in',
              subject: `Checking in — ${ticker} in the news`,
              body: `Hi ${name},\n\nI noticed ${ticker} had a tough session today and wanted to reach out to check in. Markets can be noisy — I'm sure you have context that explains it.\n\nHow are things going on your end? Happy to chat if useful.\n\nBest,`,
            },
            {
              label: 'Professional',
              subject: `Thinking of you — ${co}`,
              body: `Hi ${name},\n\nI saw some movement in ${ticker} today and wanted to reach out. These moments are a good reminder that it's always worth staying connected.\n\nWould you be open to a quick call this week?\n\nBest regards,`,
            },
            {
              label: 'Short & direct',
              subject: `${ticker} today — let me know if I can help`,
              body: `Hi ${name},\n\nSaw the dip in ${ticker} today — just wanted to check in. Let me know if there's anything I can do.\n\nCheers,`,
            },
          ]
    }

    case 'earnings_soon': {
      const ticker = (alert.data?.ticker as string) || co
      const earningsDate = alert.data?.earnings_date as string | undefined
      const days = alert.data?.days as number ?? 0
      const dateStr = earningsDate ? new Date(earningsDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : 'soon'
      const timing = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `on ${dateStr}`
      return [
        {
          label: 'Pre-earnings check-in',
          subject: `${ticker} earnings ${timing} — thinking of you`,
          body: `Hi ${name},\n\nWith ${ticker} reporting ${timing}, I wanted to reach out before the noise kicks in. How are you feeling heading into earnings? I'd love to hear what you're watching for.\n\nHappy to grab a quick call before or after.\n\nBest,`,
        },
        {
          label: 'Professional',
          subject: `${co} earnings ${timing}`,
          body: `Hi ${name},\n\nI see ${ticker} is reporting ${timing} and wanted to reach out ahead of time. Earnings periods are always busy, but I'd value a chance to connect when you have a moment — before or after.\n\nBest regards,`,
        },
        {
          label: 'Short & timely',
          subject: `${ticker} reporting ${timing} — let's connect`,
          body: `Hi ${name},\n\n${ticker} earnings are ${timing}. Would love to hear your take before or after the call.\n\nQuick 15 minutes this week?\n\nCheers,`,
        },
      ]
    }

    default:
      return [
        {
          label: 'Check-in',
          subject: `Thinking of you, ${name}`,
          body: `Hi ${name},\n\nI wanted to reach out and check in. Hope all is well at ${co}!\n\nWould love to catch up soon.\n\nBest,`,
        },
      ]
  }
}
