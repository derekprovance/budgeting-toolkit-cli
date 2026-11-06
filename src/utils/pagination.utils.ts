import { ILogger } from '../types/interface/logger.interface.js';
import { logger as defaultLogger } from '../logger.js';

export interface PaginatedResponse<T> {
    data?: T[];
    meta?: {
        pagination?: {
            total?: number;
            count?: number;
            per_page?: number;
            current_page?: number;
            total_pages?: number;
        };
    };
}

export const DEFAULT_PAGE_SIZE = 500;

export const MAX_PAGE_SIZE = 500;

/**
 * A test seam: the harness sets a small page size so a modest ledger still
 * spans several pages. An invalid value falls back with a warning rather than
 * failing, since a wrong page size changes round-trips, never results.
 */
export function resolvePageSize(raw: string | undefined, logger: ILogger = defaultLogger): number {
    if (raw === undefined || raw.trim() === '') {
        return DEFAULT_PAGE_SIZE;
    }

    const trimmed = raw.trim();
    const parsed = Number(trimmed);
    if (!/^\d+$/.test(trimmed) || parsed < 1 || parsed > MAX_PAGE_SIZE) {
        logger.warn(
            { BTK_PAGE_SIZE: raw, fallback: DEFAULT_PAGE_SIZE },
            `Ignoring invalid BTK_PAGE_SIZE - expected an integer from 1 to ${MAX_PAGE_SIZE}`
        );
        return DEFAULT_PAGE_SIZE;
    }

    return parsed;
}

/**
 * Firefly's documented default is 50, but the page size is instance
 * configurable, so this asks for a generous page; `fetchAllPages` follows
 * `total_pages` regardless. Resolved once at module load so every page of a
 * listing uses the same `limit`: `BTK_PAGE_SIZE` must be in the process
 * environment, as a value in a `.env` file loaded later is not seen.
 */
export const PAGE_SIZE = resolvePageSize(process.env.BTK_PAGE_SIZE);

/** Guards against an endpoint that ignores `page` and returns page 1 forever. */
const MAX_PAGES = 500;

/**
 * Firefly paginates every list endpoint, so reading only `response.data`
 * silently truncates; every list call goes through here. `fetchPage` receives
 * the 1-based page number. Throws when a page comes back without `data`.
 */
export async function fetchAllPages<T>(
    fetchPage: (page: number) => Promise<PaginatedResponse<T> | undefined>,
    operation: string,
    logger: ILogger = defaultLogger
): Promise<T[]> {
    const items: T[] = [];
    let page = 1;

    for (;;) {
        const response = await fetchPage(page);

        if (!response?.data) {
            throw new Error(`Failed to ${operation}: API returned empty response on page ${page}`);
        }

        items.push(...response.data);

        const totalPages = response.meta?.pagination?.total_pages;

        // No pagination block means the endpoint is not paginated (insights, for example)
        if (totalPages === undefined) {
            if (page === 1) {
                logger.debug(
                    { operation, itemCount: items.length },
                    'Response carried no pagination metadata - treating as a single page'
                );
            }
            break;
        }

        if (page >= totalPages) {
            break;
        }

        if (page >= MAX_PAGES) {
            logger.warn(
                { operation, page, totalPages, itemCount: items.length },
                'Stopped paginating at the page ceiling - results may be incomplete'
            );
            break;
        }

        page++;
    }

    logger.debug({ operation, pages: page, itemCount: items.length }, 'Fetched all pages');

    return items;
}
