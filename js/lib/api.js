/**
 * Trump Offers — backend facade & route guards.
 */

import { config, DEMO_MODE } from '../config.js';
import LocalBackend from './local.js';
import { safeNext } from './utils.js';

let instance = null;
let loading = null;
export let isDemo = DEMO_MODE;

export async function getApi() {
  if (instance) return instance;
  if (!loading) {
    loading = (async () => {
      if (DEMO_MODE) {
        instance = new LocalBackend();
        isDemo = true;
      } else {
        try {
          const { default: SupabaseBackend } = await import('./remote.js');
          const remoteInstance = new SupabaseBackend();
          if (remoteInstance.init) await remoteInstance.init();
          // Quick probe to ensure Supabase schema is reachable
          const { error } = await remoteInstance.client.from('jobs').select('id').limit(1);
          if (error && /schema cache|relation .* does not exist|not found/i.test(error.message)) {
            throw error;
          }
          instance = remoteInstance;
          isDemo = false;
        } catch (err) {
          console.info('[Trump Offers] Supabase schema not yet detected; running with persistent local database engine.');
          instance = new LocalBackend();
          isDemo = true;
        }
      }
      if (instance.init) await instance.init();
      return instance;
    })();
  }
  return loading;
}

/**
 * Resolve the current session. Never throws for a missing session.
 */
export async function currentUser() {
  try {
    const api = await getApi();
    return await api.auth.getSession();
  } catch (error) {
    if (/suspended|session has ended|not available/i.test(error.message)) {
      return null;
    }
    console.warn('[Trump Offers] session check failed:', error.message);
    return null;
  }
}

export function loginUrl(next = location.pathname.split('/').pop() + location.search) {
  return `login.html?next=${encodeURIComponent(safeNext(next))}`;
}

export function adminLoginUrl(next = 'index.html') {
  return `login.html?next=${encodeURIComponent(safeNext(next, 'index.html'))}`;
}

/**
 * Guard a member-only page. Redirects to sign-in when no active session.
 * Returns the session when authorised.
 */
export async function requireUser(next = location.pathname.split('/').pop() + location.search) {
  const session = await currentUser();
  if (!session) {
    location.replace(loginUrl(next));
    return null;
  }
  return session;
}

/**
 * Guard an admin page. Redirects unauthenticated visitors to the admin
 * sign-in screen and non-admins back to their dashboard.
 */
export async function requireAdmin(next = 'index.html') {
  const session = await currentUser();
  if (!session) {
    location.replace(adminLoginUrl(next));
    return null;
  }
  if (session.profile?.role !== 'admin') {
    location.replace('../dashboard.html?notice=admin-only');
    return null;
  }
  return session;
}

export async function redirectIfSignedIn(target = 'dashboard.html') {
  const session = await currentUser();
  if (session) location.replace(target);
  return session;
}

export { config, DEMO_MODE };
