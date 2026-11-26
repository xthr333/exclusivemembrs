import { handleMemberRequest, isLoopback, respond } from './member-api.mjs';
import { handlePlatformRequest, handlePreviewLogin } from './platform-api.mjs';

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/') && (!isLoopback(request.url) || env.EXM_PREVIEW_CONSOLE !== '1')) {
      return respond({ error: 'Page not found.' }, 404);
    }
    if (path.startsWith('/api/members/')) return handleMemberRequest(request, env);
    if (path.startsWith('/api/platform/')) return handlePlatformRequest(request, env);
    if (path === '/api/preview/login') return handlePreviewLogin(request, env);
    const response = await env.ASSETS.fetch(request);
    if (env.EXM_PREVIEW_CONSOLE !== '1') return response;
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: blob:; connect-src 'self'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'");
    headers.set('Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, headers });
  },
};
