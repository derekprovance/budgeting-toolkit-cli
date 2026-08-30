import '../setup/mock-logger.js'; // Must be first to mock logger module
import { jest } from '@jest/globals';
import { fetchAllPages, PaginatedResponse } from '../../src/utils/pagination.utils.js';

/** Builds one page of a Firefly III list response. */
const page = <T>(data: T[], currentPage: number, totalPages: number): PaginatedResponse<T> => ({
    data,
    meta: { pagination: { current_page: currentPage, total_pages: totalPages } },
});

describe('fetchAllPages', () => {
    it('drains every page, not just the first', async () => {
        const fetchPage = jest.fn(async (p: number) => page([`item-${p}a`, `item-${p}b`], p, 3));

        const result = await fetchAllPages(fetchPage, 'fetch things');

        expect(result).toEqual(['item-1a', 'item-1b', 'item-2a', 'item-2b', 'item-3a', 'item-3b']);
        expect(fetchPage).toHaveBeenCalledTimes(3);
        expect(fetchPage).toHaveBeenNthCalledWith(1, 1);
        expect(fetchPage).toHaveBeenNthCalledWith(3, 3);
    });

    it('stops after one request when there is only one page', async () => {
        const fetchPage = jest.fn(async (p: number) => page(['only'], p, 1));

        const result = await fetchAllPages(fetchPage, 'fetch things');

        expect(result).toEqual(['only']);
        expect(fetchPage).toHaveBeenCalledTimes(1);
    });

    it('treats a response without pagination metadata as a single page', async () => {
        const fetchPage = jest.fn(async () => ({ data: ['a', 'b'] }));

        const result = await fetchAllPages(fetchPage, 'fetch things');

        expect(result).toEqual(['a', 'b']);
        expect(fetchPage).toHaveBeenCalledTimes(1);
    });

    it('returns an empty array when the first page is empty', async () => {
        const fetchPage = jest.fn(async (p: number) => page<string>([], p, 1));

        await expect(fetchAllPages(fetchPage, 'fetch things')).resolves.toEqual([]);
    });

    it('throws when a page comes back without data', async () => {
        const fetchPage = jest.fn(async () => undefined);

        await expect(fetchAllPages(fetchPage, 'fetch things')).rejects.toThrow(
            'Failed to fetch things'
        );
    });

    it('preserves page order across pages', async () => {
        const pages: Record<number, number[]> = { 1: [1, 2], 2: [3, 4], 3: [5] };
        const fetchPage = jest.fn(async (p: number) => page(pages[p], p, 3));

        await expect(fetchAllPages(fetchPage, 'fetch things')).resolves.toEqual([1, 2, 3, 4, 5]);
    });

    it('does not loop forever when the endpoint ignores the page parameter', async () => {
        // total_pages stays high while every request returns page 1
        const fetchPage = jest.fn(async () => page(['stuck'], 1, 10_000));

        const result = await fetchAllPages(fetchPage, 'fetch things');

        expect(fetchPage.mock.calls.length).toBeLessThanOrEqual(500);
        expect(result.length).toBeLessThanOrEqual(500);
    });
});
