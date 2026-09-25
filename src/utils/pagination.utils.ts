import { ILogger } from '../types/interface/logger.interface.js';
import { logger as defaultLogger } from '../logger.js';

/**
 * The shape every Firefly III list endpoint returns: a page of `data` plus a
 * `meta.pagination` block describing how many pages exist in total.
 */
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

/** The page size requested when `BTK_PAGE_SIZE` is unset or invalid. */
export const DEFAULT_PAGE_SIZE = 500;

/** Largest page size `BTK_PAGE_SIZE` may request. */
export const MAX_PAGE_SIZE = 500;

/**
 * Resolves the page size from a raw `BTK_PAGE_SIZE` value.
 *
 * A test seam: the harness sets a small page size so that a modest seeded
 * ledger still spans several pages and pagination is exercised for real.
 * Accepts a whole number from 1 to {@link MAX_PAGE_SIZE}. Anything else falls
 * back to {@link DEFAULT_PAGE_SIZE} with a warning rather than failing, since
 * a wrong page size changes round-trips, never results.
 *
 * @param raw The raw environment value (undefined or empty means unset)
 * @param logger Optional logger override
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
 * Items requested per page.
 *
 * Firefly III's documented default is 50, but the page size is instance
 * configurable and a server may well default higher. Requesting fewer than the
 * server would have given costs extra round-trips for nothing, so this asks for
 * a generous page. The loop below follows `total_pages` regardless, so an
 * instance that serves a smaller page is still drained completely.
 *
 * Overridable through `BTK_PAGE_SIZE` (see {@link resolvePageSize}). Resolved
 * once, at module load: every call site passes this constant as `limit`, and a
 * page size that stays fixed for the life of the process means every page of
 * one listing is requested with the same `limit`. The variable must therefore
 * be in the process environment at startup — a value in a `.env` file loaded
 * later by ConfigManager is not seen.
 */
export const PAGE_SIZE = resolvePageSize(process.env.BTK_PAGE_SIZE);

/**
 * Guard against an endpoint that ignores the `page` parameter and would
 * otherwise return page 1 forever.
 */
const MAX_PAGES = 500;

/**
 * Drains every page of a Firefly III list endpoint into a single array.
 *
 * Firefly paginates all list endpoints and reports the page count in
 * `meta.pagination.total_pages`. Callers that read only `response.data` get
 * the first page and nothing else, so every list call in this codebase must
 * go through here.
 *
 * @param fetchPage Fetches one page; receives the 1-based page number
 * @param operation Human-readable name used in errors and warnings
 * @param logger Optional logger override
 * @returns Every item across every page, in page order
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

        // No pagination block means the endpoint is not paginated (insights,
        // for example). Trust the single response rather than guessing.
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
