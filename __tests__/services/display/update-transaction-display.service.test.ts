// Mock chalk with chained methods
const createChalkMock = () => {
    interface ChalkChain {
        (text: string): string;
        bold: ChalkChain;
        cyan: ChalkChain;
        yellow: ChalkChain;
        blue: ChalkChain;
        blueBright: ChalkChain;
        gray: ChalkChain;
        green: ChalkChain;
        red: ChalkChain;
        redBright: ChalkChain;
        white: ChalkChain;
    }

    const chainedFn = ((text: string) => text) as unknown as ChalkChain;
    const methods = [
        'bold',
        'cyan',
        'yellow',
        'blue',
        'blueBright',
        'gray',
        'green',
        'red',
        'redBright',
        'white',
    ] as const;

    methods.forEach(method => {
        chainedFn[method] = ((text?: string) => {
            if (text === undefined) {
                return chainedFn;
            }
            return text;
        }) as unknown as ChalkChain;
    });

    return chainedFn;
};

jest.mock('chalk', () => createChalkMock());

import { UpdateTransactionDisplayService } from '../../../src/services/display/update-transaction-display.service';
import { UpdateTransactionMode } from '../../../src/types/enum/update-transaction-mode.enum';

describe('UpdateTransactionDisplayService', () => {
    let service: UpdateTransactionDisplayService;

    beforeEach(() => {
        service = new UpdateTransactionDisplayService();
    });

    describe('formatProcessingHeader', () => {
        it('should format the processing header correctly', () => {
            const result = service.formatProcessingHeader('test-tag', UpdateTransactionMode.Both);
            expect(result).toContain(
                'Processing transactions with tag "test-tag" for categories and budgets'
            );
        });
    });

    describe('formatTagNotFound', () => {
        it('should format the tag not found message correctly', () => {
            const result = service.formatTagNotFound('test-tag');
            expect(result).toContain('❌ Tag "test-tag" not found');
        });
    });

    describe('formatEmptyTag', () => {
        it('should format the empty tag message correctly', () => {
            const result = service.formatEmptyTag('test-tag');
            expect(result).toContain('No transactions found with tag "test-tag"');
        });
    });

    describe('formatError', () => {
        it('should format error messages correctly', () => {
            const error = new Error('Test error message');
            const result = service.formatError(error);
            expect(result).toContain('Error processing transactions');
            expect(result).toContain('Test error message');
        });

        it('should handle non-Error objects', () => {
            const result = service.formatError('Test error');
            expect(result).toContain('Error processing transactions');
            expect(result).toContain('Test error');
        });
    });
});
