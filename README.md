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

- Node.js (v14.0.0 or later)
- npm (v6.0.0 or later)
- A Firefly III instance with API access
- An Anthropic API key for Claude integration
- Client certificate, key, and CA certificate for Firefly III authentication (Optional)

## Installing Private Dependencies

This project requires access to private GitHub packages. To install the private dependencies, follow these steps:

1. Create a GitHub Personal Access Token (PAT):
   - Go to GitHub Settings → Developer Settings → Personal Access Tokens
   - Generate a new token with `read:packages` scope
   - Copy the generated token

2. Configure npm to use GitHub Packages:

```bash
npm config set @derekprovance:registry https://npm.pkg.github.com
npm config set //npm.pkg.github.com/:_authToken YOUR_GITHUB_PAT
```

Replace `YOUR_GITHUB_PAT` with your personal access token.

3. Install the private package:

```bash
npm install @derekprovance/firefly-iii-sdk@2.1.0
```

Alternatively, you can create a `.npmrc` file in your project root with the following content:

```plaintext
@derekprovance:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PAT
```

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
```

### Environment Variables Reference

#### Firefly III Configuration
- `FIREFLY_API_URL`: The complete URL to your Firefly III API endpoint
  - Format: `https://your-instance.com/api/v1`
  - Required: Yes
  - Example: `https://finance.example.com/api/v1`

- `FIREFLY_API_TOKEN`: Your personal access token for Firefly III
  - Required: Yes
  - How to obtain: Generate from your Firefly III instance under Profile > OAuth
  - Format: String
  - Security: Keep this secret!

#### Certificate Configuration
- `CLIENT_CERT_CA_PATH`: Path to your CA certificate file
  - Required: Yes if server is protected by client credentials
  - Format: Path relative to project root
  - Example: `../certs/ca.pem`
  - File type: `.pem`

- `CLIENT_CERT_PATH`: Path to your client certificate file
  - Required: Yes if server is protected by client credentials
  - Format: Path relative to project root
  - Example: `../certs/client.p12`
  - File type: `.p12`

- `CLIENT_CERT_PASSWORD`: Password for your client certificate
  - Required: Yes if certificate is password-protected
  - Format: String
  - Security: Keep this secret!

#### Claude AI Configuration
- `ANTHROPIC_API_KEY`: Your Anthropic API key for Claude integration
  - Required: Yes
  - How to obtain: From your Anthropic account dashboard
  - Format: String
  - Security: Keep this secret!

- `LLM_MODEL`: The Claude model version to use
  - Required: No
  - Default: `claude-3-5-sonnet-latest`

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

1. Calculate additional income for a given month:
   ```bash
   ./budget.sh calculate-additional [options]
   ```
   Options:
   - `-m --month`: Month to run calculations

2. Calculate unbudgeted expenses for a given month:
   ```bash
   ./budget.sh calculate-unbudgeted [options]
   ```
   Options:
   - `-m --month`: Month to run calculations


3. Calculate unbudgeted expenses for a given month:
   ```bash
   ./budget.sh finalize-budget [options]
   ```
   Options:
   - `-m --month`: Month to run calculations

4. Generate Financial Reports:
   ```bash
   ./budget.sh update-transactions [options]
   ```
   Options:
   - `-t --tag`: Tag containing transactions you want updated (required)
   - `-b --budget`: Flag denoting if we should process budgets in addition

## Development

To set up the project for development:

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run tests:
   ```bash
   npm test
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. Run in development mode:
   ```bash
   npm run dev
   ```

## Error Handling

The CLI implements exponential backoff with jitter for retries:
- Base delay: 1000ms
- Maximum delay: 32000ms
- Retry attempts: 3 (configurable)

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
- [Axios](https://github.com/axios/axios) - Promise based HTTP client

## Contact

If you have any questions or feedback, please open an issue in the GitHub repository.