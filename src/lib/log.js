/** 结构化日志：分级输出，URL 只打印主机部分，避免泄露完整链接与凭据 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function base(level, scope) {
  return { level, scope, t: new Date().toISOString() };
}

function emit(level, scope, message, extra) {
  const payload = { ...base(level, scope), message, ...(extra || {}) };
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function createLogger(scope) {
  return {
    debug: (message, extra) => emit('debug', scope, message, extra),
    info: (message, extra) => emit('info', scope, message, extra),
    warn: (message, extra) => emit('warn', scope, message, extra),
    error: (message, extra) => emit('error', scope, message, extra)
  };
}

export const LEVEL_VALUES = LEVELS;

/** 只保留 host，用于日志 */
export function safeUrl(input) {
  try {
    const u = new URL(input);
    return `${u.protocol}//${u.host}${u.pathname.slice(0, 32)}`;
  } catch {
    return '<invalid-url>';
  }
}
