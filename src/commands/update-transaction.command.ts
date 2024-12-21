import { UpdateTransactionService } from "../services/update-transaction.service";
import { UpdateTransactionMode } from "../update-transaction-mode.enum";

export const updateTransactions = async (
  updateTransactionService: UpdateTransactionService,
  tag: string,
  updateMode: UpdateTransactionMode
) => {
  console.log("\n🔄 Categorizing transactions using LLM...");
  console.log("Tag:", tag);
  console.log("Mode:", updateMode);
  console.log("─".repeat(50));

  try {
    const results = await updateTransactionService.updateTransactionsByTag(
      tag,
      updateMode
    );

    let updatedCount = 0;

    console.log("\nTransaction Updates:");
    results.forEach((result) => {
      const hasNewCategory =
        updateMode !== UpdateTransactionMode.Budget &&
        result.category !== result.updatedCategory;
      const hasNewBudget =
        updateMode !== UpdateTransactionMode.Category &&
        result.budget !== result.updatedBudget;

      if (hasNewCategory || hasNewBudget) {
        updatedCount++;
        const changes = [];

        if (hasNewCategory) {
          changes.push(
            `Category: ${result.category || "<No Category>"} ➜ ${
              result.updatedCategory
            }`
          );
        }

        if (hasNewBudget) {
          changes.push(
            `Budget: ${result.budget || "<No Budget>"} ➜ ${
              result.updatedBudget
            }`
          );
        }

        console.log(`\n📝 ${result.name}:\n   ${changes.join("\n   ")}`);
      }
    });

    console.log("\n");
    console.log("─".repeat(50));
    console.log(`✅ Processing complete`);
    console.log(`   Total transactions: ${results.length}`);
    console.log(`   Updates made: ${updatedCount}`);
    console.log();
  } catch (error) {
    console.error("\n❌ Error processing transactions:");
    console.error("  ", error instanceof Error ? error.message : String(error));
    throw error;
  }
};
