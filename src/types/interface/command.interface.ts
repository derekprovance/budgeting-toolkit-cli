export interface Command<T = void, P = void> {
  execute(params: P): Promise<T>;
} 