#!/usr/bin/env node

/**
 * x402-buyer-mcp — The Universal x402 Buyer Agent
 * 
 * An MCP server that lets Claude Desktop, Cursor, or Claude Code users
 * discover, pay for, and call x402 endpoints automatically.
 * 
 * Tools:
 *   x402_discover  — Find x402 endpoints matching a query
 *   x402_call      — Call any x402 endpoint with automatic payment
 *   x402_balance   — Check your AgentCash wallet balance
 *   x402_research  — Multi-endpoint intelligence research (3-5 endpoints in parallel)
 * 
 * Payment handled via AgentCash (agentcash.dev).
 * 
 * @author  Alderpost LLC — Wisconsin
 * @license MIT
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const VERSION = '1.0.3';
const AGENTCASH_TIMEOUT_MS = 30000;
const MAX_PARALLEL_CALLS = 5;

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

const REGISTRY = [
  {
    url: 'https://www.alderpost.co/api/domain-shield',
    name: 'Domain Shield',
    provider: 'Alderpost',
    description: 'Domain security scan with VirusTotal malware detection. SPF, DKIM, DMARC, SSL, MX, DNSSEC + malware scan from 70+ antivirus engines. Scored 0-100.',
    price: 0.12,
    input: { param: 'domain', type: 'domain', example: 'stripe.com' },
    tags: ['security', 'domain', 'dns', 'ssl', 'malware', 'virustotal', 'email-auth', 'phishing'],
    featured: true,
  },
  {
    url: 'https://www.alderpost.co/api/company-xray',
    name: 'Company X-Ray',
    provider: 'Alderpost',
    description: 'Company intelligence with People Data Labs enrichment. Tech stack, infrastructure, social presence + industry, employee count, revenue estimate, founded year, HQ location, LinkedIn URL.',
    price: 0.15,
    input: { param: 'domain', type: 'domain', example: 'hubspot.com' },
    tags: ['company', 'business', 'firmographics', 'tech-stack', 'revenue', 'employees', 'pdl', 'enrichment'],
    featured: true,
  },
  {
    url: 'https://www.alderpost.co/api/threat-pulse',
    name: 'Threat Pulse',
    provider: 'Alderpost',
    description: 'Threat intelligence with VirusTotal + AbuseIPDB. Blacklists, reverse DNS, open ports, SSL, email security + malware detection + IP abuse reports from 30K+ community reporters.',
    price: 0.10,
    input: { param: 'target', type: 'ip_or_domain', example: '8.8.8.8' },
    tags: ['security', 'threat', 'ip', 'malware', 'abuse', 'blacklist', 'ports', 'virustotal', 'abuseipdb'],
    featured: true,
  },
  {
    url: 'https://www.alderpost.co/api/prospect-iq',
    name: 'Prospect IQ',
    provider: 'Alderpost',
    description: 'Sales intelligence with Hunter.io verified emails. Web presence, tech stack, social signals + verified email addresses with names, positions, and email patterns.',
    price: 0.12,
    input: { param: 'domain', type: 'domain', example: 'hubspot.com' },
    tags: ['sales', 'leads', 'email', 'contacts', 'hunter', 'prospecting', 'outreach'],
    featured: true,
  },
  {
    url: 'https://www.alderpost.co/api/compliance-check',
    name: 'Compliance Check',
    provider: 'Alderpost',
    description: 'IT compliance audit with Qualys SSL Labs grade. Email auth, SSL posture, HTTP security headers, cookies, privacy, DNSSEC, hosting + industry-standard A+ to F grade.',
    price: 0.15,
    input: { param: 'domain', type: 'domain', example: 'stripe.com' },
    tags: ['compliance', 'audit', 'ssl-labs', 'security-headers', 'cookies', 'privacy', 'owasp'],
    featured: true,
  },
  {
    url: 'https://www.alderpost.co/api/health-signal',
    name: 'Health Signal',
    provider: 'Alderpost',
    description: 'Health intelligence with NIH RxNorm drug interactions. FDA drug labels, adverse events, recalls, nutrition data + drug-to-drug interaction checking with severity ratings.',
    price: 0.10,
    input: { param: 'query', type: 'drug_or_food', example: 'ibuprofen' },
    tags: ['health', 'drug', 'fda', 'interactions', 'nutrition', 'recalls', 'rxnorm', 'medical'],
    featured: true,
  },
  {
    url: 'https://www.alderpost.co/api/property-intel',
    name: 'Property Intel',
    provider: 'Alderpost',
    description: 'Location intelligence with Census demographics and weather. Geocoding, amenities, schools, elevation + median income, population, home values, and current weather.',
    price: 0.10,
    input: { param: 'address', type: 'address', example: '123 Main St Milwaukee WI' },
    tags: ['property', 'location', 'demographics', 'census', 'weather', 'amenities', 'schools', 'real-estate'],
    featured: true,
  },
  {
    url: 'https://www.alderpost.co/api/sports-edge',
    name: 'Sports Edge',
    provider: 'Alderpost',
    description: 'Pre-game sports intelligence with AI analysis and betting odds. ESPN standings, team stats, Claude AI analysis + odds from 15+ bookmakers and game-day weather.',
    price: 0.12,
    input: { param: 'sport', type: 'sport', example: 'nba' },
    tags: ['sports', 'betting', 'odds', 'nba', 'nfl', 'mlb', 'nhl', 'ai-analysis'],
    featured: true,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// DISCOVERY ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

function scoreEndpoint(endpoint, query) {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/).filter(w => w.length > 2);
  let score = 0;

  for (const tag of endpoint.tags) {
    if (q.includes(tag)) score += 10;
    for (const word of words) {
      if (tag.includes(word) || word.includes(tag)) score += 5;
    }
  }

  const nameLower = endpoint.name.toLowerCase();
  if (nameLower.includes(q)) score += 15;
  for (const word of words) {
    if (nameLower.includes(word)) score += 8;
  }

  const descLower = endpoint.description.toLowerCase();
  for (const word of words) {
    if (descLower.includes(word)) score += 3;
  }

  if (endpoint.featured) score += 2;
  return score;
}

function searchRegistry(query) {
  return REGISTRY
    .map(ep => ({ ...ep, relevance: scoreEndpoint(ep, query) }))
    .filter(ep => ep.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance);
}

function detectInputType(subject) {
  const s = subject.trim();
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s)) return 'ip_or_domain';
  if (/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(s)) return 'domain';
  if (/\d+.*[a-zA-Z]+.*[a-zA-Z]{2,}/.test(s) && s.includes(' ')) return 'address';
  if (/^(nba|nfl|mlb|nhl|mls|epl|soccer|basketball|football|baseball|hockey)$/i.test(s)) return 'sport';
  if (s.length < 50) return 'drug_or_food';
  return 'unknown';
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENTCASH INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

async function agentcashExec(args) {
  try {
    const { stdout, stderr } = await execAsync(
      `npx -y agentcash ${args}`,
      { timeout: AGENTCASH_TIMEOUT_MS, maxBuffer: 1024 * 1024 }
    );
    const text = stdout.trim();
    if (!text) return { success: false, error: 'Empty response from AgentCash' };
    try {
      return { success: true, data: JSON.parse(text) };
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return { success: true, data: JSON.parse(jsonMatch[0]) };
      return { success: true, data: { raw: text } };
    }
  } catch (err) {
    const msg = (err.stderr || err.message || 'Unknown error').toString();
    if (msg.includes('INSUFFICIENT_BALANCE')) {
      return { success: false, error: 'Insufficient USDC balance. Fund your wallet at https://agentcash.dev/deposit' };
    }
    if (msg.includes('ENOENT') || msg.includes('not found') || msg.includes('not recognized')) {
      return { success: false, error: 'AgentCash not found. Set up at https://agentcash.dev then run: npx agentcash install' };
    }
    return { success: false, error: `AgentCash error: ${msg.slice(0, 300)}` };
  }
}

async function callX402Endpoint(url) {
  return agentcashExec(`fetch "${url}" -m GET --format json`);
}

async function getBalance() {
  return agentcashExec('balance --format json');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

const TOOLS = [
  {
    name: 'x402_discover',
    description: `Search for x402 paid API endpoints that can answer a question or provide data.

Searches a curated registry of premium x402 endpoints backed by paid data sources 
(VirusTotal, People Data Labs, Hunter.io, AbuseIPDB, Qualys SSL Labs, NIH RxNorm, 
US Census Bureau, OpenWeather, The Odds API).

Categories: security, company/business, threat intelligence, sales/leads, compliance, 
health/drug, property/location, sports.

Examples:
  - query "domain security" → finds Domain Shield (VirusTotal + DNS)
  - query "company information" → finds Company X-Ray (People Data Labs)
  - query "email contacts" → finds Prospect IQ (Hunter.io)
  - query "drug interactions" → finds Health Signal (NIH RxNorm)

Use x402_call to call any discovered endpoint.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What data do you need? E.g. "domain security", "company revenue", "drug interactions"',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'x402_call',
    description: `Call any x402 paid API endpoint with automatic USDC payment via AgentCash.

Accepts a full URL with query parameters. Handles the complete x402 payment flow:
  1. Sends request → receives 402 payment requirement
  2. Signs USDC payment on Base via AgentCash wallet
  3. Retries with payment proof → returns endpoint data

Requires AgentCash wallet to be set up and funded (https://agentcash.dev).

Examples:
  - url: "https://www.alderpost.co/api/domain-shield?domain=stripe.com"
  - url: "https://www.alderpost.co/api/company-xray?domain=hubspot.com"
  - url: "https://www.alderpost.co/api/health-signal?query=ibuprofen"
  - url: "https://www.alderpost.co/api/property-intel?address=123+Main+St+Milwaukee+WI"`,
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Full endpoint URL with query parameters',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'x402_balance',
    description: `Check your AgentCash USDC wallet balance on Base.

Returns current balance available for x402 payments and approximate number of 
calls you can afford. No parameters required.

If AgentCash is not set up, provides instructions to create and fund a wallet.`,
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'x402_research',
    description: `Run comprehensive research by calling multiple x402 endpoints in parallel.

Given a subject (domain, IP, address, drug name, or sport), this tool:
  1. Detects the input type automatically
  2. Finds all relevant x402 endpoints
  3. Calls up to 5 endpoints simultaneously with automatic payment
  4. Returns all results combined for synthesis

This is the fastest way to get a complete intelligence picture on any subject.

Input types (auto-detected):
  - Domain "stripe.com" → calls security + company + threat + compliance + sales (~$0.64)
  - IP "8.8.8.8" → calls threat intelligence (~$0.10)
  - Address "123 Main St Milwaukee WI" → calls property/location (~$0.10)
  - Drug "ibuprofen" → calls health intelligence (~$0.10)
  - Sport "nba" → calls sports intelligence (~$0.12)

Set max_cost to control budget per research call (default: $1.00).`,
    inputSchema: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'The subject to research: domain, IP, address, drug name, or sport',
        },
        max_cost: {
          type: 'number',
          description: 'Maximum total cost in USD (default: 1.00). Cheapest endpoints called first.',
        },
      },
      required: ['subject'],
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

async function handleDiscover(args) {
  const query = args.query;
  if (!query || query.length < 2) {
    return { content: [{ type: 'text', text: 'Query must be at least 2 characters.' }], isError: true };
  }

  const results = searchRegistry(query);

  if (results.length === 0) {
    return {
      content: [{
        type: 'text',
        text: 'No x402 endpoints found matching your query. Try broader terms like "security", "company", "health", or "location".',
      }],
    };
  }

  const lines = [`Found ${results.length} x402 endpoint(s):\n`];
  for (const ep of results) {
    lines.push(`**${ep.name}** — $${ep.price.toFixed(2)}/call`);
    lines.push(`  ${ep.description}`);
    lines.push(`  URL: ${ep.url}?${ep.input.param}=${ep.input.example}`);
    lines.push(`  Provider: ${ep.provider}${ep.featured ? ' ★' : ''}`);
    lines.push('');
  }
  lines.push('Use x402_call with the full URL to call any endpoint.');

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

async function handleCall(args) {
  const url = args.url;
  if (!url || !url.startsWith('http')) {
    return { content: [{ type: 'text', text: 'Invalid URL. Provide a full URL like https://www.alderpost.co/api/domain-shield?domain=stripe.com' }], isError: true };
  }

  const result = await callX402Endpoint(url);

  if (!result.success) {
    return { content: [{ type: 'text', text: `Call failed: ${result.error}` }], isError: true };
  }

  const text = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
  return { content: [{ type: 'text', text }] };
}

async function handleBalance() {
  const result = await getBalance();

  if (!result.success) {
    return {
      content: [{
        type: 'text',
        text: `Could not check balance: ${result.error}\n\nTo set up AgentCash:\n1. Run: npx agentcash install\n2. Fund at https://agentcash.dev/deposit`,
      }],
      isError: true,
    };
  }

  const balance = result.data.balance ?? result.data.raw ?? 'unknown';
  const numBalance = Number(balance);
  const callEstimate = isNaN(numBalance) ? '?' : Math.floor(numBalance / 0.12);

  return {
    content: [{
      type: 'text',
      text: `AgentCash balance: $${balance} USDC on Base\nApproximately ${callEstimate} calls at $0.12/call.`,
    }],
  };
}

async function handleResearch(args) {
  const subject = args.subject;
  const budget = args.max_cost ?? 1.00;

  if (!subject || subject.length < 2) {
    return { content: [{ type: 'text', text: 'Subject must be at least 2 characters.' }], isError: true };
  }

  const inputType = detectInputType(subject);

  if (inputType === 'unknown') {
    return {
      content: [{
        type: 'text',
        text: `Could not determine the type of "${subject}". Provide a domain (stripe.com), IP (8.8.8.8), address (123 Main St Milwaukee WI), drug name (ibuprofen), or sport (nba).`,
      }],
      isError: true,
    };
  }

  // Find matching endpoints
  let endpoints;
  if (inputType === 'domain') {
    endpoints = REGISTRY.filter(ep => ep.input.type === 'domain' || ep.input.type === 'ip_or_domain');
  } else if (inputType === 'ip_or_domain') {
    endpoints = REGISTRY.filter(ep => ep.input.type === 'ip_or_domain');
  } else {
    endpoints = REGISTRY.filter(ep => ep.input.type === inputType);
  }

  if (endpoints.length === 0) {
    return {
      content: [{
        type: 'text',
        text: `No endpoints found for input type "${inputType}". Available: domain, IP, address, drug name, sport.`,
      }],
      isError: true,
    };
  }

  // Select endpoints within budget (cheapest first)
  endpoints.sort((a, b) => a.price - b.price);
  const selected = [];
  let runningCost = 0;
  for (const ep of endpoints) {
    if (runningCost + ep.price <= budget && selected.length < MAX_PARALLEL_CALLS) {
      selected.push(ep);
      runningCost += ep.price;
    }
  }

  if (selected.length === 0) {
    return {
      content: [{
        type: 'text',
        text: `Budget of $${budget.toFixed(2)} is too low. Cheapest endpoint costs $${endpoints[0].price.toFixed(2)}.`,
      }],
      isError: true,
    };
  }

  // Build URLs and call in parallel
  const calls = selected.map(ep => {
    const paramValue = encodeURIComponent(subject);
    const url = `${ep.url}?${ep.input.param}=${paramValue}`;
    return { endpoint: ep, url };
  });

  const results = await Promise.all(
    calls.map(async ({ endpoint, url }) => {
      const result = await callX402Endpoint(url);
      return {
        name: endpoint.name,
        price: endpoint.price,
        success: result.success,
        data: result.success ? result.data : null,
        error: result.success ? null : result.error,
      };
    })
  );

  // Format combined results
  const lines = [`## x402 Intelligence Report: ${subject}\n`];
  let totalCost = 0;
  let successCount = 0;

  for (const r of results) {
    if (r.success) {
      successCount++;
      totalCost += r.price;
      lines.push(`### ${r.name} ($${r.price.toFixed(2)})`);
      lines.push('```json');
      lines.push(JSON.stringify(r.data, null, 2).slice(0, 3000));
      lines.push('```\n');
    } else {
      lines.push(`### ${r.name} — FAILED`);
      lines.push(`Error: ${r.error}\n`);
    }
  }

  lines.push('---');
  lines.push(`**Summary:** ${successCount}/${results.length} endpoints called. Total cost: $${totalCost.toFixed(2)} USDC.`);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MCP SERVER SETUP
// ═══════════════════════════════════════════════════════════════════════════════

const server = new Server(
  { name: 'x402-buyer-mcp', version: VERSION },
  { capabilities: { tools: {} } }
);

// Register tool list
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// Route tool calls to handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'x402_discover':
      return handleDiscover(args);
    case 'x402_call':
      return handleCall(args);
    case 'x402_balance':
      return handleBalance();
    case 'x402_research':
      return handleResearch(args);
    default:
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}. Available: x402_discover, x402_call, x402_balance, x402_research` }],
        isError: true,
      };
  }
});

// Connect via stdio
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`x402-buyer-mcp v${VERSION} — ${REGISTRY.length} endpoints in registry`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
