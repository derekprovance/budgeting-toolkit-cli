import { LLMAssignmentService } from '../../../src/services/ai/llm-assignment.service';

export interface MockAssignmentService
    extends Pick<LLMAssignmentService, 'assignCategories' | 'assignBudgets'> {
    assignCategories: jest.Mock;
    assignBudgets: jest.Mock;
}
