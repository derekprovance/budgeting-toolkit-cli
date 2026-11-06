import { CategorizeStatus } from '../enums.js';
import { TransactionValidationError } from '../result.type.js';

export interface CategorizeStatusDto {
    status: CategorizeStatus;
    transactionsUpdated: number;
    /** One per transaction that failed validation or could not be updated */
    errors: TransactionValidationError[];
}
