# Firefly III CLI with Claude Integration

A powerful command-line interface (CLI) for interacting with both the Firefly III Personal Finance Manager API and Claude AI for intelligent financial analysis. This CLI allows you to perform various budget-related operations with AI-enhanced capabilities.

## Features

- Secure authentication using client certificates and API tokens
- Intelligent financial analysis powered by Claude AI
- Batch processing support for multiple operations
- Configurable retry mechanisms and concurrent request handling
- Extensible architecture for adding more commands

## Prerequisites

Before you begin, ensure you have met the following requirements:

- Node.js (v23.x or later)
- npm (v10.x or later)
- A Firefly III instance with API access
- An Anthropic API key for Claude integration
- (Optional) Client certificate, key, and CA certificate for Firefly III authentication

### Troubleshooting

If you encounter access errors:
- Verify your PAT has the correct permissions
- Ensure you have access to the repository
- Check that your `.npmrc` file or npm config settings are correct

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/derekprovance/firefly-iii-cli.git
   cd firefly-iii-cli
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the `.env.example` file and configure your environment:
   ```bash
   cp .env.example .env
   ```

## Environment Configuration

The CLI uses environment variables for configuration. Create a `.env` file in the project root with the following variables:

### Environment Variables

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

# Monthly Investment Expense
MONTHLY_INVESTMENT_AMOUNT=1500
MONTHLY_INVESTMENT_DESC="VANGUARD BUY INVESTMENT"
```

### Environment Variables Reference

#### Firefly III Configuration
- `FIREFLY_API_URL`: The complete URL to your Firefly III API endpoint
  - Format: `https://your-instance.com/api/v1`
  - Required: Yes

- `FIREFLY_API_TOKEN`: Your personal access token for Firefly III
  - Required: Yes
  - How to obtain: Generate from your Firefly III instance under Profile > OAuth
  - Format: String
  - Security: Keep this secret!

#### Certificate Configuration
- `CLIENT_CERT_CA_PATH`: Path to your CA certificate file
  - Required: Yes, if server is protected by client credentials
  - Format: Path relative to project root
  - Example: `../certs/ca.pem`
  - File type: `.pem`

- `CLIENT_CERT_PATH`: Path to your client certificate file
  - Required: Yes, if server is protected by client credentials
  - Format: Path relative to project root
  - Example: `../certs/client.p12`
  - File type: `.p12`

- `CLIENT_CERT_PASSWORD`: Password for your client certificate
  - Required: Yes, if certificate is password-protected
  - Format: String
  - Security: Keep this secret!

#### Claude AI Configuration
- `ANTHROPIC_API_KEY`: Your Anthropic API key for Claude integration
  - Required: Yes, if using AI features
  - How to obtain: From your Anthropic account dashboard
  - Format: String
  - Security: Keep this secret!

- `LLM_MODEL`: The Claude model version to use
  - Required: No
  - Default: `claude-3-5-sonnet-latest`
  - Format: String

#### Monthly Investment Expense
- `MONTHLY_INVESTMENT_AMOUNT`: Monthly amount that goes to an investment account
  - Required: No
  - Format: String

- `MONTHLY_INVESTMENT_DESC`: The transaction description for the investment
  - Required: No
  - Format: String

For more information on what models you can use, please visit [this help page](https://docs.anthropic.com/en/docs/about-claude/models).

#### Application Configuration
- `LOG_LEVEL`: Determines the verbosity of application logging
  - Required: No
  - Valid values: `error`, `warn`, `info`, `debug`, `trace`
  - Default: `info`
  - Recommended: `info` for production, `debug` for development

## Configuration Options

### Claude Client Configuration

The CLI supports the following configuration options for the Claude integration:

```typescript
interface ClaudeConfig {
  // API and Client Configuration
  apiKey?: string             // Your Anthropic API key
  baseURL?: string           // API base URL (default: https://api.anthropic.com)
  timeout?: number           // Request timeout in ms (default: 30000)
  maxRetries?: number        // Max retry attempts (default: 3)

  // Model Configuration
  model?: string

  // Message Parameters
  maxTokens?: number         // Maximum tokens in response (default: 1024)
  temperature?: number       // Response randomness (0-1, default: 1.0)
  topP?: number             // Nucleus sampling (0-1, default: 1.0)
  topK?: number             // Top-k sampling (default: 5)
  stopSequences?: string[]   // Custom stop sequences

  // System Configuration
  systemPrompt?: string      // System prompt for context
  metadata?: Record<string, string>  // Custom metadata

  // Batch Processing Configuration
  batchSize?: number         // Messages per batch (default: 10)
  maxConcurrent?: number     // Max concurrent requests (default: 5)
  retryDelayMs?: number      // Base retry delay (default: 1000)
  maxRetryDelayMs?: number   // Maximum retry delay (default: 32000)
}
```

## Usage

To use the Firefly III CLI, run the following command:

```bash
npm start -- [command] [options]
```

### Available Commands

1. Calculate unbudgeted expenses for a given month:
   ```bash
   Usage: budgeting-toolkit-cli finalize-budget [options]

   Runs calculations needed to finalize the budget

   Options:
   -m, --month <month>  month to run calculations <int>
   -h, --help           display help for command
   ```
2. Generate Financial Reports:
   ```bash
   Usage: budgeting-toolkit-cli update-transactions [options]

   Update transactions using an LLM

   Options:
   -t, --tag <tag>          a tag must be specified <string>
   -m, --mode <mode>        specify what to update: 'category', 'budget', or 'both' (choices: "category", "budget",
                              "both", default: "category")
   -i, --includeClassified  process transactions that already have categories assigned
   -y, --yes                automatically apply updates without confirmation prompts
   -h, --help               display help for command
   ```

## Development

To set up the project for development:

1. Run tests:
   ```bash
   npm test
   ```

2. Build the project:
   ```bash
   npm run compile
   ```

3. Run in development mode:
   ```bash
   npm run start
   ```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -am 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

- [Firefly III](https://www.firefly-iii.org/) - Personal finance manager
- [Anthropic Claude](https://www.anthropic.com/claude) - AI language model
- [@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-typescript) - Official Anthropic TypeScript SDK
- [Commander.js](https://github.com/tj/commander.js/) - Node.js command-line interface solution

## Contact

If you have any questions or feedback, please open an issue in the GitHub repository.