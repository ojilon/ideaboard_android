export type Route =
  | { name: 'boards' }
  | { name: 'board'; id: string }
  | { name: 'links'; filter: 'inbox' | 'all' | 'tagged'; tag: string | null; q: string }
  | { name: 'settings' };

export function parseRoute(hash: string): Route {
  const raw = (hash || '').replace(/^#/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const params = new URLSearchParams(queryPart);

  if (segments[0] === 'board' && segments[1]) {
    return { name: 'board', id: decodeURIComponent(segments[1]) };
  }
  if (segments[0] === 'links') {
    const filter = params.get('filter');
    return {
      name: 'links',
      filter: filter === 'all' || filter === 'tagged' ? filter : 'inbox',
      tag: params.get('tag'),
      q: params.get('q') ?? '',
    };
  }
  if (segments[0] === 'settings') return { name: 'settings' };
  return { name: 'boards' };
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'board':
      return `#/board/${encodeURIComponent(route.id)}`;
    case 'links': {
      const params = new URLSearchParams();
      if (route.filter !== 'inbox') params.set('filter', route.filter);
      if (route.tag) params.set('tag', route.tag);
      if (route.q) params.set('q', route.q);
      const query = params.toString();
      return `#/links${query ? `?${query}` : ''}`;
    }
    case 'settings':
      return '#/settings';
    default:
      return '#/boards';
  }
}

export function navigate(route: Route | string, options: { replace?: boolean } = {}): void {
  const hash = typeof route === 'string' ? route : routeToHash(route);
  if (options.replace) {
    history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else if (location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}

export function onRouteChange(handler: (route: Route) => void): () => void {
  const listener = () => handler(parseRoute(location.hash));
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

export const linksRoute = (
  filter: 'inbox' | 'all' | 'tagged' = 'inbox',
  tag: string | null = null,
): Route => ({ name: 'links', filter, tag, q: '' });
