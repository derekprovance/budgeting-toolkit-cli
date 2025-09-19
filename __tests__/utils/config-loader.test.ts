import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import {
    loadYamlConfig,
    getConfigValue,
    clearConfigCache,
} from "../../src/utils/config-loader";

// Mock fs and yaml modules
jest.mock("fs");
jest.mock("js-yaml");

const mockFs = fs as jest.Mocked<typeof fs>;
const mockYaml = yaml as jest.Mocked<typeof yaml>;

describe("config-loader", () => {
    let originalProcessCwd: () => string;

    beforeAll(() => {
        originalProcessCwd = process.cwd;
    });

    afterAll(() => {
        process.cwd = originalProcessCwd;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        // Clear cache before each test
        clearConfigCache();
        // Mock process.cwd to return a consistent path
        process.cwd = jest.fn().mockReturnValue("/test/path");
        // Clear environment variables
        delete process.env.TEST_ENV_VAR;
    });

    describe("loadYamlConfig", () => {
        it("should load config from file when not cached", () => {
            const mockConfig = { expectedMonthlyPaycheck: 5000 };
            const expectedPath = path.join(
                "/test/path",
                "budgeting-toolkit.config.yaml",
            );

            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(
                "expectedMonthlyPaycheck: 5000",
            );
            mockYaml.load.mockReturnValue(mockConfig);

            const result = loadYamlConfig();

            expect(mockFs.existsSync).toHaveBeenCalledWith(expectedPath);
            expect(mockFs.readFileSync).toHaveBeenCalledWith(
                expectedPath,
                "utf8",
            );
            expect(mockYaml.load).toHaveBeenCalledWith(
                "expectedMonthlyPaycheck: 5000",
            );
            expect(result).toEqual(mockConfig);
        });

        it("should throw error if config file does not exist", () => {
            mockFs.existsSync.mockReturnValue(false);

            expect(() => loadYamlConfig()).toThrow(
                "Failed to load YAML configuration"
            );
        });

        it("should throw error if YAML loading fails", () => {
            const error = new Error("YAML parse error");

            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue("invalid: yaml: content");
            mockYaml.load.mockImplementation(() => {
                throw error;
            });

            expect(() => loadYamlConfig()).toThrow(
                "Failed to load YAML configuration"
            );
        });

        it("should return empty object if yaml.load returns null", () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue("");
            mockYaml.load.mockReturnValue(null);

            const result = loadYamlConfig();

            expect(result).toEqual({});
        });

        it("should return empty object if yaml.load returns undefined", () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue("");
            mockYaml.load.mockReturnValue(undefined as any);

            const result = loadYamlConfig();

            expect(result).toEqual({});
        });
    });

    describe("getConfigValue", () => {
        it("should return YAML value when available", () => {
            const mockConfig = { expectedMonthlyPaycheck: 5000 };
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(
                "expectedMonthlyPaycheck: 5000",
            );
            mockYaml.load.mockReturnValue(mockConfig);

            const result = getConfigValue(
                "expectedMonthlyPaycheck",
                "TEST_ENV_VAR",
                3000,
            );

            expect(result).toBe(5000);
        });

        it("should return environment variable when YAML value not available", () => {
            const mockConfig = {};
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue("{}");
            mockYaml.load.mockReturnValue(mockConfig);

            process.env.TEST_ENV_VAR = "4000";

            const result = getConfigValue(
                "expectedMonthlyPaycheck",
                "TEST_ENV_VAR",
                3000,
            );

            expect(result).toBe(4000); // Should be parsed as number
        });

        it("should parse environment variable as number when default is number", () => {
            const mockConfig = {};
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue("{}");
            mockYaml.load.mockReturnValue(mockConfig);

            process.env.TEST_ENV_VAR = "4000";

            const result = getConfigValue(
                "expectedMonthlyPaycheck",
                "TEST_ENV_VAR",
                3000,
            );

            expect(result).toBe(4000);
            expect(typeof result).toBe("number");
        });

        it("should return string environment variable when number parsing fails", () => {
            const mockConfig = {};
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue("{}");
            mockYaml.load.mockReturnValue(mockConfig);

            process.env.TEST_ENV_VAR = "not-a-number";

            const result = getConfigValue(
                "expectedMonthlyPaycheck",
                "TEST_ENV_VAR",
                3000,
            );

            expect(result).toBe("not-a-number");
        });

        it("should return default value when neither YAML nor env var available", () => {
            const mockConfig = {};
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue("{}");
            mockYaml.load.mockReturnValue(mockConfig);

            const result = getConfigValue(
                "expectedMonthlyPaycheck",
                "TEST_ENV_VAR",
                3000,
            );

            expect(result).toBe(3000);
        });

        it("should return undefined when no default provided and no values available", () => {
            const mockConfig = {};
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue("{}");
            mockYaml.load.mockReturnValue(mockConfig);

            const result = getConfigValue(
                "expectedMonthlyPaycheck",
                "TEST_ENV_VAR",
            );

            expect(result).toBeUndefined();
        });

        it("should return YAML value over environment variable when both exist", () => {
            const mockConfig = { expectedMonthlyPaycheck: 5000 };
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(
                "expectedMonthlyPaycheck: 5000",
            );
            mockYaml.load.mockReturnValue(mockConfig);

            process.env.TEST_ENV_VAR = "4000";

            const result = getConfigValue(
                "expectedMonthlyPaycheck",
                "TEST_ENV_VAR",
                3000,
            );

            expect(result).toBe(5000);
        });

        it("should handle undefined YAML value correctly", () => {
            const mockConfig = { expectedMonthlyPaycheck: undefined };
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue("{}");
            mockYaml.load.mockReturnValue(mockConfig);

            process.env.TEST_ENV_VAR = "4000";

            const result = getConfigValue(
                "expectedMonthlyPaycheck",
                "TEST_ENV_VAR",
                3000,
            );

            expect(result).toBe(4000);
        });

        it("should work without environment key provided", () => {
            const mockConfig = { expectedMonthlyPaycheck: 5000 };
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(
                "expectedMonthlyPaycheck: 5000",
            );
            mockYaml.load.mockReturnValue(mockConfig);

            const result = getConfigValue(
                "expectedMonthlyPaycheck",
                undefined,
                3000,
            );

            expect(result).toBe(5000);
        });

        it("should return default when no env key and no YAML value", () => {
            const mockConfig = {};
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue("{}");
            mockYaml.load.mockReturnValue(mockConfig);

            const result = getConfigValue(
                "expectedMonthlyPaycheck",
                undefined,
                3000,
            );

            expect(result).toBe(3000);
        });

        it("should handle complex nested YAML config", () => {
            const mockConfig = {
                llm: {
                    maxTokens: 1000,
                    temperature: 0.7,
                },
            };
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(
                "llm:\n  maxTokens: 1000\n  temperature: 0.7",
            );
            mockYaml.load.mockReturnValue(mockConfig);

            const result = getConfigValue("llm", "LLM_CONFIG");

            expect(result).toEqual({
                maxTokens: 1000,
                temperature: 0.7,
            });
        });

        it("should handle empty env var correctly", () => {
            const mockConfig = {};
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue("{}");
            mockYaml.load.mockReturnValue(mockConfig);

            process.env.TEST_ENV_VAR = "";

            const result = getConfigValue(
                "expectedMonthlyPaycheck",
                "TEST_ENV_VAR",
                3000,
            );

            expect(result).toBe(""); // Empty string is returned as-is
        });
    });
});
