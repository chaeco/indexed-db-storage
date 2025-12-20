/**
 * 测试环境设置
 */

import 'fake-indexeddb/auto'

// 全局测试配置
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
