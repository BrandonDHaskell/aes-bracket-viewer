import globals from 'globals';

export default [{
    files: ['dist/aes-bracket-viewer.user.js'],
    languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'script',
        globals: { ...globals.browser, GM_notification: 'readonly', GM_info: 'readonly', GM: 'readonly' }
    },
    rules: {
        'no-undef': 'error',
        'no-unused-vars': ['error', { args: 'none' }],
        'no-redeclare': 'error',
        'no-dupe-keys': 'error',
        'no-unreachable': 'error'
    }
}];
