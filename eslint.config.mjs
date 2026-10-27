import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

const config = [...nextCoreWebVitals, ...nextTypeScript, {
  ignores: ['.next/**', 'dist/**', 'node_modules/**', 'coverage/**', 'playwright-report/**', 'test-results/**']
}];

export default config;
