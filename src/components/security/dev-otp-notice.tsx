import { peekDevOtp } from '@/lib/auth/dev-otp-inbox';

import { DevOtpPanel } from './dev-otp-panel';

/**
 * The current one-time password, shown in development only.
 *
 * There is no email or SMS provider wired into this project -- both transports
 * write to the server log -- so without this a tester has to read the process
 * output to finish signing in, which is impossible when the dev server is not
 * running in a terminal they can see.
 *
 * A Server Component, so the code is read on the server and the lookup never
 * exists in the client bundle. `peekDevOtp` returns null when
 * `NODE_ENV=production`, and this renders nothing when it does, so a
 * production build cannot display a code even if this component is left on the
 * page. That double gate is deliberate: a one-time password shown to whoever
 * loads the page is account takeover, not a convenience.
 */
export function DevOtpNotice({ recipient }: { recipient: string }) {
  const code = peekDevOtp(recipient);
  if (!code) return null;

  return <DevOtpPanel code={code} />;
}
