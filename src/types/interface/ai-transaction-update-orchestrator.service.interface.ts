import { CategorizeMode } from '../enums.js';
import { CategorizeStatusDto } from '../dto/categorize-status.dto.js';

export interface IAITransactionUpdateOrchestrator {
    /**
     * Updates transactions with a given tag based on the specified mode
     * @param tag The tag to filter transactions by
     * @param updateMode The mode to use for updating (category, budget, or both)
     * @returns A promise that resolves to the update status and results
     */
    updateTransactionsByTag(tag: string, updateMode: CategorizeMode): Promise<CategorizeStatusDto>;
}
