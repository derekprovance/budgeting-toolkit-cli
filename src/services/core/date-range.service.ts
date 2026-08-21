import { IDateRangeService } from '../../types/interface/date-range.service.interface.js';
import { DateRangeDto } from '../../types/common.types.js';

export class DateRangeService implements IDateRangeService {
    getDateRange(month: number, year: number): DateRangeDto {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        return {
            startDate,
            endDate,
            startDateString: DateRangeService.toLocalDateString(startDate),
            endDateString: DateRangeService.toLocalDateString(endDate),
        };
    }

    /**
     * Formats using local date parts. `toISOString()` converts to UTC, which
     * shifts local midnight to the previous day in UTC+ timezones.
     */
    private static toLocalDateString(date: Date): string {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
}
