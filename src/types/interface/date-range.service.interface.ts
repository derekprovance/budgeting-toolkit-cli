import { DateRangeDto } from '../common.types.js';

export interface IDateRangeService {
    getDateRange(month: number, year: number): DateRangeDto;
}
