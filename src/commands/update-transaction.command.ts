import { UpdateTransactionService } from "../services/update-transaction.service";
import { UpdateTransactionMode } from "../types/enum/update-transaction-mode.enum";
import { UpdateTransactionStatus } from "../types/enum/update-transaction-status.enum";
import { Command } from "../types/interface/command.interface";
import { UpdateTransactionDisplayService } from "../services/display/update-transaction-display.service";

interface UpdateTransactionsParams {
    tag: string;
    updateMode: UpdateTransactionMode;
    dryRun?: boolean;
}

export class UpdateTransactionsCommand
    implements Command<void, UpdateTransactionsParams>
{
    private readonly displayService: UpdateTransactionDisplayService;

    constructor(
        private readonly updateTransactionService: UpdateTransactionService,
    ) {
        this.displayService = new UpdateTransactionDisplayService();
    }

    async execute({
        tag,
        updateMode,
        dryRun,
    }: UpdateTransactionsParams): Promise<void> {
        console.log(
            this.displayService.formatProcessingHeader(tag, updateMode, dryRun),
        );

        try {
            const results =
                await this.updateTransactionService.updateTransactionsByTag(
                    tag,
                    updateMode,
                    dryRun,
                );

            if (results.status === UpdateTransactionStatus.NO_TAG) {
                console.log(this.displayService.formatTagNotFound(tag));
                return;
            }

            if (results.status === UpdateTransactionStatus.EMPTY_TAG) {
                console.log(this.displayService.formatEmptyTag(tag));
                return;
            }
        } catch (error) {
            console.log(this.displayService.formatError(error));
            throw error;
        }
    }
}
