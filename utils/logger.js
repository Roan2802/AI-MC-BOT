/** Simple logger with Agent01 prefix */
function formatPrefix(){ return '[Agent01]' }
export default {
  info(...args){ console.log(formatPrefix(), ...args) },
  warn(...args){ console.warn(formatPrefix(), ...args) },
  error(...args){ console.error(formatPrefix(), ...args) }
}
