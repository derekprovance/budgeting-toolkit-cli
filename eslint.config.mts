import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
    {
        // .claude/ holds agent worktrees: whole checkouts of this repo
        ignores: ['dist/**', 'node_modules/**', '.claude/**'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    eslintConfigPrettier,
    {
        languageOptions: {
            globals: globals.node,
        },
    },
    {
        // Expected values and the fake Firefly are hand-derived from the
        // documented model; importing src/ would let them reuse the logic under
        // test. Third-party packages (e.g. the Firefly SDK's types) are fine.
        files: ['test-harness/scenario/**/*.ts', 'test-harness/fake-firefly/**/*.ts'],
        rules: {
            '@typescript-eslint/no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            regex: '^(\\.\\.?/)+(.*/)?src(/|$)',
                            message:
                                'test-harness/scenario and fake-firefly must not import from src/: expected values are hand-derived, never computed by the code under test.',
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ['**/__tests__/**/*.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-require-imports': 'off',
        },
    }
);
