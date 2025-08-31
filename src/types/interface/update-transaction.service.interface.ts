import { UpdateTransactionMode } from "../enum/update-transaction-mode.enum";
import { UpdateTransactionStatusDto } from "../dto/update-transaction-status.dto";

export interface IUpdateTransactionService {
    /**
     * Updates transactions with a given tag based on the specified mode
     * @param tag The tag to filter transactions by
     * @param updateMode The mode to use for updating (category, budget, or both)
     * @param dryRun Whether to perform a dry run without making actual changes
     * @returns A promise that resolves to the update status and results
     */
    updateTransactionsByTag(
        tag: string,
        updateMode: UpdateTransactionMode,
        dryRun?: boolean,
    ): Promise<UpdateTransactionStatusDto>;
}
