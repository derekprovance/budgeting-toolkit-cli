import { DateRangeDto } from '../common.types.js';

export interface IDateRangeService {
    getDateRange(month: number, year: number): DateRangeDto;
}

export class DateRangeService implements IDateRangeService {
    getDateRange(month: number, year: number): DateRangeDto {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        return { startDate, endDate };
    }
}
