// SENTINEL collector: Cron-triggered Worker (no public fetch route). Every minute it runs the most overdue
// collection task(s) and writes ready-to-serve JSON into D1, which the Pages Functions read.
import { runDue } from '../shared/collector';
import { d1Store } from '../shared/d1Store';
interface Env { DB: any; NVD_API_KEY?: string; ABUSECH_AUTH_KEY?: string }
export default {
  async scheduled(_ev: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    ctx.waitUntil(runDue(env.DB, d1Store(env.DB), env as any));
  },
};
