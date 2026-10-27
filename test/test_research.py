import importlib.util
from pathlib import Path
import tempfile
import unittest
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location('research', Path(__file__).resolve().parents[1] / 'tools/research-concept.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ResearchTests(unittest.TestCase):
    def test_partial_source_never_becomes_no_demand(self):
        def fetch(url):
            if 'reddit.com' in url:
                raise HTTPError(url, 403, 'Blocked', {}, None)
            if '/issues?' in url:
                return {'total_count': 1, 'items': [{'title': 'Fixed upstream', 'html_url': 'https://github.com/a/b/issues/1', 'state': 'closed'}]}
            return {'total_count': 1, 'items': [{'full_name': 'a/b', 'html_url': 'https://github.com/a/b', 'description': 'Existing tool', 'stargazers_count': 3}]}
        result = module.research('salesforce', 'permission', patterns=['cli'], subreddit='salesforce', fetch=fetch)
        self.assertEqual(result['coverage'], 'partial')
        self.assertEqual(result['selection'], 'unreviewed')
        self.assertEqual(len(result['unique_records']), 2)
        self.assertEqual(result['unique_records'][1]['state'], 'closed')
        self.assertTrue(result['unique_records'][1]['read_original_before_selection'])
        self.assertEqual(result['sources'][-1]['status'], 'blocked')

    def test_browser_reads_public_links_and_closes_only_its_tab(self):
        from types import SimpleNamespace
        state = {'url': None, 'closed': []}
        def run(args, **kwargs):
            command = args[1]
            if command == 'pages':
                text = '  1,https://profile.indeed.com/,false\n'
                if state['url']:
                    text += '  7,' + state['url'] + ',true\n'
            elif command == 'newpage':
                state['url'] = args[2]
                text = 'uid=g1:43 link "Real task" url="https://www.reddit.com/r/salesforce/comments/abc/real_task/"\nuid=g1:44 link "Inbox" url="https://www.reddit.com/notifications"'
            else:
                state['closed'].append(args[2]);text = ''
            self.assertEqual(kwargs['env']['CHROME_DEVTOOLS_AXI_AUTO_CONNECT'], '1')
            return SimpleNamespace(returncode=0, stdout=text)
        result = module.browser_reddit({'kind':'reddit','subreddit':'salesforce','query':'permissions'},3,run)
        self.assertEqual(result['route'],'signed_in_browser')
        self.assertEqual(len(result['items']),1)
        self.assertEqual(state['closed'],['7'])

    def test_budget_and_target_validation(self):
        for kwargs in ({'limit': 20}, {'limit': 0}, {'subreddit': '../../private'}, {'issue_repos': ['not/a/repo']}, {'patterns': ['unknown']}):
            with self.assertRaises(ValueError):
                module.make_queries('sf', 'permission', kwargs.get('patterns', []), kwargs.get('issue_repos', []), kwargs.get('subreddit'), kwargs.get('limit', 3))

    def test_evidence_is_not_silently_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'report.json'
            module.save_new(path, {'ok': True})
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                module.save_new(path, {'ok': False})
            self.assertIn('true', path.read_text())

    def test_incomplete_search_preserved(self):
        out = module.inspect_query({'kind': 'repository', 'url': 'https://api.github.com/search/repositories'}, lambda _: {'items': [], 'incomplete_results': True})
        self.assertEqual(out['status'], 'partial')


if __name__ == '__main__':
    unittest.main()
