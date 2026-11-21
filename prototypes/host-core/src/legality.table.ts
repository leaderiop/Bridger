// GENERATED from references/core/transitions.yaml by scripts/gen-legality.mjs. Do not edit.
export const STATE_TABLE: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "unknown": {"install":"proceed","remove":"unknown-plugin","replace":"unknown-plugin","retry":"unknown-plugin","reconfigure":"unknown-plugin","restart":"unknown-plugin","disable":"unknown-plugin","enable":"unknown-plugin","abort":"unknown-plugin"},
  "dormant": {"install":"duplicate-plugin","remove":"proceed","replace":"proceed","retry":"noop","reconfigure":"proceed","restart":"noop","disable":"proceed","enable":"noop","abort":"conflict:not-parked"},
  "waiting": {"install":"duplicate-plugin","remove":"proceed","replace":"proceed","retry":"noop","reconfigure":"proceed","restart":"noop","disable":"proceed","enable":"noop","abort":"conflict:not-parked"},
  "starting": {"install":"duplicate-plugin","remove":"proceed","replace":"proceed","retry":"noop","reconfigure":"proceed","restart":"proceed","disable":"proceed","enable":"noop","abort":"conflict:not-parked"},
  "active": {"install":"duplicate-plugin","remove":"proceed","replace":"proceed","retry":"noop","reconfigure":"proceed","restart":"proceed","disable":"proceed","enable":"noop","abort":"conflict:not-parked"},
  "stopping": {"install":"duplicate-plugin","remove":"proceed","replace":"conflict:stopping","retry":"conflict:stopping","reconfigure":"conflict:stopping","restart":"conflict:stopping","disable":"conflict:stopping","enable":"conflict:stopping","abort":"proceed"},
  "failed": {"install":"duplicate-plugin","remove":"proceed","replace":"proceed","retry":"proceed","reconfigure":"proceed","restart":"proceed","disable":"proceed","enable":"noop","abort":"conflict:not-parked"},
  "failed-cleanup": {"install":"duplicate-plugin","remove":"proceed","replace":"conflict:cleanup-failure","retry":"conflict:cleanup-failure","reconfigure":"conflict:cleanup-failure","restart":"conflict:cleanup-failure","disable":"conflict:cleanup-failure","enable":"conflict:cleanup-failure","abort":"conflict:not-parked"},
  "disabled": {"install":"duplicate-plugin","remove":"proceed","replace":"proceed","retry":"conflict:disabled","reconfigure":"proceed","restart":"conflict:disabled","disable":"noop","enable":"proceed","abort":"conflict:not-parked"},
}
export const FLIGHT_TABLE: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "remove": {"install":"duplicate-plugin","remove":"join","replace":"conflict:remove","retry":"conflict:remove","reconfigure":"conflict:remove","restart":"conflict:remove","disable":"conflict:remove","enable":"conflict:remove","abort":"abort-if-parked"},
  "replace": {"install":"duplicate-plugin","remove":"supersede","replace":"supersede","retry":"conflict:replace","reconfigure":"conflict:replace","restart":"conflict:replace","disable":"conflict:replace","enable":"conflict:replace","abort":"abort-if-parked"},
  "reconfigure": {"install":"duplicate-plugin","remove":"supersede","replace":"supersede","retry":"conflict:reconfigure","reconfigure":"join-if-equal","restart":"join","disable":"supersede","enable":"conflict:reconfigure","abort":"abort-if-parked"},
  "restart": {"install":"duplicate-plugin","remove":"supersede","replace":"supersede","retry":"conflict:restart","reconfigure":"join","restart":"join","disable":"supersede","enable":"conflict:restart","abort":"abort-if-parked"},
  "disable": {"install":"duplicate-plugin","remove":"supersede","replace":"conflict:disable","retry":"conflict:disable","reconfigure":"conflict:disable","restart":"conflict:disable","disable":"join","enable":"conflict:disable","abort":"abort-if-parked"},
}
