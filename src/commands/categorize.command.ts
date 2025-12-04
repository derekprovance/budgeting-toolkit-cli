import { AITransactionUpdateOrchestrator } from '../services/ai-transaction-update-orchestrator.service.js';
import { CategorizeMode } from '../types/enum/categorize-mode.enum.js';
import { CategorizeStatus } from '../types/enum/categorize-status.enum.js';
import { Command } from '../types/interface/command.interface.js';
import { CategorizeDisplayService } from '../services/display/categorize-display.service.js';

interface UpdateTransactionsParams {
    tag: string;
    updateMode: CategorizeMode;
    dryRun?: boolean;
}

export class CategorizeCommand implements Command<void, UpdateTransactionsParams> {
    private readonly displayService: CategorizeDisplayService;

    constructor(private readonly aiTransactionUpdateOrchestrator: AITransactionUpdateOrchestrator) {
        this.displayService = new CategorizeDisplayService();
    }

    async execute({ tag, updateMode, dryRun = false }: UpdateTransactionsParams): Promise<void> {
        console.log(this.displayService.formatProcessingHeader(tag, updateMode, dryRun));

        try {
            const results = await this.aiTransactionUpdateOrchestrator.updateTransactionsByTag(
                tag,
                updateMode,
                dryRun
            );

            if (results.status === CategorizeStatus.NO_TAG) {
                console.log(this.displayService.formatTagNotFound(tag));
                return;
            }

            if (results.status === CategorizeStatus.EMPTY_TAG) {
                console.log(this.displayService.formatEmptyTag(tag));
                return;
            }

            const prefix = dryRun ? '[DRYRUN] ' : '';
            console.log(`\n${prefix}Updated ${results.transactionsUpdated} Transaction(s)!`);

            if (results.transactionErrors && results.transactionErrors > 0) {
                console.log(
                    `\n⚠️  Warning: ${results.transactionErrors} transaction(s) failed to update. Check logs for details.`
                );
            }
        } catch (error) {
            console.log(this.displayService.formatError(error));
            throw error;
        }
    }
}
