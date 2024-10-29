import { TransactionSplit } from "firefly-iii-sdk";

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

  static printTransactions(
    transactions: TransactionSplit[],
    title?: string
  ): void {
    const report = this.createReport(transactions);

    const maxDescriptionSize = this.calculateMaxDescription(report.items);
    const maxAmountSize = this.calculateMaxAmount(report.items);
    const border = this.calculateBorderSize(maxDescriptionSize, maxAmountSize);

    let output = border;
    if (title) {
      output += this.createTitle(border.length, title);
      output += border;
    }
    report.items.forEach((item) => {
      output += `> ${this.formatDescriptionWithMax(
        maxDescriptionSize,
        item.description
      )}: ${item.formattedAmount}\n`;
    });
    output += border;
    output += this.generateTotalOutput(border.length, report.total);
    output += border;

    console.log(output);
  }

  private static generateTotalOutput(maxLength: number, total: number) {
    const totalDescription = "= Total: ";
    const formattedTotal = this.formatCurrency(total);

    return `${totalDescription.padEnd(
      maxLength - totalDescription.length - 2
    )}${formattedTotal} =\n`;
  }

  private static createTitle(maxLength: number, title: string): string {
    const totalPadding = maxLength - title.length - 2; // Space for borders
    const leftPadding = Math.floor(totalPadding / 2);

    // Clearer approach
    const centeredTitle = title
      .padStart(title.length - 1 + leftPadding) // Add left padding
      .padEnd(maxLength - 3); // Fill to final width (minus borders)

    return `=${centeredTitle}=\n`;
  }

  private static calculateBorderSize(
    maxDescription: number,
    maxAmount: number
  ) {
    let output = "".padEnd(
      maxDescription + maxAmount + this.DESCRIPTION_PADDING + 2,
      "="
    );
    output += "\n";

    return output;
  }

  private static calculateMaxDescription(items: LineItem[]): number {
    return Math.max(...items.map((l) => l.description.length));
  }

  private static calculateMaxAmount(items: LineItem[]): number {
    return Math.max(...items.map((l) => l.formattedAmount.length));
  }

  private static formatDescriptionWithMax(max: number, value: string): string {
    return value.padEnd(max + this.DESCRIPTION_PADDING);
  }

  private static createReport(transactions: TransactionSplit[]) {
    const newReport: Report = { items: [], total: 0 };

    transactions.forEach((item) => {
      const lineItem: LineItem = {
        description: item.description,
        amount: Number(item.amount),
        formattedAmount: this.formatCurrency(item.amount),
      };

      newReport.items?.push(lineItem);
    });

    newReport.total = this.calculateTotal(transactions);

    return newReport;
  }

  private static formatCurrency(x: number | string): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(Number(x));
  }

  private static calculateTotal(transactions: TransactionSplit[]): number {
    let total = 0;

    for (let i = 0; i < transactions.length; i++) {
      const transaction = transactions[i];
      total += Number(transaction.amount);
    }

    return total;
  }
}
