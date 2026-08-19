import typescript from '@rollup/plugin-typescript'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import dts from 'rollup-plugin-dts'

const config = [
  // ESM bundle — single file for browser consumption
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: [
      nodeResolve({ extensions: ['.ts', '.js'] }),
      commonjs(),
      typescript({ tsconfig: './tsconfig.json' }),
    ],
  },
  // Type declarations — single bundled .d.ts
  {
    input: 'src/index.ts',
    output: { file: 'dist/index.d.ts', format: 'es' },
    plugins: [dts({ tsconfig: './tsconfig.build.json', respectExternal: true })],
  },
]

export default config
