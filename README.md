# x402-buyer-mcp

**The universal buyer agent for the x402 economy.**

An MCP server that lets Claude Desktop, Cursor, and Claude Code users discover, pay for, and call any x402 endpoint — automatically. Ask Claude a question, and it pays for the answer with USDC.

Discovery powered by [Decixa](https://decixa.ai) (5,500+ verified x402 endpoints) with local registry fallback.

## Install

### Claude Desktop / Cursor

Add to your MCP config:

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

### Requirements

- Node.js 18+
- [AgentCash](https://agentcash.dev) wallet set up and funded with USDC on Base

## Tools

| Tool | Description |
|------|-------------|
| `x402_discover` | Search for x402 endpoints — queries Decixa's 5,500+ verified APIs with local fallback |
| `x402_call` | Call any x402 endpoint with automatic USDC payment via AgentCash |
| `x402_balance` | Check your AgentCash wallet balance |
| `x402_research` | Multi-endpoint parallel research — calls 3-5 endpoints simultaneously |

## How It Works

1. You ask Claude a question ("Is stripe.com secure?")
2. `x402_discover` searches Decixa + local registry for matching endpoints
3. `x402_call` pays the endpoint in USDC on Base via AgentCash
4. Data comes back, Claude synthesizes the answer

The local registry includes 8 Alderpost intelligence endpoints backed by premium sources (VirusTotal, People Data Labs, Hunter.io, AbuseIPDB, Qualys SSL Labs, NIH RxNorm, US Census, ESPN, The Odds API). Decixa extends discovery to the full x402 ecosystem.

## Discovery Architecture

**Primary:** Decixa `/api/agent/resolve` — semantic search across 5,500+ verified x402 endpoints, ranked by latency, price, trust score, and capability match.

**Fallback:** Local registry of 8 curated Alderpost endpoints with full metadata. Used automatically if Decixa is unreachable.

This "soft swap" pattern means discovery always works, even if the network is down.

## Local Registry Endpoints

| Endpoint | Price | Premium Sources |
|----------|-------|----------------|
| Domain Shield | $0.12 | VirusTotal (70+ engines) |
| Company X-Ray | $0.15 | People Data Labs, Hunter.io |
| Threat Pulse | $0.10 | VirusTotal, AbuseIPDB |
| Compliance Check | $0.15 | Qualys SSL Labs |
| Prospect IQ | $0.12 | People Data Labs, Hunter.io |
| Sports Edge | $0.12 | ESPN, The Odds API, Claude AI |
| Property Intel | $0.10 | US Census, OpenWeather |
| Health Signal | $0.10 | NIH RxNorm, FDA |

## Changelog

### v2.0.0
- **Decixa integration** — discovery now queries Decixa's `/api/agent/resolve` API as primary source, with local registry as fallback (soft swap pattern).
- `x402_discover` returns results from the entire x402 ecosystem, not just Alderpost endpoints.
- Added capability mapping from natural language queries to Decixa's verb-based taxonomy.
- Updated tool descriptions to reflect ecosystem-wide discovery.
- First integration partner credit from Decixa.

### v1.0.5
- Fixed npm bin entry and ESM module configuration.
- CLI moved to root `cli.js`.

### v1.0.0
- Initial release with 4 tools and 8 Alderpost endpoints.

## Credits

- Discovery: [Decixa](https://decixa.ai) — the decision layer for AI agents
- Payment: [AgentCash](https://agentcash.dev) — USDC wallets for AI agents
- Intelligence: [Alderpost](https://www.alderpost.co) — bundled intelligence APIs

## Links

- [Alderpost](https://www.alderpost.co)
- [Decixa](https://decixa.ai)
- [AgentCash](https://agentcash.dev)
- [GitHub](https://github.com/8randonpickart5/x402-buyer-mcp)

## License

MIT — Alderpost LLC
