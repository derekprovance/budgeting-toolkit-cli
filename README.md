# Firefly III CLI

A command-line interface (CLI) for interacting with the Firefly III Personal Finance Manager API. This CLI allows you to perform various operations such as fetching accounts and creating transactions directly from your terminal.

## Features

- Secure authentication using client certificates and API tokens
- Fetch all accounts from your Firefly III instance
- Create new transactions
- Extensible architecture for adding more commands

## Prerequisites

Before you begin, ensure you have met the following requirements:

- Node.js (v14.0.0 or later)
- npm (v6.0.0 or later)
- A Firefly III instance with API access
- Client certificate, key, and CA certificate for authentication

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/firefly-iii-cli.git
   cd firefly-iii-cli
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the project root and add the following environment variables:
   ```
   FIREFLY_API_URL=https://your-firefly-instance.com/api/v1
   FIREFLY_API_TOKEN=your_api_token_here
   CLIENT_CERT_PATH=/path/to/your/client.crt
   CLIENT_KEY_PATH=/path/to/your/client.key
   CA_CERT_PATH=/path/to/your/ca.crt
   ```

   Replace the values with your actual Firefly III API URL, API token, and paths to your certificate files.

## Usage

To use the Firefly III CLI, run the following command:

```
npm start -- [command] [options]
```

Available commands:

1. Get all accounts:
   ```
   npm start -- get-accounts
   ```
2. Test the connection to Firefly III API:
   ```
   npm start -- test-connection
   ```

## Development

To set up the project for development:

1. Install dependencies:
   ```
   npm install
   ```

2. Run tests:
   ```
   npm test
   ```

3. Run tests in watch mode:
   ```
   npm run test:watch
   ```

## Contributing

Contributions to the Firefly III CLI are welcome. Please follow these steps to contribute:

1. Fork the repository
2. Create a new branch (`git checkout -b feature/your-feature-name`)
3. Make your changes
4. Commit your changes (`git commit -am 'Add some feature'`)
5. Push to the branch (`git push origin feature/your-feature-name`)
6. Create a new Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

- [Firefly III](https://www.firefly-iii.org/) - The personal finance manager this CLI interacts with
- [Commander.js](https://github.com/tj/commander.js/) - The complete solution for node.js command-line interfaces
- [Axios](https://github.com/axios/axios) - Promise based HTTP client for the browser and node.js

## Contact

If you have any questions or feedback, please open an issue in the GitHub repository.
