# x402-buyer-mcp

**The universal buyer agent for the x402 economy.**

An MCP server that lets Claude Desktop, Cursor, and Claude Code users discover, pay for, and call any x402 endpoint — automatically. Ask Claude a question, and it pays for the answer with USDC.

No wallets. No crypto knowledge. No API keys. Just questions and answers.

## What This Does

The x402 protocol lets AI agents pay for API calls with USDC. But until now, most tools in the ecosystem are **sellers** — endpoints that accept payment. This is the **buyer** — the agent that spends.

When you ask Claude "is stripe.com secure?" this MCP:
1. Discovers the right x402 endpoint (Domain Shield — VirusTotal + DNS security)
2. Pays $0.12 in USDC on Base via your AgentCash wallet
3. Returns the full scored security report to Claude
4. Claude synthesizes the answer naturally

You never touch a wallet. You never see a blockchain. You just get answers backed by premium data.

## Install

### Prerequisites

1. **Fund an AgentCash wallet** (one-time, 2 minutes):
   ```bash
   npx agentcash install
   ```
   Follow the prompts to create a wallet and fund it with USDC on Base. $5 covers ~40 calls.

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "x402-buyer": {
      "command": "npx",
      "args": ["-y", "x402-buyer-mcp"]
    }
  }
}
```

### Cursor

Add to your `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "x402-buyer": {
      "command": "npx",
      "args": ["-y", "x402-buyer-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add x402-buyer -- npx -y x402-buyer-mcp
```

## Tools

### `x402_discover`

Search for x402 endpoints that can answer a question.

```
"Find endpoints for domain security scanning"
"Search for company intelligence APIs"
"What x402 endpoints handle drug interactions?"
```

### `x402_call`

Call any x402 endpoint with automatic payment.

```
"Call https://www.alderpost.co/api/domain-shield?domain=stripe.com"
"Call https://www.alderpost.co/api/company-xray?domain=hubspot.com"
```

### `x402_balance`

Check your AgentCash wallet balance.

```
"What's my x402 balance?"
"How many calls can I afford?"
```

### `x402_research` ⭐

**The killer feature.** Multi-endpoint parallel research. Give it a domain and it calls 3-5 endpoints simultaneously, returning a complete intelligence picture.

```
"Research stripe.com" → calls 5 endpoints (~$0.64):
  - Domain Shield (security scan)
  - Company X-Ray (firmographics)
  - Threat Pulse (threat intel)
  - Compliance Check (audit)
  - Prospect IQ (contact info)

"Research ibuprofen" → calls 1 endpoint (~$0.10):
  - Health Signal (FDA data + drug interactions)

"Research 123 Main St Milwaukee WI" → calls 1 endpoint (~$0.10):
  - Property Intel (demographics + amenities)
```

Budget control: set `max_cost` to cap total spend per research call.

## Endpoints in Registry

The built-in registry includes premium endpoints backed by paid data sources:

| Endpoint | What You Get | Price | Premium Source |
|----------|-------------|-------|---------------|
| Domain Shield | DNS security + malware scan | $0.12 | VirusTotal (70+ engines) |
| Company X-Ray | Firmographics + tech stack | $0.15 | People Data Labs |
| Threat Pulse | IP/domain threat intel | $0.10 | VirusTotal + AbuseIPDB |
| Prospect IQ | Sales intel + email contacts | $0.12 | Hunter.io |
| Compliance Check | IT compliance audit | $0.15 | Qualys SSL Labs |
| Health Signal | Drug info + interactions | $0.10 | NIH RxNorm + FDA |
| Property Intel | Location + demographics | $0.10 | US Census + OpenWeather |
| Sports Edge | Pre-game AI analysis | $0.12 | The Odds API + Claude AI |

All endpoints powered by [Alderpost Intelligence](https://www.alderpost.co).

## How Payment Works

```
You ask Claude a question
  → Claude calls x402_research or x402_call
    → This MCP calls AgentCash CLI
      → AgentCash signs a USDC payment on Base
        → The endpoint verifies + settles on-chain
          → Data returned to Claude
            → Claude answers your question
```

You fund AgentCash once. Every x402 call draws from that balance. No subscriptions. No API keys. Pay for exactly what you use.

## Example Session

```
You: "Tell me everything about hubspot.com"

Claude: I'll run a comprehensive research scan on hubspot.com.
[Calls x402_research with subject "hubspot.com"]

Results from 5 endpoints ($0.64 total):

Domain Shield: Security score 85/100. DMARC=reject, SPF=pass,
DKIM configured. VirusTotal: clean (0/94 engines flagged).

Company X-Ray: HubSpot, Inc. Founded 2006. 10,268 employees.
Computer Software. Cambridge, MA. Public company.
Tech: Cloudflare CDN, Google Workspace, Next.js.

Threat Pulse: Threat score 92/100. No blacklist hits.
AbuseIPDB: 0 reports. Clean reputation.

Compliance Check: SSL Labs grade A. 6/6 security headers.
DNSSEC not enabled. Cookie consent detected.

Prospect IQ: Prospect score 82/100 (hot). 5 verified email
contacts found via Hunter.io. Email pattern: {first}@hubspot.com.
```

## Pricing

This MCP server is **free**. You only pay for the x402 endpoints you call. Typical costs:

- Single endpoint call: $0.10 - $0.15
- Full domain research (5 endpoints): ~$0.64
- Health/property/sports query: ~$0.10

$5 in AgentCash covers approximately 40 individual calls or 8 full research reports.

## Why This Exists

The x402 protocol is designed for agents to pay for data autonomously. But the ecosystem has a cold-start problem: sellers have built endpoints, but there aren't enough buyers calling them. This MCP is the buyer-side infrastructure that makes x402 work as intended.

Every install creates a new buyer in the x402 economy. Every research call generates 3-5 real on-chain transactions. This is how the agent economy bootstraps.

## Links

- [Alderpost Intelligence](https://www.alderpost.co) — Endpoint provider
- [AgentCash](https://agentcash.dev) — Wallet & payment infrastructure
- [x402scan](https://www.x402scan.com) — Ecosystem explorer
- [x402 Protocol](https://www.x402.org) — Protocol specification

## License

MIT — Alderpost LLC, Wisconsin
