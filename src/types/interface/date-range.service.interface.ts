import { DateRangeDto } from '../dto/date-range.dto';

export interface IDateRangeService {
    getDateRange(month: number, year: number): DateRangeDto;
}

export class DateRangeService {
    static getDateRange(month: number, year: number): DateRangeDto {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        return { startDate, endDate };
    }
}
