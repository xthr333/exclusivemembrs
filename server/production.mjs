import { handleMemberRequest, respond } from './member-api.mjs';
import { handlePlatformRequest } from './platform-api.mjs';

const canonical = 'exclusivemembrs.com';
const memberPages = new Set(['/account', '/member', '/member-hub']);
const memberScripts = new Set(['/member-account.js', '/member-community.js', '/member-operations.js', '/member-platform.js']);
const eventPages = new Set(['/events', '/account', '/member-hub']);
const hostedAssets = '/__exm/';

function activeMode(env) {
  if (!['events', 'events-only', 'members'].includes(env.EXM_MEMBER_MODE) ||
      !env.EXM_MEMBER_SERVICE_ROLE_KEY ||
      !/^[0-9a-f]{64}$/i.test(env.EXM_MEMBER_PEPPER ?? '')) return null;
  if (env.EXM_MEMBER_MODE === 'events-only') return 'events';
  return env.EXM_MEMBER_MODE === 'events' && env.EXM_MEMBER_RELEASE === 'members' ? 'members' : env.EXM_MEMBER_MODE;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\.html$/, '');
    if (url.pathname.startsWith(hostedAssets) || url.pathname === '/__exm') {
      return respond({ error: 'Page not found.' }, 404);
    }
    const mode = activeMode(env);
    if (url.hostname === 'www.' + canonical && mode &&
        (url.pathname.startsWith('/api/') || memberPages.has(path))) {
      if (!['GET', 'HEAD'].includes(request.method)) return respond({ error: 'Use the canonical EXM site.' }, 403);
      url.hostname = canonical;
      return Response.redirect(url.href, 308);
    }
    const enabled = mode && url.hostname === canonical && url.protocol === 'https:';
    const signup = mode === 'members' && env.EXM_PUBLIC_SIGNUP === 'verified-email';
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname.startsWith('/api/preview/')) return respond({ error: 'Page not found.' }, 404);
      if (request.method === 'GET' && url.pathname === '/api/exm-mode.js' && enabled) {
        return new Response('window.EXMHostedMode = ' + JSON.stringify(mode) + '; window.EXMPublicSignup = ' + signup + ';', {
          headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff' },
        });
      }
      if (!enabled) return respond({ error: 'Page not found.' }, 404);
      const hosted = {
        EXM_HOSTED: true, EXM_MEMBER_MODE: mode, EXM_PUBLIC_SIGNUP: env.EXM_PUBLIC_SIGNUP,
        EXM_MEMBER_AUTH_URL: env.EXM_MEMBER_AUTH_URL, EXM_MEMBER_DATA_URL: env.EXM_MEMBER_DATA_URL,
        EXM_MEMBER_SERVICE_ROLE_KEY: env.EXM_MEMBER_SERVICE_ROLE_KEY,
        EXM_MEMBER_ANON_KEY: env.EXM_MEMBER_ANON_KEY, EXM_MEMBER_PEPPER: env.EXM_MEMBER_PEPPER,
      };
      if (url.pathname.startsWith('/api/members/')) return handleMemberRequest(request, hosted);
      if (url.pathname.startsWith('/api/platform/')) return handlePlatformRequest(request, hosted);
      return respond({ error: 'Page not found.' }, 404);
    }
    if (enabled && ['GET', 'HEAD'].includes(request.method) &&
        (eventPages.has(path) || memberScripts.has(path) ||
          (mode === 'members' && ['/artists', '/member', '/updates'].includes(path)))) {
      const asset = new URL(hostedAssets + path.slice(1), url);
      const response = await env.ASSETS.fetch(new Request(asset, request));
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      if (memberPages.has(path)) headers.set('X-Robots-Tag', 'noindex, nofollow');
      return new Response(response.body, { status: response.status, headers });
    }
    return env.ASSETS.fetch(request);
  },
};
