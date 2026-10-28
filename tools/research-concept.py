#!/usr/bin/env python3
"""Bounded public problem/prior-art research; no writes to the career tracker."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

PATTERNS = ('cli', 'mcp', 'github-action', 'export', 'diff', 'preflight')


def fetch_json(url):
    req = Request(url, headers={'Accept': 'application/json', 'User-Agent': 'career-concept-research/1.0'})
    with urlopen(req, timeout=12) as response:
        return json.load(response)


def make_queries(technology, pain, patterns, issue_repos, subreddit, limit):
    if not technology.strip() or not pain.strip():
        raise ValueError('Technology and pain must be nonempty.')
    if not 1 <= limit <= 5:
        raise ValueError('Limit must be between 1 and 5.')
    if any(p not in PATTERNS for p in patterns):
        raise ValueError('Unknown pattern.')
    if len(patterns) > 3 or len(issue_repos) > 2:
        raise ValueError('Use at most three patterns and two issue repositories per pass.')
    if any(not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo) for repo in issue_repos):
        raise ValueError('Issue repositories must be owner/name.')
    if subreddit and not re.fullmatch(r'[A-Za-z0-9_]{1,50}', subreddit):
        raise ValueError('Invalid subreddit name.')
    base = technology.strip() + ' ' + pain.strip()
    queries = []
    for pattern in [None] + list(dict.fromkeys(patterns)):
        query = base if pattern is None else base + ' ' + pattern.replace('-', ' ')
        queries.append({'kind': 'repository', 'pattern': pattern, 'query': query,
                        'url': 'https://api.github.com/search/repositories?' + urlencode({'q': query, 'per_page': limit})})
    # Without a named vendor repository this is broad discovery, not proof of a vendor problem.
    for repo in issue_repos or [None]:
        query = ('repo:' + repo + ' ' if repo else technology + ' ') + pain + ' is:issue'
        queries.append({'kind': 'issue', 'query': query,
                        'url': 'https://api.github.com/search/issues?' + urlencode({'q': query, 'per_page': limit, 'sort': 'updated'})})
    if subreddit:
        queries.append({'kind': 'reddit', 'query': pain, 'subreddit': subreddit,
                        'url': 'https://www.reddit.com/r/' + quote(subreddit, safe='') + '/search.json?' + urlencode({
                            'q': pain, 'restrict_sr': 'on', 'sort': 'relevance', 't': 'year', 'limit': limit})})
    return queries


def browser_reddit(query, limit, run=subprocess.run):
    """Read visible public post links in the user's Chrome; close only our new tab."""
    subreddit = query['subreddit']
    url = 'https://www.reddit.com/r/' + quote(subreddit, safe='') + '/search/?' + urlencode({
        'q': query['query'], 'restrict_sr': 1, 'type': 'posts'})
    env = os.environ.copy()
    env.update(CHROME_DEVTOOLS_AXI_AUTO_CONNECT='1', CHROME_DEVTOOLS_AXI_SESSION='career-concept-research')
    env.pop('CHROME_DEVTOOLS_AXI_BROWSER_URL', None)
    env.pop('CHROME_DEVTOOLS_AXI_USER_DATA_DIR', None)
    def command(*args):
        response = run(['chrome-devtools-axi', *args], env=env, capture_output=True, text=True, timeout=35)
        if response.returncode:
            raise RuntimeError('Signed-in browser route unavailable; inspect the supported Chrome connection.')
        return response.stdout
    def page_ids(text):
        return set(re.findall(r'^\s*(\d+),', text, re.M))
    before = page_ids(command('pages'))
    try:
        snapshot = command('newpage', url, '--full')
        # Read only displayed public post links, never profile/inbox links, cookies or hidden state.
        pattern = r'link ("(?:[^"\\]|\\.)*") url="(https://www\.reddit\.com/r/[^/]+/comments/[^"#?]+)"'
        items = {}
        for title, link in re.findall(pattern, snapshot):
            if '/r/' + subreddit.lower() + '/comments/' in link.lower():
                items.setdefault(link, {'title': json.loads(title), 'url': link, 'read_original_before_selection': True})
        if not items:
            raise RuntimeError('No visible Reddit post links verified; inspect the browser for sign-in, empty results or a challenge.')
        return {**query, 'url': url, 'route': 'signed_in_browser', 'status': 'available',
                'total': min(len(items), limit), 'count_scope': 'visible_sample', 'items': list(items.values())[:limit]}
    finally:
        # A failed newpage may still have opened a tab. Reconcile IDs before cleanup.
        try:
            for line in command('pages').splitlines():
                match = re.match(r'\s*(\d+),([^,]+),', line)
                if match and match[1] not in before and match[2] == url:
                    command('closepage', match[1])
        except (RuntimeError, OSError, subprocess.TimeoutExpired):
            pass  # Preserve the shared browser; never stop its bridge or other tabs.


def inspect_query(query, fetch=fetch_json):
    out = dict(query)
    try:
        data = fetch(query['url'])
        if query['kind'] == 'reddit':
            entries = [item['data'] for item in data.get('data', {}).get('children', [])]
            items = [{'title': item.get('title'), 'url': 'https://www.reddit.com' + item['permalink'],
                      'created_utc': item.get('created_utc'), 'comments': item.get('num_comments')} for item in entries]
            out['total'] = len(items)  # Only this fetched page; never claim a population count.
            out['count_scope'] = 'fetched_page'
        elif query['kind'] == 'issue':
            items = [{'title': item['title'], 'url': item['html_url'], 'state': item.get('state'),
                      'created_at': item.get('created_at'), 'updated_at': item.get('updated_at'),
                      'read_original_before_selection': True} for item in data.get('items', []) if 'pull_request' not in item]
            out['total'] = data.get('total_count')
        else:
            items = [{'name': item['full_name'], 'url': item['html_url'], 'description': item.get('description'),
                      'stars_observed': item.get('stargazers_count'), 'updated_at': item.get('pushed_at'),
                      'archived': item.get('archived'), 'license': (item.get('license') or {}).get('spdx_id')}
                     for item in data.get('items', [])]
            out['total'] = data.get('total_count')
        if data.get('incomplete_results'):
            out['status'] = 'partial'
        else:
            out['status'] = 'available'
        out['items'] = items
    except HTTPError as error:
        out.update(status='blocked' if error.code in (401, 403, 429) else 'unavailable',
                   http_status=error.code, items=[], error='Public source unavailable; coverage is unknown.')
    except (URLError, TimeoutError, OSError, ValueError, KeyError, TypeError):
        out.update(status='unavailable', items=[], error='Source could not be read as the expected public JSON.')
    return out


def research(technology, pain, *, patterns=(), issue_repos=(), subreddit=None, limit=3, fetch=fetch_json, reddit_route="api"):
    queries = make_queries(technology, pain, patterns, issue_repos, subreddit, limit)
    with ThreadPoolExecutor(max_workers=3) as pool:
        def inspect(q):
            if q['kind'] == 'reddit' and reddit_route == 'browser':
                try:
                    return browser_reddit(q, limit)
                except (RuntimeError, OSError, subprocess.TimeoutExpired, ValueError) as error:
                    return {**q, 'status': 'unavailable', 'route': 'signed_in_browser', 'items': [],
                            'error': str(error), 'browser_check_required': True}
            return inspect_query(q, fetch)
        sources = list(pool.map(inspect, queries))
    unique = {}
    for source in sources:
        for item in source['items']:
            unique.setdefault(item['url'], {'kind': source['kind'], **item})
    return {'version': 1, 'observed_at': datetime.now(timezone.utc).isoformat(),
            'technology': technology, 'pain': pain, 'sources': sources, 'unique_records': list(unique.values()),
            'coverage': 'complete' if all(s['status'] == 'available' for s in sources) else 'partial',
            'selection': 'unreviewed',
            'next': ['Define the job capability and observable evidence first in a private selection brief; never send job or employer text to search.',
                     'Broaden real problems and industries after fixing the capability; read originals and current alternatives, including closed-issue resolution.',
                     'Compare distinct concepts for usefulness, demo quality and a result-backed case study; do not pad to a fixed count or require scores.',
                     'A timely problem is an advantage, not a prerequisite. Record the event/release date separately from checked_at; use unknown if unavailable. checked_at is not recency evidence.',
                     'Choose extend/contribute/wrap/new or skip; record acceptance/failure examples and a <10 second storyboard.',
                     'Treat the proposed lesson as a hypothesis until results earn it; project evidence cannot establish professional tenure.'],
            'limits': ['Keyword searches are discovery only; no search result proves an absent competitor or unmet need.',
                       'An empty or blocked source is not evidence of no demand.',
                       'No selected concept or career fact is created by this command.']}


def save_new(path, report):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(report, stream, indent=2)
        stream.write('\n')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument('--technology', help='Legacy technology-focused discovery')
    scope.add_argument('--capability', help='General public capability chosen from the job gap, never a job description or employer')
    parser.add_argument('--domain', help='Optional problem/industry context after choosing the capability')
    parser.add_argument('--pain', required=True, help='Short work/problem terms, not a full job description')
    parser.add_argument('--pattern', action='append', choices=PATTERNS, default=[])
    parser.add_argument('--issue-repo', action='append', default=[])
    parser.add_argument('--subreddit')
    parser.add_argument('--reddit-route', choices=('browser', 'api'), default='browser',
                        help='Reddit defaults to the signed-in Chrome route; API is an explicit headless alternative')
    parser.add_argument('--limit', type=int, default=3)
    parser.add_argument('--out', help='New dated JSON file; refuses to overwrite')
    args = parser.parse_args(argv)
    try:
        if args.domain and not args.capability:
            raise ValueError('--domain requires --capability; choose the capability first.')
        if args.capability is not None and not args.capability.strip():
            raise ValueError('Capability must be nonempty.')
        technology = args.technology or ' '.join(filter(None, [args.capability, args.domain]))
        result = research(technology, args.pain, patterns=args.pattern, issue_repos=args.issue_repo,
                          subreddit=args.subreddit, limit=args.limit, reddit_route=args.reddit_route)
        if args.capability:
            result['research_scope'] = {'capability': args.capability, 'domain': args.domain,
                                        'status': 'discovery_only', 'professional_tenure': 'not_demonstrated'}
        if args.out:
            save_new(args.out, result)
            print(json.dumps({'path': args.out, 'coverage': result['coverage'], 'records': len(result['unique_records'])}))
        else:
            print(json.dumps(result, indent=2))
    except (ValueError, FileExistsError) as error:
        parser.error(str(error))


if __name__ == '__main__':
    main()
