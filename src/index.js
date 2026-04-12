#!/usr/bin/env node

/**
 * x402-buyer-mcp — The Universal x402 Buyer Agent
 * 
 * An MCP server that lets any Claude Desktop, Cursor, or Claude Code user
 * discover, pay for, and call x402 endpoints automatically. The missing
 * buyer-side infrastructure for the x402 agent economy.
 * 
 * Tools:
 *   x402_discover  — Find x402 endpoints matching a query
 *   x402_call      — Call any x402 endpoint with automatic payment
 *   x402_balance   — Check your AgentCash wallet balance
 *   x402_research  — Multi-endpoint intelligence research (calls 3-5 endpoints in parallel)
 * 
 * Payment is handled via AgentCash (agentcash.dev). Users fund their
 * AgentCash wallet once, then every x402 call is paid automatically.
 * 
 * @author  Alderpost LLC — Wisconsin
 * @see     https://www.alderpost.co
 * @license MIT
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const VERSION = '1.0.0';
const AGENTCASH_TIMEOUT_MS = 30000;
const DISCOVERY_TIMEOUT_MS = 10000;
const MAX_PARALLEL_CALLS = 5;

// ═══════════════════════════════════════════════════════════════════════════════
// ENDPOINT REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════
// 
// The built-in registry of known x402 endpoints. This is the curated,
// high-quality directory that agents trust. New endpoints can be discovered
// via x402scan, but the registry is the starting point.
//
// Each entry includes:
//   url         — Full endpoint URL (without query params)
//   name        — Human-readable name
//   provider    — Who operates this endpoint
//   description — What it does (written for agent selection)
//   price       — Price per call in USD
//   input       — Parameter specification
//   tags        — Categories for discovery matching
//   featured    — Whether to boost in search results

const REGISTRY = [
  // ── Alderpost Intelligence (featured) ─────────────────────────────────────
  {
    url: 'https://www.alderpost.co/api/domain-shield',
    name: 'Domain Shield',
    provider: 'Alderpost',
    description: 'Domain security scan with VirusTotal malware detection. Returns SPF, DKIM, DMARC, SSL, MX, DNSSEC + malware scan from 70+ antivirus engines. Scored 0-100 with recommendations.',
    price: 0.12,
    input: { param: 'domain', type: 'domain', example: 'stripe.com' },
    tags: ['security', 'domain', 'dns', 'ssl', 'malware', 'virustotal', 'email-auth', 'phishing'],
    featured: true,
  },
  {
    url: 'https://www.alderpost.co/api/company-xray',
    name: 'Company X-Ray',
    provider: 'Alderpost',
    description: 'Company intelligence with People Data Labs enrichment. Returns tech stack, infrastructure, social presence + verified firmographics: industry, employee count, revenue estimate, founded year, HQ location, LinkedIn URL.',
    price: 0.15,
    input: { param: 'domain', type: 'domain', example: 'hubspot.com' },
    tags: ['company', 'business', 'firmographics', 'tech-stack', 'revenue', 'employees', 'pdl', 'enrichment'],
    featured: true,
  },
  {
    url: 'https://www.alderpost.co/api/threat-pulse',
    name: 'Threat Pulse',
    provider: 'Alderpost',
    description: 'Threat intelligence with VirusTotal + AbuseIPDB. Returns blacklist status, reverse DNS, open ports, SSL, email security + malware detection from 70+ engines + IP abuse reports from 30K+ community reporters.',
    price: 0.10,
    input: { param: 'target', type: 'ip_or_domain', example: '8.8.8.8' },
    tags: ['security', 'threat', 'ip', 'malware', 'abuse', 'blacklist', 'ports', 'virustotal', 'abuseipdb'],
    featured: true,
  },
  {
    url: 'https://www.alderpost.co/api/prospect-iq',
    name: 'Prospect IQ',
    provider: 'Alderpost',
    description: 'Sales intelligence with Hunter.io verified emails. Returns web presence, tech stack, social signals, contact readiness + verified email addresses with names, positions, and email patterns for the domain.',
    price: 0.12,
    input: { param: 'domain', type: 'domain', example: 'hubspot.com' },
    tags: ['sales', 'leads', 'email', 'contacts', 'hunter', 'prospecting', 'outreach'],
    featured: true,
  },
  {
    url: 'https://www.alderpost.co/api/compliance-check',
    name: 'Compliance Check',
    provider: 'Alderpost',
    description: 'IT compliance audit with Qualys SSL Labs grade. Returns email authentication, SSL posture, HTTP security headers, cookie audit, privacy detection, DNSSEC, hosting + industry-standard SSL Labs grade (A+ to F).',
    price: 0.15,
    input: { param: 'domain', type: 'domain', example: 'stripe.com' },
    tags: ['compliance', 'audit', 'ssl-labs', 'security-headers', 'cookies', 'privacy', 'owasp'],
    featured: true,
  },
  {
    url: 'https://www.alderpost.co/api/health-signal',
    name: 'Health Signal',
    provider: 'Alderpost',
    description: 'Health intelligence with NIH RxNorm drug interactions. Returns FDA drug labels, adverse events, recalls, nutrition data + drug-to-drug interaction checking with severity ratings.',
    price: 0.10,
    input: { param: 'query', type: 'drug_or_food', example: 'ibuprofen' },
    tags: ['health', 'drug', 'fda', 'interactions', 'nutrition', 'recalls', 'rxnorm', 'medical'],
    featured: true,
  },
  {
    url: 'https://www.alderpost.co/api/property-intel',
    name: 'Property Intel',
    provider: 'Alderpost',
    description: 'Location intelligence with Census demographics and weather. Returns geocoding, nearby amenities, schools, elevation + median income, population, home values, and current weather.',
    price: 0.10,
    input: { param: 'address', type: 'address', example: '123 Main St Milwaukee WI' },
    tags: ['property', 'location', 'demographics', 'census', 'weather', 'amenities', 'schools', 'real-estate'],
    featured: true,
  },
  {
    url: 'https://www.alderpost.co/api/sports-edge',
    name: 'Sports Edge',
    provider: 'Alderpost',
    description: 'Pre-game sports intelligence with AI analysis and betting odds. Returns ESPN standings, team stats, Claude AI analysis + odds from 15+ bookmakers and game-day weather.',
    price: 0.12,
    input: { param: 'sport', type: 'sport', example: 'nba', extra: { team: 'lakers' } },
    tags: ['sports', 'betting', 'odds', 'nba', 'nfl', 'mlb', 'nhl', 'ai-analysis'],
    featured: true,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// DISCOVERY ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Score how well an endpoint matches a search query.
 * Uses tag matching, name matching, and description keyword matching.
 * Featured endpoints get a boost.
 */
function scoreEndpoint(endpoint, query) {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/).filter(w => w.length > 2);
  let score = 0;

  // Exact tag match (strongest signal)
  for (const tag of endpoint.tags) {
    if (q.includes(tag)) score += 10;
    for (const word of words) {
      if (tag.includes(word) || word.includes(tag)) score += 5;
    }
  }

  // Name match
  const nameLower = endpoint.name.toLowerCase();
  if (nameLower.includes(q)) score += 15;
  for (const word of words) {
    if (nameLower.includes(word)) score += 8;
  }

  // Description keyword match
  const descLower = endpoint.description.toLowerCase();
  for (const word of words) {
    if (descLower.includes(word)) score += 3;
  }

  // Provider match
  if (endpoint.provider.toLowerCase().includes(q)) score += 5;

  // Featured boost
  if (endpoint.featured) score += 2;

  return score;
}

/**
 * Search the registry for endpoints matching a query.
 * Returns results sorted by relevance score, filtered to score > 0.
 */
function searchRegistry(query) {
  return REGISTRY
    .map(ep => ({ ...ep, relevance: scoreEndpoint(ep, query) }))
    .filter(ep => ep.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance);
}

/**
 * Get all endpoints that accept a given input type.
 * Used by the research tool to find all relevant endpoints for a subject.
 */
function getEndpointsByInputType(type) {
  return REGISTRY.filter(ep => ep.input.type === type || ep.input.type === 'ip_or_domain' && type === 'domain');
}

/**
 * Detect the input type from a raw subject string.
 */
function detectInputType(subject) {
  const s = subject.trim();

  // IP address
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s)) return 'ip_or_domain';

  // Domain (contains dot, no spaces, looks like a hostname)
  if (/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(s)) return 'domain';

  // Address (contains numbers and letters with spaces — likely a street address)
  if (/\d+.*[a-zA-Z]+.*[a-zA-Z]{2,}/.test(s) && s.includes(' ')) return 'address';

  // Sport keywords
  if (/^(nba|nfl|mlb|nhl|mls|epl|soccer|basketball|football|baseball|hockey)$/i.test(s)) return 'sport';

  // Drug or food (default for short text queries)
  if (s.length < 50 && !s.includes(' ') || /[a-z]+(in|ol|ine|ide|ate)$/i.test(s)) return 'drug_or_food';

  return 'unknown';
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENTCASH INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute an AgentCash CLI command and parse the result.
 * 
 * AgentCash handles all x402 payment complexity:
 *   - Wallet management (private key stored locally)
 *   - EIP-712 signature generation
 *   - 402 → payment → retry flow
 *   - On-chain settlement via facilitator
 * 
 * We shell out to the CLI for reliability. The AgentCash CLI is battle-tested
 * and handles edge cases (retries, gas estimation, nonce management) that
 * would be fragile to reimplement.
 */
async function agentcashExec(args) {
  try {
    const { stdout, stderr } = await execAsync(
      `npx -y agentcash ${args}`,
      { timeout: AGENTCASH_TIMEOUT_MS, maxBuffer: 1024 * 1024 }
    );
    // AgentCash outputs JSON to stdout
    const text = stdout.trim();
    if (!text) return { success: false, error: 'Empty response from AgentCash' };
    try {
      return { success: true, data: JSON.parse(text) };
    } catch {
      // Sometimes output has non-JSON prefix/suffix — try to extract JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return { success: true, data: JSON.parse(jsonMatch[0]) };
      return { success: true, data: { raw: text } };
    }
  } catch (err) {
    const msg = err.stderr || err.message || 'Unknown AgentCash error';
    if (msg.includes('INSUFFICIENT_BALANCE')) {
      return { success: false, error: 'Insufficient USDC balance. Fund your AgentCash wallet at https://agentcash.dev/deposit' };
    }
    if (msg.includes('ENOENT') || msg.includes('not found') || msg.includes('not recognized')) {
      return { success: false, error: 'AgentCash not found. Install with: npm install -g agentcash — then fund your wallet at https://agentcash.dev' };
    }
    return { success: false, error: `AgentCash error: ${msg.slice(0, 200)}` };
  }
}

/**
 * Call an x402 endpoint via AgentCash with automatic payment.
 */
async function callX402Endpoint(url) {
  return agentcashExec(`fetch "${url}" -m GET --format json`);
}

/**
 * Get the current AgentCash wallet balance.
 */
async function getBalance() {
  return agentcashExec('balance --format json');
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESULT FORMATTING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format a discovery result for display.
 */
function formatDiscoveryResult(endpoints) {
  if (endpoints.length === 0) {
    return 'No x402 endpoints found matching your query. Try broader search terms like "security", "company", "health", or "location".';
  }

  const lines = [`Found ${endpoints.length} x402 endpoint(s):\n`];
  for (const ep of endpoints) {
    lines.push(`**${ep.name}** — $${ep.price.toFixed(2)}/call`);
    lines.push(`  ${ep.description}`);
    lines.push(`  URL: ${ep.url}?${ep.input.param}=${ep.input.example}`);
    lines.push(`  Provider: ${ep.provider}${ep.featured ? ' ★' : ''}`);
    lines.push('');
  }
  lines.push('To call an endpoint, use the x402_call tool with the full URL including query parameters.');
  return lines.join('\n');
}

/**
 * Format a research result combining multiple endpoint responses.
 */
function formatResearchResult(subject, results) {
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

  lines.push(`---`);
  lines.push(`**Summary:** ${successCount}/${results.length} endpoints called successfully. Total cost: $${totalCost.toFixed(2)} USDC.`);
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// MCP SERVER
// ═══════════════════════════════════════════════════════════════════════════════

const server = new McpServer({
  name: 'x402-buyer-mcp-server',
  version: VERSION,
});

// ─── Tool 1: x402_discover ──────────────────────────────────────────────────
// Find x402 endpoints matching a query. Searches the built-in curated registry
// of premium x402 endpoints across security, business, health, and more.

server.registerTool(
  'x402_discover',
  {
    title: 'Discover x402 Endpoints',
    description: `Search for x402 paid API endpoints that can answer a question or provide data.

Searches a curated registry of premium x402 endpoints. Each endpoint bundles 
7-9 data sources into a single call with scoring and recommendations.

Categories available: security, company/business, threat intelligence, 
sales/leads, compliance, health/drug, property/location, sports.

Examples:
  - query "domain security" → finds Domain Shield (VirusTotal + DNS checks)
  - query "company information" → finds Company X-Ray (People Data Labs + tech stack)
  - query "email contacts" → finds Prospect IQ (Hunter.io verified emails)
  - query "drug interactions" → finds Health Signal (NIH RxNorm + FDA data)

Returns endpoint URLs, descriptions, prices, and usage examples.
Use x402_call to call any discovered endpoint.`,
    inputSchema: {
      query: z.string()
        .min(2, 'Query must be at least 2 characters')
        .max(200, 'Query too long')
        .describe('What data do you need? E.g. "domain security", "company revenue", "drug interactions"'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ query }) => {
    const results = searchRegistry(query);
    const text = formatDiscoveryResult(results);
    return {
      content: [{ type: 'text', text }],
    };
  }
);

// ─── Tool 2: x402_call ─────────────────────────────────────────────────────
// Call any x402 endpoint with automatic payment via AgentCash.
// This is the core tool that makes x402 payments transparent to the user.

server.registerTool(
  'x402_call',
  {
    title: 'Call x402 Endpoint',
    description: `Call any x402 paid API endpoint. Payment is handled automatically via AgentCash.

Accepts a full URL with query parameters. The tool:
1. Sends the request to the endpoint
2. Receives the 402 payment requirement
3. Signs a USDC payment on Base
4. Retries with the payment proof
5. Returns the endpoint's response data

Requires AgentCash to be set up and funded. If not installed, the tool
will provide setup instructions.

Cost: Varies by endpoint ($0.10 - $0.15 typical for Alderpost endpoints).

Examples:
  - url: "https://www.alderpost.co/api/domain-shield?domain=stripe.com"
  - url: "https://www.alderpost.co/api/company-xray?domain=hubspot.com"
  - url: "https://www.alderpost.co/api/health-signal?query=ibuprofen"`,
    inputSchema: {
      url: z.string()
        .url('Must be a valid URL')
        .describe('Full endpoint URL with query parameters. E.g. https://www.alderpost.co/api/domain-shield?domain=stripe.com'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ url }) => {
    const result = await callX402Endpoint(url);

    if (!result.success) {
      return {
        content: [{ type: 'text', text: `Payment or call failed: ${result.error}` }],
        isError: true,
      };
    }

    const text = typeof result.data === 'string'
      ? result.data
      : JSON.stringify(result.data, null, 2);

    return {
      content: [{ type: 'text', text }],
    };
  }
);

// ─── Tool 3: x402_balance ───────────────────────────────────────────────────
// Check AgentCash wallet balance. Quick way to see available funds.

server.registerTool(
  'x402_balance',
  {
    title: 'Check x402 Wallet Balance',
    description: `Check your AgentCash USDC balance on Base.

Returns the current balance available for x402 payments. If AgentCash
is not set up, provides instructions to create and fund a wallet.

No parameters required.`,
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async () => {
    const result = await getBalance();

    if (!result.success) {
      return {
        content: [{
          type: 'text',
          text: `Could not check balance: ${result.error}\n\nTo set up AgentCash:\n1. Run: npx agentcash install\n2. Fund your wallet at https://agentcash.dev/deposit`
        }],
        isError: true,
      };
    }

    const balance = result.data.balance ?? result.data.raw ?? 'unknown';
    return {
      content: [{
        type: 'text',
        text: `AgentCash balance: $${balance} USDC on Base\n\nThis covers approximately ${Math.floor(Number(balance) / 0.12)} calls at $0.12/call.`
      }],
    };
  }
);

// ─── Tool 4: x402_research ──────────────────────────────────────────────────
// The killer feature. Multi-endpoint parallel research.
// Given a subject, automatically discovers and calls all relevant endpoints,
// then returns combined results for Claude to synthesize.

server.registerTool(
  'x402_research',
  {
    title: 'x402 Multi-Endpoint Research',
    description: `Run comprehensive research by calling multiple x402 endpoints in parallel.

Given a subject (domain, IP, address, drug name, or sport), this tool:
1. Detects the input type
2. Finds all relevant x402 endpoints
3. Calls up to 5 endpoints simultaneously with automatic payment
4. Returns all results combined

This is the fastest way to get a complete intelligence picture.

Cost: Sum of all endpoints called (typically $0.40 - $0.64 for domain research).

Input types auto-detected:
  - Domain (e.g. "stripe.com") → calls security, company, threat, compliance, sales endpoints
  - IP address (e.g. "8.8.8.8") → calls threat intelligence endpoint
  - Address (e.g. "123 Main St Milwaukee WI") → calls property/location endpoint
  - Drug name (e.g. "ibuprofen") → calls health intelligence endpoint
  - Sport (e.g. "nba") → calls sports intelligence endpoint

Examples:
  - subject: "stripe.com" → 5 endpoints called, ~$0.64 total
  - subject: "8.8.8.8" → 1-2 endpoints called, ~$0.10 total
  - subject: "ibuprofen" → 1 endpoint called, ~$0.10 total`,
    inputSchema: {
      subject: z.string()
        .min(2, 'Subject must be at least 2 characters')
        .max(200, 'Subject too long')
        .describe('The subject to research: a domain, IP address, street address, drug name, or sport'),
      max_cost: z.number()
        .min(0.05)
        .max(5.00)
        .default(1.00)
        .describe('Maximum total cost in USD. Endpoints are called cheapest-first until budget is reached. Default: $1.00'),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ subject, max_cost }) => {
    const budget = max_cost ?? 1.00;
    const inputType = detectInputType(subject);

    if (inputType === 'unknown') {
      return {
        content: [{
          type: 'text',
          text: `Could not determine the type of "${subject}". Please provide a domain (stripe.com), IP (8.8.8.8), address (123 Main St Milwaukee WI), drug name (ibuprofen), or sport (nba).`
        }],
        isError: true,
      };
    }

    // Find matching endpoints
    let endpoints;
    if (inputType === 'domain') {
      // Domain research is the richest — call all domain-accepting endpoints
      endpoints = REGISTRY.filter(ep =>
        ep.input.type === 'domain' || ep.input.type === 'ip_or_domain'
      );
    } else if (inputType === 'ip_or_domain') {
      endpoints = REGISTRY.filter(ep => ep.input.type === 'ip_or_domain');
    } else {
      endpoints = REGISTRY.filter(ep => ep.input.type === inputType);
    }

    if (endpoints.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No endpoints found for input type "${inputType}". Available types: domain, IP, address, drug name, sport.`
        }],
        isError: true,
      };
    }

    // Sort by price (cheapest first) and filter by budget
    endpoints.sort((a, b) => a.price - b.price);
    const selectedEndpoints = [];
    let runningCost = 0;
    for (const ep of endpoints) {
      if (runningCost + ep.price <= budget && selectedEndpoints.length < MAX_PARALLEL_CALLS) {
        selectedEndpoints.push(ep);
        runningCost += ep.price;
      }
    }

    if (selectedEndpoints.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `Budget of $${budget.toFixed(2)} is too low for any endpoint. Cheapest endpoint costs $${endpoints[0].price.toFixed(2)}.`
        }],
        isError: true,
      };
    }

    // Build URLs for each endpoint
    const calls = selectedEndpoints.map(ep => {
      let url;
      if (ep.input.type === 'sport') {
        // Sports endpoint has different param structure
        url = `${ep.url}?sport=${encodeURIComponent(subject)}`;
      } else {
        url = `${ep.url}?${ep.input.param}=${encodeURIComponent(subject)}`;
      }
      return { endpoint: ep, url };
    });

    // Call all endpoints in parallel
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

    const text = formatResearchResult(subject, results);
    return {
      content: [{ type: 'text', text }],
    };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// SERVER STARTUP
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`x402-buyer-mcp v${VERSION} running — ${REGISTRY.length} endpoints in registry`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
