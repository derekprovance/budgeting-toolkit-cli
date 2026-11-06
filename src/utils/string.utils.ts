export class StringUtils {
    static normalizeForMatching(value: string): string {
        return value.trim().toLowerCase();
    }
}
