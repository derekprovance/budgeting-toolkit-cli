import { UpdateTransactionService } from "../services/update-transaction.service";
import { UpdateTransactionMode } from "../update-transaction-mode.enum";

export const updateTransactions = async (
  updateTransactionService: UpdateTransactionService,
  tag: string,
  updateMode: UpdateTransactionMode
) => {
  console.log("Categorizing transactions using an LLM...");

  const results = await updateTransactionService.updateTransactionsByTag(
    tag,
    updateMode
  );

  results.forEach((result) => {
    let output = `${result.name}: `;
    const hasNewCategory =
      updateMode !== UpdateTransactionMode.Budget &&
      result.category !== result.updatedCategory;
    const hasNewBudget =
      updateMode !== UpdateTransactionMode.Category &&
      result.budget !== result.updatedBudget;

    if (hasNewCategory)
      output += `${result.category || "<No Category>"} => ${
        result.updatedCategory
      }`;

    output +=
      updateMode !== UpdateTransactionMode.Category && hasNewBudget
        ? `${hasNewCategory ? " | " : ""}${result.budget || "<No Budget>"} => ${
            result.updatedBudget
          }`
        : "";

    if (hasNewCategory || hasNewBudget) console.log(output);
  });
  console.log("Transactions successfully processed using LLM");
};
