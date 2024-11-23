import { UpdateTransactionService } from "../services/update-transaction.service";

export const updateTransactions = async (
  updateTransactionService: UpdateTransactionService,
  tag: string,
  updateBudget: boolean
) => {
  console.log("Categorizing transactions using an LLM...");

  const results = await updateTransactionService.updateTransactionsByTag(
    tag,
    updateBudget
  );

  results.forEach((result) => {
    let output = `${result.name}: `;
    const hasNewCategory = result.category !== result.updatedCategory;
    const hasNewBudget = result.budget !== result.updatedBudget;

    if (hasNewCategory)
      output += `${result.category || "<No Category>"} => ${
        result.updatedCategory
      }`;

    output +=
      updateBudget && hasNewBudget
        ? `${hasNewCategory ? " | " : ""}${result.budget || "<No Budget>"} => ${
            result.updatedBudget
          }`
        : "";

    if (hasNewCategory || hasNewBudget) console.log(output);
  });
};
