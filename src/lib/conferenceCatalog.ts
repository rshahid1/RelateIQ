/**
 * Built-in catalog of well-known recurring industry conferences.
 * Powers conference discovery for free (no API key). When an Anthropic key is
 * set, the AI path is used instead for broader/fresher results.
 */
import { ConferenceSuggestion } from './analytics'

interface CatalogEntry {
  title: string
  month: number          // 1–12, typical month it runs
  location: string
  description: string
  tags: string[]         // lowercase keywords for matching
  url?: string           // official website (omitted where not confidently known)
}

const CATALOG: CatalogEntry[] = [
  // ── Insurance / Reinsurance ──
  { title: 'Monte Carlo Rendez-Vous de Septembre', month: 9, location: 'Monte Carlo, Monaco', description: 'The reinsurance industry’s flagship annual gathering.', tags: ['insurance', 'reinsurance', 'risk'], url: 'https://www.rvs-monte-carlo.com' },
  { title: 'Baden-Baden Reinsurance Meeting', month: 10, location: 'Baden-Baden, Germany', description: 'Major European reinsurance renewals meeting.', tags: ['insurance', 'reinsurance', 'risk'] },
  { title: 'ReFocus Conference', month: 3, location: 'Las Vegas, USA', description: 'Leading conference for the life insurance and reinsurance industry.', tags: ['insurance', 'reinsurance', 'life insurance'], url: 'https://www.refocusconference.com' },
  { title: 'InsureTech Connect (ITC Vegas)', month: 10, location: 'Las Vegas, USA', description: 'The world’s largest insurtech event.', tags: ['insurance', 'insurtech', 'technology'], url: 'https://vegas.insuretechconnect.com' },
  { title: 'RIMS RISKWORLD', month: 5, location: 'United States (varies)', description: 'Premier conference for risk management professionals.', tags: ['insurance', 'risk', 'risk management'], url: 'https://www.rims.org/riskworld' },
  { title: 'DIA (Digital Insurance Agenda)', month: 6, location: 'Munich, Germany', description: 'European stage for insurtech innovation.', tags: ['insurance', 'insurtech', 'technology'], url: 'https://www.diaglobal.com' },
  { title: 'LIMRA Annual Conference', month: 10, location: 'United States', description: 'Leadership conference for the life insurance and financial services industry.', tags: ['insurance', 'life insurance', 'finance'], url: 'https://www.limra.com' },
  { title: 'AHIP Conference', month: 6, location: 'United States', description: 'Top gathering for the health insurance industry.', tags: ['insurance', 'health insurance', 'healthcare'], url: 'https://www.ahip.org' },
  { title: 'WSIA Annual Marketplace', month: 9, location: 'United States', description: 'Wholesale, specialty & surplus lines insurance market.', tags: ['insurance', 'specialty insurance'], url: 'https://www.wsia.org' },
  { title: 'NAMIC Annual Convention', month: 9, location: 'United States', description: 'Convention for mutual property/casualty insurers.', tags: ['insurance', 'mutual insurance'], url: 'https://www.namic.org' },

  // ── Technology / Software / Startups ──
  { title: 'CES', month: 1, location: 'Las Vegas, USA', description: 'The global stage for consumer technology innovation.', tags: ['technology', 'consumer electronics', 'innovation'], url: 'https://www.ces.tech' },
  { title: 'Web Summit', month: 11, location: 'Lisbon, Portugal', description: 'One of the largest technology and startup conferences.', tags: ['technology', 'startups', 'venture'], url: 'https://websummit.com' },
  { title: 'SXSW', month: 3, location: 'Austin, USA', description: 'Convergence of tech, film, music and culture.', tags: ['technology', 'media', 'startups', 'culture'], url: 'https://www.sxsw.com' },
  { title: 'Collision', month: 6, location: 'Toronto, Canada', description: 'Fast-growing North American tech conference.', tags: ['technology', 'startups', 'venture'], url: 'https://collisionconf.com' },
  { title: 'TechCrunch Disrupt', month: 10, location: 'San Francisco, USA', description: 'Startup and venture capital flagship event.', tags: ['technology', 'startups', 'venture'], url: 'https://techcrunch.com/events' },
  { title: 'AWS re:Invent', month: 12, location: 'Las Vegas, USA', description: 'Amazon Web Services’ cloud computing conference.', tags: ['technology', 'cloud', 'software', 'it'], url: 'https://reinvent.awsevents.com' },
  { title: 'Google Cloud Next', month: 4, location: 'Las Vegas, USA', description: 'Google Cloud’s annual flagship conference.', tags: ['technology', 'cloud', 'software', 'it'], url: 'https://cloud.withgoogle.com/next' },
  { title: 'Microsoft Ignite', month: 11, location: 'United States', description: 'Microsoft’s conference for IT pros and developers.', tags: ['technology', 'cloud', 'software', 'it', 'enterprise'], url: 'https://ignite.microsoft.com' },
  { title: 'Dreamforce', month: 9, location: 'San Francisco, USA', description: 'Salesforce’s massive CRM, sales and SaaS event.', tags: ['software', 'saas', 'crm', 'sales', 'technology'], url: 'https://www.salesforce.com/dreamforce' },
  { title: 'SaaStr Annual', month: 9, location: 'San Francisco Bay Area, USA', description: 'The largest community of B2B SaaS founders and execs.', tags: ['saas', 'software', 'b2b', 'startups', 'sales'], url: 'https://www.saastrannual.com' },
  { title: 'Gartner IT Symposium/Xpo', month: 10, location: 'Orlando, USA', description: 'Conference for CIOs and senior IT leaders.', tags: ['technology', 'it', 'enterprise'], url: 'https://www.gartner.com/en/conferences' },

  // ── Finance / Fintech / Banking ──
  { title: 'Money20/20', month: 10, location: 'Las Vegas, USA', description: 'Premier global fintech and payments event.', tags: ['fintech', 'finance', 'payments', 'banking'], url: 'https://www.money2020.com' },
  { title: 'Sibos', month: 9, location: 'Global (varies)', description: 'Swift’s flagship banking and financial services event.', tags: ['finance', 'banking', 'payments', 'fintech'], url: 'https://www.sibos.com' },
  { title: 'World Economic Forum Annual Meeting (Davos)', month: 1, location: 'Davos, Switzerland', description: 'Global leaders on economics, policy and business.', tags: ['finance', 'economics', 'policy', 'investment'], url: 'https://www.weforum.org' },
  { title: 'Milken Institute Global Conference', month: 5, location: 'Los Angeles, USA', description: 'Influential gathering on finance, investment and ideas.', tags: ['finance', 'investment', 'economics'], url: 'https://milkeninstitute.org/events/global-conference' },

  // ── Marketing / Sales ──
  { title: 'INBOUND', month: 9, location: 'Boston, USA', description: 'HubSpot’s marketing, sales and customer-success event.', tags: ['marketing', 'sales', 'b2b'], url: 'https://www.inbound.com' },
  { title: 'Cannes Lions', month: 6, location: 'Cannes, France', description: 'The global festival of creativity and advertising.', tags: ['marketing', 'advertising', 'creative'], url: 'https://www.canneslions.com' },
  { title: 'Adobe Summit', month: 3, location: 'Las Vegas, USA', description: 'Digital experience and marketing conference.', tags: ['marketing', 'digital', 'technology'], url: 'https://summit.adobe.com' },

  // ── Healthcare / Biotech ──
  { title: 'HLTH', month: 10, location: 'Las Vegas, USA', description: 'Leading event on the future of healthcare.', tags: ['healthcare', 'health', 'health tech', 'medical'], url: 'https://www.hlth.com' },
  { title: 'HIMSS Global Health Conference', month: 3, location: 'United States', description: 'Major health information and technology conference.', tags: ['healthcare', 'health', 'health tech', 'it', 'medical'], url: 'https://www.himss.org/global-conference' },
  { title: 'J.P. Morgan Healthcare Conference', month: 1, location: 'San Francisco, USA', description: 'The healthcare industry’s biggest investment event.', tags: ['healthcare', 'biotech', 'investment', 'finance', 'medical'] },
  { title: 'BIO International Convention', month: 6, location: 'United States', description: 'The largest global biotechnology gathering.', tags: ['biotech', 'healthcare', 'pharma', 'medical'], url: 'https://www.bio.org/events/bio-international-convention' },

  // ── HR / People ──
  { title: 'HR Technology Conference & Expo', month: 9, location: 'Las Vegas, USA', description: 'The world’s leading HR technology event.', tags: ['hr', 'human resources', 'people', 'talent', 'technology'], url: 'https://www.hrtechnologyconference.com' },
  { title: 'SHRM Annual Conference', month: 6, location: 'United States', description: 'The largest HR professional conference.', tags: ['hr', 'human resources', 'people', 'talent'], url: 'https://www.shrm.org' },
]

function nextDateForMonth(month: number): string {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let year = now.getFullYear()
  if (new Date(year, month - 1, 1) < todayStart) year++
  return `${year}-${String(month).padStart(2, '0')}-01`
}

/** Keyword-match the user's interest against the catalog. Returns up to 8 events. */
export function searchCatalog(interest: string): ConferenceSuggestion[] {
  const tokens = interest.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 2)
  if (tokens.length === 0) return []

  return CATALOG
    .map((c) => {
      const hay = `${c.tags.join(' ')} ${c.title} ${c.description}`.toLowerCase()
      let score = 0
      for (const t of tokens) {
        if (c.tags.includes(t)) score += 3
        else if (c.tags.some((tag) => tag.includes(t) || t.includes(tag))) score += 2
        else if (hay.includes(t)) score += 1
      }
      return { c, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ c }) => ({
      title: c.title,
      date: nextDateForMonth(c.month),
      location: c.location,
      description: c.description,
      url: c.url,
    }))
}
