# Firefly III CLI

A opinionated command-line interface (CLI) for interacting with the Firefly III Personal Finance Manager API. This CLI allows you to perform various budget related operations.

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

3. Copy the `.env.example` file in the project root and replace the values with your actual Firefly III API URL, API token, and paths to your certificate files.
   ```
   cp .env.example .env
   ```

## Usage

To use the Firefly III CLI, run the following command:

```
npm start -- [command] [options]
```

Available commands:

1. Calculate unbudgeted transactions:
   ```
   npm start -- calculate-unbudgeted

2. Calculate additional income transactions:
   ```
   npm start -- calculate-additional
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
