import { AITransactionUpdateOrchestrator } from '../services/ai-transaction-update-orchestrator.service.js';
import { CategorizeMode } from '../types/enums.js';
import { CategorizeStatus } from '../types/enums.js';
import { Command } from '../types/interface/command.interface.js';
import { CategorizeDisplayService } from '../services/display/categorize-display.service.js';
import { isCertificateError } from '../utils/error-detection.utils.js';
import { CategorizeStatusDto } from '../types/dto/categorize-status.dto.js';

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

        const results = await this.updateTransactionsByTag(tag, updateMode);

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

        if (results.errors.length > 0) {
            console.error(this.displayService.formatTransactionErrors(results.errors));
        }
    }

    /** cli.ts reports a failure itself; only certificate remediation is added here */
    private async updateTransactionsByTag(
        tag: string,
        updateMode: CategorizeMode
    ): Promise<CategorizeStatusDto> {
        try {
            return await this.aiTransactionUpdateOrchestrator.updateTransactionsByTag(
                tag,
                updateMode
            );
        } catch (error) {
            if (isCertificateError(error)) {
                console.error(this.displayService.formatCertificateHelp());
            }
            throw error;
        }
    }
}
