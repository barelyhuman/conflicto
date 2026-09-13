import {
  LogPrint,
  LogTrace,
  LogDebug,
  LogInfo,
  LogWarning,
  LogError,
} from './wailsjs/runtime/runtime.js';

/**
 * Safe single-line stringifier for console arguments.
 * Falls back to [object] when JSON.stringify blows up.
 */
function stringify(arg) {
  if (arg === undefined) return 'undefined';
  if (arg === null) return 'null';
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean' || typeof arg === 'bigint') return String(arg);
  if (typeof arg === 'function') return `[Function${arg.name ? ' ' + arg.name : ''}]`;
  if (arg instanceof Error) return arg.stack ?? arg.message ?? String(arg);
  if (arg instanceof Date) return arg.toISOString();
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function formatArgs(args) {
  if (args.length === 0) return '';
  if (args.length === 1) return stringify(args[0]);
  return args.map(stringify).join(' ');
}

function patchConsole() {
  if (!import.meta.env.DEV) return;
  if (typeof window === 'undefined' || typeof window.runtime === 'undefined') return;

  const originals = {
    log: console.log,
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  console.log = (...args) => {
    originals.log.apply(console, args);
    LogPrint(formatArgs(args));
  };
  console.debug = (...args) => {
    originals.debug.apply(console, args);
    LogDebug(formatArgs(args));
  };
  console.info = (...args) => {
    originals.info.apply(console, args);
    LogInfo(formatArgs(args));
  };
  console.warn = (...args) => {
    originals.warn.apply(console, args);
    LogWarning(formatArgs(args));
  };
  console.error = (...args) => {
    originals.error.apply(console, args);
    LogError(formatArgs(args));
  };

  // Expose a way to inspect the original console if needed
  console.__originals = originals;
}

patchConsole();
