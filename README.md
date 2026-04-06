# Limadata B2B Intelligence — MCP Server (DXT Extension)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server packaged as a [DXT extension](https://github.com/anthropics/dxt) for Claude Desktop. It connects Claude to the [Limadata](https://limadata.com) B2B data platform, giving Claude access to 40+ tools for enrichment, contact discovery, prospecting, and research.

## Features

| Category | Tools | Description |
|---|---|---|
| **Enrichment** | `enrich_person`, `enrich_company` | Enrich person/company profiles with firmographic, technographic, and contact data |
| **Profiles** | `get_person`, `get_company`, `get_company_insights` | Retrieve LinkedIn profiles and Crunchbase insights |
| **Contact Discovery** | `find_work_email`, `find_personal_email`, `find_phone`, `find_reverse_email` + more | Find emails, phone numbers, and social profiles |
| **Search** | `search_people`, `search_companies`, `search_jobs`, `search_posts`, `search_web`, `ai_search` | Search LinkedIn, the web, and get AI-powered answers |
| **Prospecting** | `prospect_people_filter`, `prospect_companies_filter`, `prospect_employees` + more | Advanced filtered prospecting for people and companies |
| **Batch Operations** | `batch_people`, `batch_companies`, `batch_prospect_*`, `batch_list`, `batch_results` | Bulk data retrieval for large lists |
| **Watch/Webhooks** | `create_watch`, `list_watches`, `get_watch`, `update_watch` | Monitor people and companies for changes |
| **Workplace Intel** | `get_workplace_benefits`, `get_workplace_ratings` | Glassdoor ratings and benefits data |
| **Research** | `extract` | Extract structured content from web pages |
| **Account** | `credits_balance`, `autocomplete` | Check credits and get autocomplete suggestions |

## Prerequisites

- [Claude Desktop](https://claude.ai/download) v0.10.0 or later
- [Node.js](https://nodejs.org/) >= 18.0.0
- A Limadata API key — [get one here](https://app.limadata.com/settings/apikeys)

## Installation

### Option A: Install the pre-built DXT extension

1. Download the latest `limadata-dxt.dxt` file from the [Releases](../../releases) page.
2. Open Claude Desktop.
3. Go to **Settings > Extensions** and click **Add Extension**.
4. Select the `.dxt` file.
5. When prompted, enter your Limadata API key.

### Option B: Build and install from source

```bash
# Clone the repository
git clone https://github.com/your-org/limadata-dxt.git
cd limadata-dxt

# Install dependencies
npm install

# Build the DXT package (requires the dxt CLI)
npx @anthropic-ai/dxt pack .

# Install the generated .dxt file via Claude Desktop (Settings > Extensions > Add Extension)
```

### Option C: Run the MCP server standalone (without DXT)

You can run the server directly for use with any MCP-compatible client:

```bash
# Install dependencies
npm install

# Set your API key and start the server
LIMADATA_API_KEY=your_api_key_here node server/index.js
```

To add it to Claude Desktop manually, edit your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "limadata": {
      "command": "node",
      "args": ["/absolute/path/to/limadata-dxt/server/index.js"],
      "env": {
        "LIMADATA_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

## Usage

Once installed, you can ask Claude things like:

- *"Enrich the company microsoft.com and summarise their tech stack."*
- *"Find the work email for Jane Doe at acme.com."*
- *"Search LinkedIn for VP of Engineering at Series B startups in London."*
- *"How many credits do I have left?"*

## Project Structure

```
limadata-dxt/
├── manifest.json        # DXT extension manifest (tools, config, metadata)
├── package.json         # Node.js dependencies
├── server/
│   └── index.js         # MCP server implementation (all tool handlers)
├── LICENSE              # MIT license
└── .gitignore
```

## Configuration

The only required configuration is your **Limadata API key**. When installed via DXT, Claude Desktop prompts for it automatically. When running standalone, set it via the `LIMADATA_API_KEY` environment variable.

## Contributing

Contributions are welcome! Please follow these guidelines:

### Getting Started

1. Fork the repository and clone your fork.
2. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

### Development Guidelines

- **Language:** JavaScript (ES6+, ESM modules).
- **Style:** Follow the conventions in the existing codebase:
  - `camelCase` for variables and functions.
  - 2-space indentation, single quotes, semicolons required.
  - Arrow functions for callbacks, named functions for top-level declarations.
- **Adding a new tool:** Add your `server.tool(...)` call in `server/index.js` following the existing pattern, and add a corresponding entry in the `tools` array in `manifest.json`.
- **API key:** Never commit API keys or secrets. The key is read from `process.env.LIMADATA_API_KEY` at runtime.

### Commit Messages

Use clear, descriptive commit messages:

```
feat: add company technographic search tool
fix: handle missing credits header gracefully
docs: update installation instructions
```

### Submitting a Pull Request

1. Ensure your changes work end-to-end by testing with Claude Desktop or the MCP inspector.
2. Keep PRs focused — one feature or fix per PR.
3. Update this README if you add new tools or change configuration.
4. Open a PR against `main` with a clear description of what changed and why.

### Reporting Issues

Open an issue with:
- A clear title and description of the problem.
- Steps to reproduce (if applicable).
- Your environment (OS, Node.js version, Claude Desktop version).

## Credits & Rate Limits

Each Limadata API call consumes credits. Credit costs vary by endpoint (1-10 credits per call). Use the `credits_balance` tool to check your remaining balance. See the [Limadata docs](https://docs.limadata.com) for detailed pricing per endpoint.

## License

[MIT](LICENSE)
