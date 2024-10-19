import { TransactionService } from "./transaction.service";

export class AdditionalIncomeService {
    constructor(private transactionService: TransactionService) {};

    async getAdditionalIncome(month: number) {
        const transactions = await this.transactionService.getTransactionsForMonth(month);
    }
}