import {
  Bill,
  BillArray,
  BillRepeatFrequency,
  FireflyApiClient,
  FireflyApiError,
} from "@derekprovance/firefly-iii-sdk";
import { logger } from "../logger";
import { DateUtils } from "../utils/date.utils";

class ExpectedBillError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = "ExpectedBillError";
  }
}

export class ExpectedBillService {
  private billsCache: Bill[] | null = null;
  private lastFetchTime: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly apiClient: FireflyApiClient) {}

  async getExpectedBillSumForMonth(month: number, year: number): Promise<number> {
    try {
      DateUtils.validateMonthYear(month, year);
      
      const activeBills = await this.getActiveBills();
      const targetDate = new Date(year, month - 1, 1);
      
      let totalExpected = 0;
      
      for (const bill of activeBills) {
        if (this.isBillDueInMonth(bill, targetDate)) {
          const expectedAmount = this.parseAmount(bill.amount_max);
          totalExpected += expectedAmount;
          
          logger.debug(`Bill "${bill.name}" expected in ${month}/${year}: ${expectedAmount}`, {
            billId: bill.name,
            amount: expectedAmount,
            frequency: bill.repeat_freq,
          });
        }
      }
      
      logger.info(`Total expected bills for ${month}/${year}: ${totalExpected}`, {
        month,
        year,
        totalAmount: totalExpected,
        billCount: activeBills.filter(bill => this.isBillDueInMonth(bill, targetDate)).length,
      });
      
      return totalExpected;
    } catch (error) {
      const errorMessage = `Failed to calculate expected bill sum for ${month}/${year}`;
      logger.error(errorMessage, { error, month, year });
      throw new ExpectedBillError(errorMessage, error as Error);
    }
  }

  async getAverageMonthlyBillsForYear(year: number): Promise<number> {
    try {
      DateUtils.validateMonthYear(1, year); // Validate year format
      
      const activeBills = await this.getActiveBills();
      let totalYearlyExpected = 0;
      
      for (const bill of activeBills) {
        const yearlyAmount = this.calculateYearlyAmount(bill, year);
        totalYearlyExpected += yearlyAmount;
        
        logger.debug(`Bill "${bill.name}" yearly expected for ${year}: ${yearlyAmount}`, {
          billId: bill.name,
          yearlyAmount,
          frequency: bill.repeat_freq,
        });
      }
      
      const monthlyAverage = totalYearlyExpected / 12;
      
      logger.info(`Average monthly bills for ${year}: ${monthlyAverage}`, {
        year,
        totalYearly: totalYearlyExpected,
        monthlyAverage,
        billCount: activeBills.length,
      });
      
      return monthlyAverage;
    } catch (error) {
      const errorMessage = `Failed to calculate average monthly bills for ${year}`;
      logger.error(errorMessage, { error, year });
      throw new ExpectedBillError(errorMessage, error as Error);
    }
  }

  private async getActiveBills(): Promise<Bill[]> {
    try {
      if (this.isCacheValid()) {
        logger.debug("Using cached bills data");
        return this.billsCache!;
      }

      logger.debug("Fetching active bills from API");
      const response = await this.apiClient.get<BillArray>("/v1/bills");
      
      if (!response?.data) {
        throw new Error("No bills data received from API");
      }

      const allBills = response.data.map(billRead => billRead.attributes);
      const activeBills = allBills.filter(bill => bill.active === true);
      
      this.billsCache = activeBills;
      this.lastFetchTime = Date.now();
      
      logger.info(`Fetched ${activeBills.length} active bills (${allBills.length} total)`, {
        activeBills: activeBills.length,
        totalBills: allBills.length,
      });
      
      return activeBills;
    } catch (error) {
      const errorMessage = "Failed to fetch active bills";
      logger.error(errorMessage, { error });
      
      if (error instanceof FireflyApiError) {
        throw new ExpectedBillError(`${errorMessage}: ${error.message}`, error);
      }
      throw new ExpectedBillError(errorMessage, error as Error);
    }
  }

  private isCacheValid(): boolean {
    return this.billsCache !== null && (Date.now() - this.lastFetchTime) < this.CACHE_TTL;
  }

  private isBillDueInMonth(bill: Bill, targetDate: Date): boolean {
    // Parse dates using UTC to avoid timezone issues
    const billDate = new Date(bill.date + (bill.date.includes('T') ? '' : 'T00:00:00Z'));
    const targetMonth = targetDate.getMonth();
    const targetYear = targetDate.getFullYear();
    const targetMonthEnd = new Date(targetYear, targetMonth + 1, 0); // Last day of target month
    
    // Handle end_date - if bill has ended before target month, it's not due
    if (bill.end_date) {
      const endDate = new Date(bill.end_date + (bill.end_date.includes('T') ? '' : 'T00:00:00Z'));
      if (endDate < targetDate) {
        return false;
      }
    }
    
    // Handle bills that start after the target month ends
    if (billDate > targetMonthEnd) {
      return false;
    }
    
    // Handle bills that start in the target month
    const billMonth = billDate.getUTCMonth();
    const billYear = billDate.getUTCFullYear();
    if (billYear === targetYear && billMonth === targetMonth) {
      return true;
    }
    
    // If bill started before target month, check recurrence pattern
    if (billDate <= targetDate) {
      return this.calculateBillOccurrenceInMonth(bill, targetMonth, targetYear);
    }
    
    return false;
  }

  private calculateBillOccurrenceInMonth(bill: Bill, targetMonth: number, targetYear: number): boolean {
    // Parse dates using UTC to avoid timezone issues
    const billDate = new Date(bill.date + (bill.date.includes('T') ? '' : 'T00:00:00Z'));
    const billMonth = billDate.getUTCMonth();
    const billYear = billDate.getUTCFullYear();
    
    switch (bill.repeat_freq) {
      case 'weekly':
        // Weekly bills occur every month
        return true;
        
      case 'monthly':
        // Monthly bills with skip logic
        const monthsSinceBillStart = (targetYear - billYear) * 12 + (targetMonth - billMonth);
        const skipPattern = (bill.skip || 0) + 1; // skip=1 means every other month
        return monthsSinceBillStart >= 0 && monthsSinceBillStart % skipPattern === 0;
        
      case 'quarterly':
        // Quarterly bills (every 3 months)
        const monthsSinceBillStartQuarterly = (targetYear - billYear) * 12 + (targetMonth - billMonth);
        return monthsSinceBillStartQuarterly >= 0 && monthsSinceBillStartQuarterly % 3 === 0;
        
      case 'half-year':
        // Half-yearly bills (every 6 months)
        const monthsSinceBillStartHalfYear = (targetYear - billYear) * 12 + (targetMonth - billMonth);
        return monthsSinceBillStartHalfYear >= 0 && monthsSinceBillStartHalfYear % 6 === 0;
        
      case 'yearly':
        // Yearly bills (same month each year)
        return targetMonth === billMonth && targetYear >= billYear;
        
      default:
        logger.warn(`Unknown repeat frequency: ${bill.repeat_freq} for bill "${bill.name}"`);
        return false;
    }
  }

  private calculateYearlyAmount(bill: Bill, year: number): number {
    const billAmount = this.parseAmount(bill.amount_max);
    // Parse dates using UTC to avoid timezone issues
    const billDate = new Date(bill.date + (bill.date.includes('T') ? '' : 'T00:00:00Z'));
    const billYear = billDate.getUTCFullYear();
    
    // If bill starts after the target year, return 0
    if (billYear > year) {
      return 0;
    }
    
    // If bill has ended before the target year, return 0
    if (bill.end_date) {
      const endDate = new Date(bill.end_date + (bill.end_date.includes('T') ? '' : 'T00:00:00Z'));
      if (endDate.getUTCFullYear() < year) {
        return 0;
      }
    }
    
    switch (bill.repeat_freq) {
      case 'weekly':
        // 52 weeks per year
        return billAmount * 52;
        
      case 'monthly':
        // 12 months per year, adjusted for skip
        const skipPattern = (bill.skip || 0) + 1;
        return billAmount * (12 / skipPattern);
        
      case 'quarterly':
        // 4 quarters per year
        return billAmount * 4;
        
      case 'half-year':
        // 2 half-years per year
        return billAmount * 2;
        
      case 'yearly':
        // 1 occurrence per year
        return billAmount;
        
      default:
        logger.warn(`Unknown repeat frequency: ${bill.repeat_freq} for bill "${bill.name}"`);
        return 0;
    }
  }

  private parseAmount(amountStr: string): number {
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) {
      throw new Error(`Invalid amount format: ${amountStr}`);
    }
    return Math.abs(amount); // Ensure positive amount
  }
}