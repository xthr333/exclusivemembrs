import { handleMemberRequest } from './member-api.mjs';

export default {
  fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/members/')) return handleMemberRequest(request, env);
    return env.ASSETS.fetch(request);
  },
};
