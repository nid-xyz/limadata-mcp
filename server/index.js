import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_BASE = 'https://api.limadata.com';
const API_KEY = process.env.LIMADATA_API_KEY;

if (!API_KEY) {
  console.error('LIMADATA_API_KEY environment variable is required');
  process.exit(1);
}

// --- HTTP helper ---

async function limadataRequest(method, path, { body, query } = {}) {
  const url = new URL(path, API_BASE);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
  }

  const opts = {
    method,
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  };

  if (body && method !== 'GET') {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);
  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    const creditsRemaining = res.headers.get('x-credits-remaining');
    const errorMsg = typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    throw new Error(`HTTP ${res.status}: ${errorMsg}${creditsRemaining ? ` (credits remaining: ${creditsRemaining})` : ''}`);
  }

  const creditsCost = res.headers.get('x-credits-cost');
  const creditsRemaining = res.headers.get('x-credits-remaining');

  return {
    data,
    credits: {
      cost: creditsCost,
      remaining: creditsRemaining,
    },
  };
}

function formatResult(result) {
  const { data, credits } = result;
  const output = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return `${output}\n\n---\nCredits used: ${credits.cost || 'N/A'} | Remaining: ${credits.remaining || 'N/A'}`;
}

// --- MCP Server ---

const server = new McpServer({
  name: 'limadata',
  version: '1.0.0',
  description: 'Limadata B2B data enrichment and intelligence API',
});

// =============================================
// ENRICH
// =============================================

server.tool(
  'enrich_person',
  'Enrich a person\'s professional profile using email, LinkedIn URL, or name+company. Returns work history, education, skills, social profiles, and company data. Credits: 1-5 depending on input.',
  {
    email: z.string().optional().describe('Person\'s email address'),
    linkedin_url: z.string().optional().describe('Person\'s LinkedIn URL'),
    name: z.string().optional().describe('Person\'s name (required for company lookup)'),
    company_name: z.string().optional().describe('Company name (use with name)'),
    company_domain: z.string().optional().describe('Company domain (use with name)'),
    include_work_email: z.boolean().optional().describe('Include work email (+1 credit if found)'),
    include_phone: z.boolean().optional().describe('Include phone numbers (+10 credits if found)'),
  },
  async (params) => {
    const body = Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null));
    const result = await limadataRequest('POST', '/api/v1/enrich/person', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'enrich_company',
  'Enrich a company profile using domain or LinkedIn URL. Returns firmographics, funding, social profiles, tech stack, traffic, revenue, and more. Credits: 1.',
  {
    domain: z.string().optional().describe('Company domain (e.g. microsoft.com)'),
    linkedin_url: z.string().optional().describe('Company LinkedIn URL'),
  },
  async (params) => {
    const body = Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null));
    const result = await limadataRequest('POST', '/api/v1/enrich/company', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

// =============================================
// PERSON & COMPANY PROFILES
// =============================================

server.tool(
  'get_person',
  'Get person data from LinkedIn profile URL. Returns live or cached data. Credits: 1 (standard) or 3 (live).',
  {
    url: z.string().describe('LinkedIn profile URL'),
    live: z.boolean().optional().describe('Force fresh lookup (costs 3 credits)'),
  },
  async ({ url, live }) => {
    const result = await limadataRequest('GET', '/api/v1/person', { query: { url, live } });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'get_company',
  'Get company data from LinkedIn company URL. Returns live or cached data. Credits: 1 (standard) or 3 (live).',
  {
    url: z.string().describe('LinkedIn company URL'),
    live: z.boolean().optional().describe('Force fresh lookup (costs 3 credits)'),
  },
  async ({ url, live }) => {
    const result = await limadataRequest('GET', '/api/v1/company', { query: { url, live } });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'get_company_insights',
  'Get company insights from Crunchbase (funding rounds, acquisitions, etc). Credits: 1.',
  {
    identifier: z.string().optional().describe('Crunchbase identifier (e.g. "amazon" from crunchbase.com/organization/amazon)'),
    domain: z.string().optional().describe('Company domain (e.g. amazon.com)'),
  },
  async ({ identifier, domain }) => {
    const result = await limadataRequest('GET', '/api/v1/company/insights', { query: { identifier, domain } });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

// =============================================
// FIND (Contact Discovery)
// =============================================

server.tool(
  'find_work_email',
  'Find a person\'s work email using their name and company domain. Credits: 1.',
  {
    full_name: z.string().describe('Person\'s full name'),
    company_domain: z.string().describe('Company domain (e.g. microsoft.com)'),
  },
  async (params) => {
    const result = await limadataRequest('POST', '/api/v1/find/email_work', { body: params });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'find_work_email_linkedin',
  'Find a person\'s work email from their LinkedIn URL. Credits: 1.',
  {
    linkedin_url: z.string().describe('Person\'s LinkedIn profile URL'),
  },
  async (params) => {
    const result = await limadataRequest('POST', '/api/v1/find/email_work_linkedin', { body: params });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'find_personal_email',
  'Find a person\'s personal email from LinkedIn, GitHub, X URL, or work email. Credits: 5.',
  {
    linkedin_url: z.string().optional().describe('Person\'s LinkedIn URL'),
    github_url: z.string().optional().describe('Person\'s GitHub URL'),
    x_url: z.string().optional().describe('Person\'s X/Twitter URL'),
    work_email: z.string().optional().describe('Person\'s work email'),
  },
  async (params) => {
    const body = Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null));
    const result = await limadataRequest('POST', '/api/v1/find/email_personal', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'find_phone',
  'Find a person\'s phone number using LinkedIn URL or name+company. Credits: 10.',
  {
    linkedin_url: z.string().optional().describe('Person\'s LinkedIn URL'),
    name: z.string().optional().describe('Person\'s name'),
    company_name: z.string().optional().describe('Company name'),
    company_domain: z.string().optional().describe('Company domain'),
  },
  async (params) => {
    const body = Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null));
    const result = await limadataRequest('POST', '/api/v1/find/phone', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'find_company_linkedin',
  'Find a company\'s LinkedIn page URL from their domain. Credits: 1.',
  {
    domain: z.string().describe('Company domain (e.g. microsoft.com)'),
  },
  async (params) => {
    const result = await limadataRequest('POST', '/api/v1/find/pages_company', { body: params });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'find_identity_resolution',
  'Resolve a person\'s social profiles (LinkedIn, etc) from name and company info. Credits: 1.',
  {
    full_name: z.string().describe('Person\'s full name'),
    company_name: z.string().optional().describe('Company name'),
    company_domain: z.string().optional().describe('Company domain'),
    email: z.string().optional().describe('Person\'s business email'),
  },
  async (params) => {
    const body = Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null));
    const result = await limadataRequest('POST', '/api/v1/find/profiles_person', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'find_reverse_email',
  'Reverse lookup a person from their email address. Find LinkedIn/X profiles from email. Credits: 1.',
  {
    email: z.string().describe('Person\'s email address'),
    require_linkedin: z.boolean().optional().describe('Require LinkedIn profile to be found'),
    require_x: z.boolean().optional().describe('Require X profile to be found'),
  },
  async (params) => {
    const body = Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null));
    const result = await limadataRequest('POST', '/api/v1/find/reverse_email_lookup', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'find_hashed_emails',
  'Get hashed email identifiers (SHA256) for ad platform audience matching. Credits: 1.',
  {
    linkedin_url: z.string().optional().describe('Person\'s LinkedIn URL'),
    work_email: z.string().optional().describe('Person\'s work email'),
  },
  async (params) => {
    const body = Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null));
    const result = await limadataRequest('POST', '/api/v1/find/audience_identifiers', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'find_glassdoor_company',
  'Find a company\'s Glassdoor ID from their domain. Use this ID for workplace ratings/benefits.',
  {
    domain: z.string().describe('Company domain (e.g. microsoft.com)'),
  },
  async (params) => {
    const result = await limadataRequest('POST', '/api/v1/find/glassdoor_company', { body: params });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

// =============================================
// SEARCH
// =============================================

server.tool(
  'search_people',
  'Search for people on LinkedIn by keywords, title, company, location, industry. Credits: 1.',
  {
    query: z.string().describe('Search keywords (e.g. "Software Engineer")'),
    page: z.number().optional().describe('Page number (1-100)'),
    title: z.string().optional().describe('Filter by job title keywords'),
    company: z.string().optional().describe('Filter by company name'),
    first_name: z.string().optional().describe('Filter by first name'),
    last_name: z.string().optional().describe('Filter by last name'),
    location_list: z.string().optional().describe('Comma-separated location IDs'),
    current_company_list: z.string().optional().describe('Comma-separated LinkedIn company IDs'),
    past_company_list: z.string().optional().describe('Comma-separated LinkedIn company IDs'),
    industry_list: z.string().optional().describe('Comma-separated LinkedIn industry IDs'),
  },
  async (params) => {
    const body = Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null));
    const result = await limadataRequest('POST', '/api/v1/search/people', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'search_companies',
  'Search for companies on LinkedIn by keywords, size, location, industry. Credits: 1.',
  {
    query: z.string().describe('Search keywords (e.g. "Microsoft")'),
    page: z.number().optional().describe('Page number (1-100)'),
    company_size: z.string().optional().describe('Size filter: A=1-10, B=11-50, C=51-200, D=201-500, E=501-1000, F=1001-5000, G=5001-10000, H=10001+'),
    has_jobs: z.boolean().optional().describe('Filter for companies currently hiring'),
    location_list: z.string().optional().describe('Comma-separated location IDs'),
    industry_list: z.string().optional().describe('Comma-separated LinkedIn industry IDs'),
  },
  async (params) => {
    const body = Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null));
    const result = await limadataRequest('POST', '/api/v1/search/companies', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'search_jobs',
  'Search for job postings by keywords with filters for location, experience, type, workplace. Credits: 1.',
  {
    query: z.string().describe('Search keywords (e.g. "Software Engineer")'),
    page: z.number().optional().describe('Page number (1-100)'),
    location_id: z.string().optional().describe('Location ID'),
    easy_apply: z.boolean().optional().describe('Easy apply jobs only'),
    experience: z.string().optional().describe('Experience: 1=Internship, 2=Entry, 3=Associate, 4=Mid-Senior, 5=Director, 6=Executive'),
    job_type: z.string().optional().describe('Type: F=Full-time, P=Part-time, C=Contract, T=Temp, V=Volunteer, I=Internship'),
    posted_ago: z.string().optional().describe('Posted within seconds (e.g. 604800 = 7 days)'),
    workplace_type: z.string().optional().describe('1=On-Site, 2=Remote, 3=Hybrid'),
    sort_by: z.string().optional().describe('Sort criteria'),
    company_ids: z.string().optional().describe('Comma-separated LinkedIn company IDs'),
    industry_ids: z.string().optional().describe('Comma-separated industry IDs'),
    function_ids: z.string().optional().describe('Comma-separated function IDs'),
    title_ids: z.string().optional().describe('Comma-separated title IDs'),
    location_ids: z.string().optional().describe('Comma-separated location IDs'),
  },
  async (params) => {
    const body = Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null));
    const result = await limadataRequest('POST', '/api/v1/search/jobs', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'search_posts',
  'Search LinkedIn posts by keywords with filters for author, content type, mentions. Credits: 1.',
  {
    query: z.string().describe('Search keywords'),
    page: z.number().optional().describe('Page number (1-100)'),
    sort_by_latest: z.boolean().optional().describe('Sort by latest (default: most relevant)'),
    author_job_title: z.string().optional().describe('Filter by author job title'),
    content_type: z.string().optional().describe('photos, videos, liveVideos, collaborativeArticles, documents'),
    from_member: z.string().optional().describe('Comma-separated LinkedIn member URNs'),
    from_organization: z.string().optional().describe('Comma-separated LinkedIn org IDs'),
    author_company: z.string().optional().describe('Comma-separated company IDs'),
    author_industry: z.string().optional().describe('Comma-separated industry URNs'),
    mentions_member: z.string().optional().describe('Comma-separated member URNs mentioned'),
    mentions_organization: z.string().optional().describe('Comma-separated org IDs mentioned'),
  },
  async (params) => {
    const body = Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null));
    const result = await limadataRequest('POST', '/api/v1/search/posts', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'search_web',
  'Semantic web search with cited results. Credits: 1.',
  {
    query: z.string().describe('Search query'),
    page: z.number().optional().describe('Page number'),
  },
  async (params) => {
    const body = Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null));
    const result = await limadataRequest('POST', '/api/v1/search/web', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

// =============================================
// RESEARCH
// =============================================

server.tool(
  'ai_search',
  'AI-powered search that returns sourced answers, search results, or structured data. Credits: 5.',
  {
    query: z.string().describe('Research query'),
    output_type: z.enum(['SearchResults', 'SourcedAnswer', 'Structured']).optional().describe('Output format'),
  },
  async (params) => {
    const body = Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null));
    const result = await limadataRequest('POST', '/api/v1/research/search', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'extract',
  'Extract structured content from web pages (1-10 URLs). Returns markdown text, optionally with links and images. Credits: 1 per URL.',
  {
    urls: z.array(z.string()).describe('URLs to extract (1-10)'),
    include_links: z.boolean().optional().describe('Extract link URLs from pages'),
    include_images: z.boolean().optional().describe('Extract image URLs from pages'),
  },
  async (params) => {
    const body = Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null));
    const result = await limadataRequest('POST', '/api/v1/research/extract', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

// =============================================
// PROSPECT
// =============================================

server.tool(
  'prospect_people_filter',
  'Find people using advanced filters (company, title, location, seniority, etc). Credits: 3 per page.',
  {
    filters: z.array(z.object({
      filter_type: z.string().describe('Filter type (e.g. company, current_title, location, seniority)'),
      operator: z.string().optional().describe('Operator (e.g. "in", "between")'),
      values: z.array(z.string()).optional().describe('Filter values'),
      range_value: z.object({
        sub_filter: z.string().optional(),
        min: z.number().optional(),
        max: z.number().optional(),
      }).optional().describe('Range value for between operator'),
    })).describe('Array of filters'),
    page: z.number().optional().describe('Page number (1-100)'),
    settings_match_all_company_urls: z.boolean().optional().describe('Require all company URLs to be valid'),
  },
  async (params) => {
    const body = Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null));
    const result = await limadataRequest('POST', '/api/v2/prospect/live/people/filter', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'prospect_companies_filter',
  'Find companies using advanced filters (revenue, industry, headcount, HQ location). Credits: 3 per page.',
  {
    filters: z.array(z.object({
      filter_type: z.string().describe('Filter type (e.g. annual_revenue, industry, company_headcount, company_headquarters)'),
      operator: z.string().optional().describe('Operator (e.g. "in", "between")'),
      values: z.array(z.string()).optional().describe('Filter values'),
      range_value: z.object({
        sub_filter: z.string().optional(),
        min: z.number().optional(),
        max: z.number().optional(),
      }).optional().describe('Range value for between operator'),
    })).describe('Array of filters'),
    page: z.number().optional().describe('Page number (1-60)'),
  },
  async (params) => {
    const body = Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null));
    const result = await limadataRequest('POST', '/api/v2/prospect/live/companies/filter', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'prospect_employees',
  'Find employees at a specific company with filters for title, location, seniority, keywords. Credits: 3 per page.',
  {
    url: z.string().describe('LinkedIn company URL (e.g. https://www.linkedin.com/company/microsoft)'),
    keyword: z.string().optional().describe('Keyword filter'),
    titles: z.array(z.string()).optional().describe('Filter by titles'),
    locations: z.array(z.string()).optional().describe('Filter by locations'),
    seniorities: z.array(z.string()).optional().describe('Filter by seniority levels'),
    recently_changed_jobs: z.boolean().optional().describe('Filter by recent job changes'),
    page: z.number().optional().describe('Page number (1-100)'),
  },
  async (params) => {
    const body = Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null));
    const result = await limadataRequest('POST', '/api/v2/prospect/live/people/employees', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'prospect_people_by_url',
  'Prospect people using a LinkedIn Sales Navigator search URL. Credits: 3 per page.',
  {
    search_url: z.string().describe('LinkedIn Sales Navigator people search URL'),
    page: z.number().optional().describe('Page number (1-100)'),
  },
  async (params) => {
    const result = await limadataRequest('POST', '/api/v1/prospect/live/people/search_url', { body: params });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'prospect_companies_by_url',
  'Prospect companies using a LinkedIn Sales Navigator search URL. Credits: 3 per page.',
  {
    search_url: z.string().describe('LinkedIn Sales Navigator company search URL'),
    page: z.number().optional().describe('Page number (1-60)'),
  },
  async (params) => {
    const result = await limadataRequest('POST', '/api/v2/prospect/live/companies/search_url', { body: params });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

// =============================================
// JOBS
// =============================================

server.tool(
  'get_company_jobs',
  'Get job postings for a company from their LinkedIn page. Credits: 1.',
  {
    url: z.string().describe('LinkedIn company URL'),
    page: z.number().optional().describe('Page number'),
  },
  async ({ url, page }) => {
    const result = await limadataRequest('GET', '/api/v1/jobs', { query: { url, page } });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'get_job_details',
  'Get full details of a specific job posting. Credits: 1.',
  {
    id: z.string().describe('LinkedIn Job ID (from URL, e.g. 3996439038)'),
  },
  async ({ id }) => {
    const result = await limadataRequest('GET', '/api/v1/jobs/details', { query: { id } });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

// =============================================
// POSTS
// =============================================

server.tool(
  'get_posts',
  'Get LinkedIn posts for a person or company. Credits: 1.',
  {
    url: z.string().describe('LinkedIn person or company URL'),
    pagination_token: z.string().optional().describe('Pagination token from previous response'),
  },
  async ({ url, pagination_token }) => {
    const result = await limadataRequest('GET', '/api/v1/posts', { query: { url, pagination_token } });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'get_post_details',
  'Get full details of a specific LinkedIn post. Credits: 1.',
  {
    url: z.string().describe('LinkedIn post URL'),
  },
  async ({ url }) => {
    const result = await limadataRequest('GET', '/api/v1/posts/details', { query: { url } });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'get_post_comments',
  'Get comments on a LinkedIn post. Credits: 1.',
  {
    comments_urn: z.string().describe('Comments URN from post data'),
    page: z.number().optional().describe('Page number'),
  },
  async ({ comments_urn, page }) => {
    const result = await limadataRequest('GET', '/api/v1/posts/comments', { query: { comments_urn, page } });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'get_post_reactions',
  'Get reactions on a LinkedIn post. Credits: 1.',
  {
    reactions_urn: z.string().describe('Reactions URN from post data'),
    page: z.number().optional().describe('Page number'),
  },
  async ({ reactions_urn, page }) => {
    const result = await limadataRequest('GET', '/api/v1/posts/reactions', { query: { reactions_urn, page } });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

// =============================================
// WATCH (Webhooks)
// =============================================

server.tool(
  'create_watch',
  'Create a watch subscription to monitor people/companies for changes (job changes, promotions, etc). Sends webhook notifications.',
  {
    name: z.string().describe('Name of the watch'),
    type: z.string().describe('Watch type (e.g. PersonJobChanges)'),
    notification_url: z.string().describe('Webhook URL for notifications'),
    frequency_days: z.number().describe('Check frequency in days (1-60)'),
    people_urls: z.array(z.string()).optional().describe('LinkedIn people URLs to monitor'),
    company_urls: z.array(z.string()).optional().describe('LinkedIn company URLs to monitor'),
    external_id: z.string().optional().describe('External identifier for integration'),
  },
  async ({ name, type, notification_url, frequency_days, people_urls, company_urls, external_id }) => {
    const body = {
      name,
      type,
      notification_url,
      frequency_days,
      settings: (people_urls || company_urls) ? { people_urls, company_urls } : undefined,
      external_id,
    };
    const result = await limadataRequest('POST', '/api/v1/watch', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'list_watches',
  'List all watch subscriptions.',
  {
    page: z.number().optional().describe('Page number'),
  },
  async ({ page }) => {
    const result = await limadataRequest('GET', '/api/v1/watch', { query: { page } });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'get_watch',
  'Get a specific watch subscription by ID.',
  {
    id: z.number().describe('Watch subscription ID'),
  },
  async ({ id }) => {
    const result = await limadataRequest('GET', `/api/v1/watch/${id}`);
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'update_watch',
  'Update a watch subscription (name, URL, frequency, active status).',
  {
    id: z.number().describe('Watch subscription ID'),
    name: z.string().optional().describe('New name'),
    notification_url: z.string().optional().describe('New webhook URL'),
    frequency_days: z.number().optional().describe('New frequency in days'),
    is_active: z.boolean().optional().describe('Enable/disable the watch'),
    external_id: z.string().optional().describe('External identifier'),
  },
  async ({ id, ...body }) => {
    const cleanBody = Object.fromEntries(Object.entries(body).filter(([_, v]) => v != null));
    const result = await limadataRequest('PUT', `/api/v1/watch/${id}`, { body: cleanBody });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'mock_watch_payload',
  'Get a mock webhook payload for testing watch integrations.',
  {
    type: z.string().describe('Watch type to generate mock payload for'),
  },
  async ({ type }) => {
    const result = await limadataRequest('GET', '/api/v1/watch/mock_payload', { query: { type } });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

// =============================================
// WORKPLACE
// =============================================

server.tool(
  'get_workplace_benefits',
  'Get workplace benefits data from Glassdoor. Use find_glassdoor_company first to get the ID.',
  {
    glassdoor_id: z.number().describe('Glassdoor company ID'),
  },
  async ({ glassdoor_id }) => {
    const result = await limadataRequest('GET', '/api/v1/company/workplace_benefits', { query: { glassdoor_id } });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'get_workplace_ratings',
  'Get workplace ratings data from Glassdoor. Use find_glassdoor_company first to get the ID.',
  {
    glassdoor_id: z.number().describe('Glassdoor company ID'),
  },
  async ({ glassdoor_id }) => {
    const result = await limadataRequest('GET', '/api/v1/company/workplace_ratings', { query: { glassdoor_id } });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

// =============================================
// BATCH OPERATIONS
// =============================================

server.tool(
  'batch_people',
  'Start a batch operation to retrieve multiple people profiles by LinkedIn URLs.',
  {
    urls: z.array(z.string()).describe('LinkedIn profile URLs'),
    name: z.string().optional().describe('Batch operation name'),
    notification_url: z.string().optional().describe('Webhook URL for completion notification'),
  },
  async (params) => {
    const body = Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null));
    const result = await limadataRequest('POST', '/api/v2/batch/people', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'batch_companies',
  'Start a batch operation to retrieve multiple company profiles by LinkedIn URLs.',
  {
    urls: z.array(z.string()).describe('LinkedIn company URLs'),
    name: z.string().optional().describe('Batch operation name'),
    notification_url: z.string().optional().describe('Webhook URL for completion notification'),
  },
  async (params) => {
    const body = Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null));
    const result = await limadataRequest('POST', '/api/v2/batch/companies', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'batch_prospect_people',
  'Start a batch prospect operation to find people matching filters.',
  {
    filters: z.array(z.object({
      filter_type: z.string(),
      operator: z.string().optional(),
      values: z.array(z.string()).optional(),
      range_value: z.object({
        sub_filter: z.string().optional(),
        min: z.number().optional(),
        max: z.number().optional(),
      }).optional(),
    })).describe('Prospect filters'),
    name: z.string().optional().describe('Batch operation name'),
    entity_count: z.number().optional().describe('Number of results to retrieve'),
    notification_url: z.string().optional().describe('Webhook URL for completion notification'),
  },
  async (params) => {
    const body = Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null));
    const result = await limadataRequest('POST', '/api/v2/batch/prospect-people', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'batch_prospect_companies',
  'Start a batch prospect operation to find companies matching filters.',
  {
    filters: z.array(z.object({
      filter_type: z.string(),
      operator: z.string().optional(),
      values: z.array(z.string()).optional(),
      range_value: z.object({
        sub_filter: z.string().optional(),
        min: z.number().optional(),
        max: z.number().optional(),
      }).optional(),
    })).describe('Prospect filters'),
    name: z.string().optional().describe('Batch operation name'),
    entity_count: z.number().optional().describe('Number of results to retrieve'),
    notification_url: z.string().optional().describe('Webhook URL for completion notification'),
  },
  async (params) => {
    const body = Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null));
    const result = await limadataRequest('POST', '/api/v2/batch/prospect-companies', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'batch_list',
  'List all batch operations.',
  {
    page: z.number().optional().describe('Page number'),
  },
  async ({ page }) => {
    const result = await limadataRequest('GET', '/api/v2/batch/list', { query: { page } });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

server.tool(
  'batch_results',
  'Get results of a batch operation.',
  {
    batch_id: z.number().describe('Batch operation ID'),
    page: z.number().optional().describe('Page number'),
  },
  async ({ batch_id, page }) => {
    const result = await limadataRequest('GET', '/api/v2/batch/results', { query: { batch_id, page } });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

// =============================================
// REFERENCES
// =============================================

server.tool(
  'autocomplete',
  'Get autocomplete suggestions for filter values (e.g. company_headcount, industry, location, seniority). Free.',
  {
    filter_type: z.string().describe('Filter type to autocomplete (e.g. company_headcount, industry, location)'),
    query: z.string().optional().describe('Search query for suggestions'),
  },
  async (params) => {
    const body = Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null));
    const result = await limadataRequest('POST', '/api/v1/references/autocomplete', { body });
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

// =============================================
// CREDITS
// =============================================

server.tool(
  'credits_balance',
  'Check your current Limadata credits balance.',
  {},
  async () => {
    const result = await limadataRequest('GET', '/api/v1/credits/balance');
    return { content: [{ type: 'text', text: formatResult(result) }] };
  }
);

// --- Start server ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Failed to start Limadata MCP server:', err);
  process.exit(1);
});
