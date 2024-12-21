# Firefly III CLI with Claude Integration

A powerful command-line interface (CLI) for interacting with both the Firefly III Personal Finance Manager API and Claude AI for intelligent financial analysis. This CLI allows you to perform various budget-related operations with AI-enhanced capabilities.

## Features

- ✨ Secure authentication using client certificates and API tokens
- 🤖 Intelligent financial analysis powered by Claude AI
- 🔄 Batch processing support for multiple operations
- 🛠 Configurable retry mechanisms and concurrent request handling
- 📦 Extensible architecture for adding more commands

## Getting Started

### Prerequisites

- Node.js (v23.x or later)
- npm (v10.x or later)
- A Firefly III instance with API access
- An Anthropic API key for Claude integration
- (Optional) Client certificate, key, and CA certificate for Firefly III authentication

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/derekprovance/firefly-iii-cli.git
   cd firefly-iii-cli
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure your environment:
   ```bash
   cp .env.example .env
   ```

## Configuration

### Environment Setup

Create a `.env` file in the project root with the following variables:

```bash
# Firefly III Configuration
FIREFLY_API_URL=https://your-firefly-instance.com/api/v1
FIREFLY_API_TOKEN=your_api_token_here

# Client Certificate Configuration
CLIENT_CERT_CA_PATH=../certs/ca.pem
CLIENT_CERT_PATH=../certs/client.p12
CLIENT_CERT_PASSWORD=your_certificate_password

# Claude AI Configuration
ANTHROPIC_API_KEY=your_anthropic_key
LLM_MODEL=claude-3-5-haiku-latest

# Application Configuration
LOG_LEVEL=info
```

#### Required Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `FIREFLY_API_URL` | Firefly III API endpoint URL | Yes | - |
| `FIREFLY_API_TOKEN` | Personal access token | Yes | - |
| `ANTHROPIC_API_KEY` | Claude AI API key | Yes* | - |
| `LLM_MODEL` | Claude model version | No | claude-3-5-sonnet-latest |
| `LOG_LEVEL` | Application logging level | No | info |

*Required for AI features

#### Certificate Variables (Optional)

| Variable | Description | File Type |
|----------|-------------|-----------|
| `CLIENT_CERT_CA_PATH` | CA certificate path | .pem |
| `CLIENT_CERT_PATH` | Client certificate path | .p12 |
| `CLIENT_CERT_PASSWORD` | Certificate password | - |

### Transaction Exclusions

Create `excluded_transactions.csv` to specify transactions to exclude from processing:

```csv
Description,Amount
"Monthly Rent",1200.00
"Coffee Shop",
,50.00
"Grocery Store",125.50
```

#### Format Rules
- Two columns: Description (optional) and Amount (optional)
- At least one field required per row
- Amounts in decimal format (e.g., 125.50)
- Case-sensitive descriptions
- Both fields must match when both provided

### Claude AI Settings

Configure Claude behavior using the following options:

```typescript
interface ClaudeConfig {
  // API Configuration
  apiKey?: string             // Anthropic API key
  baseURL?: string           // API base URL
  timeout?: number           // Request timeout (ms)
  maxRetries?: number        // Retry attempts

  // Model Settings
  model?: string             // Model version
  maxTokens?: number         // Response token limit
  temperature?: number       // Response randomness
  
  // Processing Settings
  batchSize?: number         // Batch message count
  maxConcurrent?: number     // Concurrent requests
  retryDelayMs?: number      // Retry delay
}
```

## Usage

### Basic Commands

Run the CLI using:
```bash
npm start -- [command] [options]
```

### Command Reference

#### Budget Finalization
```bash
npm start -- finalize-budget [options]

Options:
-m, --month <month>  Month to process (integer)
-h, --help          Show command help
```

#### Transaction Updates
```bash
npm start -- update-transactions [options]

Options:
-t, --tag <tag>          Required tag
-m, --mode <mode>        Update mode: category|budget|both
-i, --includeClassified  Process classified transactions
-y, --yes               Skip confirmation prompts
```

## Development

1. Run tests:
   ```bash
   npm test
   ```

2. Build:
   ```bash
   npm run compile
   ```

3. Development mode:
   ```bash
   npm run start
   ```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -am 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

### Troubleshooting

Common issues:
- PAT permission errors: Verify token permissions
- Repository access: Check repository permissions
- NPM configuration: Verify `.npmrc` settings

### Contact

For questions or feedback, please [open an issue](https://github.com/derekprovance/firefly-iii-cli/issues) in the repository.

## Legal

### License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### Acknowledgements

- [Firefly III](https://www.firefly-iii.org/) - Personal finance manager
- [Anthropic Claude](https://www.anthropic.com/claude) - AI language model
- [@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-typescript) - Official Anthropic TypeScript SDK
- [Commander.js](https://github.com/tj/commander.js/) - Node.js command-line interface