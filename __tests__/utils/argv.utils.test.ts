import { describe, it, expect } from '@jest/globals';
import { extractConfigPath } from '../../src/utils/argv.utils.js';

const argv = (...args: string[]) => ['node', 'btk', ...args];

describe('extractConfigPath', () => {
    it('should extract --config with a space-separated value', () => {
        expect(extractConfigPath(argv('--config', '/tmp/config.yaml'))).toBe('/tmp/config.yaml');
    });

    it('should extract -c with a space-separated value', () => {
        expect(extractConfigPath(argv('-c', './config.yaml'))).toBe('./config.yaml');
    });

    it('should extract --config=path form', () => {
        expect(extractConfigPath(argv('--config=/tmp/config.yaml'))).toBe('/tmp/config.yaml');
    });

    it('should extract -c=path form', () => {
        expect(extractConfigPath(argv('-c=./config.yaml'))).toBe('./config.yaml');
    });

    it('should return undefined when no config flag is present', () => {
        expect(extractConfigPath(argv('analyze', '-m', '5'))).toBeUndefined();
    });

    it('should return undefined when the flag has no value', () => {
        expect(extractConfigPath(argv('--config'))).toBeUndefined();
        expect(extractConfigPath(argv('--config='))).toBeUndefined();
    });

    it('should not treat a following flag as the value', () => {
        expect(extractConfigPath(argv('--config', '--verbose'))).toBeUndefined();
    });

    it('should work when the flag appears after a subcommand', () => {
        expect(extractConfigPath(argv('report', '--config', '/etc/btk.yaml'))).toBe(
            '/etc/btk.yaml'
        );
    });
});
