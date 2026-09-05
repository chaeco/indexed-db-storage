import typescript from '@rollup/plugin-typescript'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import dts from 'rollup-plugin-dts'

// sourceMap: true 覆盖 tsconfig 的 sourceMap: false（tsconfig 只为 type-check 服务，不在 build 时 emit），
// 使最终 .map 能回溯到原始 .ts 源码；inlineSources: true 将 .ts 源码文本内嵌进 map，
// 这样消费者 devtools 无需访问源码文件即可断点调试（tsc 默认不内嵌 → map 的 sourcesContent 为空）。
const tsPluginOptions = { tsconfig: './tsconfig.json', sourceMap: true, inlineSources: true }

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
      typescript(tsPluginOptions),
    ],
  },
  // CJS bundle — for Node require() consumers (SSR, CJS toolchains)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.cjs',
      format: 'cjs',
      exports: 'named',
      sourcemap: true,
    },
    plugins: [
      nodeResolve({ extensions: ['.ts', '.js'] }),
      commonjs(),
      typescript(tsPluginOptions),
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