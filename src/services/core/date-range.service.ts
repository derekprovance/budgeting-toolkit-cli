import { IDateRangeService } from '../../types/interface/date-range.service.interface.js';
import { DateRangeDto } from '../../types/common.types.js';

export class DateRangeService implements IDateRangeService {
    getDateRange(month: number, year: number): DateRangeDto {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        return { startDate, endDate };
    }
}
