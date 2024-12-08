import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";

interface LineItem {
  description: string;
  amount: number;
  formattedAmount: string;
}

interface Report {
  items: LineItem[];
  total: number;
}

export class PrinterService {
  private static readonly DESCRIPTION_PADDING = 3;
  private static readonly TOTAL_DESCRIPTION_OUTPUT = "= Total: ";

  static printTransactions(transactions: TransactionSplit[], title?: string): void {
    if (!transactions?.length) {
      console.log("No results were returned.");
      return;
    }

    const report = this.createReport(transactions);
    const maxDescriptionSize = this.calculateMaxDescription(report.items);
    const maxAmountSize = this.calculateMaxAmount(report.items);
    const borderSize = this.calculateBorderSize(maxDescriptionSize, maxAmountSize);
    const border = "=".repeat(borderSize) + "\n";

    const output = [
      border,
      ...(title ? [this.createTitle(borderSize, title), border] : []),
      ...report.items.map(item => this.formatLineItem(item, maxDescriptionSize)),
      border,
      this.generateTotalOutput(borderSize, report.total),
      border
    ].join("");

    console.log(output);
  }

  private static formatLineItem(item: LineItem, maxDescriptionSize: number): string {
    const formattedDescription = this.formatDescriptionWithMax(
      maxDescriptionSize,
      item.description
    );
    return `> ${formattedDescription}: ${item.formattedAmount}\n`;
  }

  private static generateTotalOutput(borderSize: number, total: number): string {
    const formattedTotal = this.formatCurrency(total);
    const paddingLength = borderSize - this.TOTAL_DESCRIPTION_OUTPUT.length - formattedTotal.length - 3;
    
    return [
      this.TOTAL_DESCRIPTION_OUTPUT,
      "".padEnd(paddingLength),
      formattedTotal,
      " =\n"
    ].join("");
  }

  private static createTitle(borderSize: number, title: string): string {
    const contentWidth = borderSize - 2; // Account for '=' on both sides
    const paddingTotal = contentWidth - title.length;
    const leftPadding = Math.floor(paddingTotal / 2);
    const rightPadding = paddingTotal - leftPadding;

    return [
      "=",
      "".padStart(leftPadding),
      title,
      "".padEnd(rightPadding),
      "=\n"
    ].join("");
  }

  private static calculateBorderSize(maxDescription: number, maxAmount: number): number {
    return maxDescription + maxAmount + this.DESCRIPTION_PADDING + 2;
  }

  private static calculateMaxDescription(items: LineItem[]): number {
    return Math.max(...items.map(item => item.description.length));
  }

  private static calculateMaxAmount(items: LineItem[]): number {
    return Math.max(...items.map(item => item.formattedAmount.length));
  }

  private static formatDescriptionWithMax(max: number, value: string): string {
    return value.padEnd(max + this.DESCRIPTION_PADDING);
  }

  private static createReport(transactions: TransactionSplit[]): Report {
    const items = transactions.map(item => ({
      description: item.description?.trim() || "[No Description]",
      amount: Number(item.amount),
      formattedAmount: this.formatCurrency(item.amount)
    }));

    return {
      items,
      total: this.calculateTotal(transactions)
    };
  }

  private static formatCurrency(amount: number | string): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2
    }).format(Number(amount));
  }

  private static calculateTotal(transactions: TransactionSplit[]): number {
    return transactions.reduce((sum, transaction) => 
      sum + Number(transaction.amount), 0);
  }
}