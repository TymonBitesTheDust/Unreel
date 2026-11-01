// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // TypeScript already checks namespace members, and this rule can't follow the compiled
      // `export *` enums in expo-notifications (AndroidImportance and friends).
      'import/namespace': 'off',
    },
  },
]);
