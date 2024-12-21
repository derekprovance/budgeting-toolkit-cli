import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";

interface PrinterConfig {
  descriptionPadding: number;
  totalDescriptionOutput: string;
  currency: string;
  locale: string;
}

interface LineItem {
  description: string;
  amount: number;
  formattedAmount: string;
}

interface Report {
  items: LineItem[];
  total: number;
  title?: string;
}

interface FormattingOptions {
  maxDescriptionSize: number;
  maxAmountSize: number;
  borderSize: number;
}

export class PrinterService {
  private static readonly DEFAULT_CONFIG: PrinterConfig = {
    descriptionPadding: 3,
    totalDescriptionOutput: " Total: ",
    currency: "USD",
    locale: "en-US",
  };

  private static config: PrinterConfig = PrinterService.DEFAULT_CONFIG;

  static setConfig(config: Partial<PrinterConfig>): void {
    PrinterService.config = { ...PrinterService.DEFAULT_CONFIG, ...config };
  }

  static printTransactions(transactions: TransactionSplit[], title?: string): void {
    if (!PrinterService.validateTransactions(transactions)) {
      console.log("No results were returned.");
      return;
    }

    try {
      const report = PrinterService.createReport(transactions, title);
      const formattingOptions = PrinterService.calculateFormattingOptions(report.items);
      const output = PrinterService.formatReport(report, formattingOptions);
      console.log(output);
    } catch (error) {
      console.error("Error printing transactions:", error);
    }
  }

  private static validateTransactions(transactions: TransactionSplit[]): boolean {
    return Array.isArray(transactions) && transactions.length > 0;
  }

  private static createReport(
    transactions: TransactionSplit[],
    title?: string
  ): Report {
    const items = transactions.map((item) => ({
      description: item.description?.trim() || "[No Description]",
      amount: Number(item.amount),
      formattedAmount: PrinterService.formatCurrency(item.amount),
    }));

    return {
      items,
      total: PrinterService.calculateTotal(transactions),
      title,
    };
  }

  private static calculateFormattingOptions(items: LineItem[]): FormattingOptions {
    const maxDescriptionSize = Math.max(
      ...items.map((item) => item.description.length)
    );
    const maxAmountSize = Math.max(
      ...items.map((item) => item.formattedAmount.length)
    );
    const borderSize =
      maxDescriptionSize + maxAmountSize + PrinterService.config.descriptionPadding! + 2;

    return { maxDescriptionSize, maxAmountSize, borderSize };
  }

  private static formatReport(report: Report, options: FormattingOptions): string {
    const border = "=".repeat(options.borderSize) + "\n";
    const sections = [border];

    if (report.title) {
      sections.push(PrinterService.formatTitle(report.title, options.borderSize), border);
    }

    sections.push(
      ...report.items.map((item) =>
        PrinterService.formatLineItem(item, options.maxDescriptionSize)
      ),
      border,
      PrinterService.formatTotal(report.total, options.borderSize),
      border
    );

    return sections.join("");
  }

  private static formatLineItem(item: LineItem, maxDescriptionSize: number): string {
    const description = item.description.padEnd(
      maxDescriptionSize + PrinterService.config.descriptionPadding!
    );
    return `> ${description}: ${item.formattedAmount}\n`;
  }

  private static formatTitle(title: string, borderSize: number): string {
    const contentWidth = borderSize - 2;
    const paddingTotal = contentWidth - title.length;
    const leftPadding = Math.floor(paddingTotal / 2);
    const rightPadding = paddingTotal - leftPadding;

    if (title.length > contentWidth) {
      title = title.substring(0, contentWidth - 3) + "...";
    }

    return [
      " ",
      "".padStart(leftPadding),
      title,
      "".padEnd(rightPadding),
      "\n",
    ].join("");
  }

  private static formatTotal(total: number, borderSize: number): string {
    const formattedTotal = PrinterService.formatCurrency(total);
    const paddingLength =
      borderSize -
      PrinterService.config.totalDescriptionOutput!.length -
      formattedTotal.length -
      3;

    return [
      PrinterService.config.totalDescriptionOutput!,
      "".padEnd(paddingLength),
      formattedTotal,
      "\n",
    ].join("");
  }

  private static formatCurrency(amount: number | string): string {
    return new Intl.NumberFormat(PrinterService.config.locale, {
      style: "currency",
      currency: PrinterService.config.currency,
      minimumFractionDigits: 2,
    }).format(Number(amount));
  }

  private static calculateTotal(transactions: TransactionSplit[]): number {
    return transactions.reduce(
      (sum, transaction) => sum + Number(transaction.amount),
      0
    );
  }
}
