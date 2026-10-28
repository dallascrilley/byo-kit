import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from contextlib import redirect_stdout, redirect_stderr
import io
import json
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location('research', Path(__file__).resolve().parents[1] / 'tools/research-concept.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ResearchTests(unittest.TestCase):
    def test_capability_first_cli_and_legacy_technology_route(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'research.json'
            report = {'coverage': 'partial', 'unique_records': []}
            with patch.object(module, 'research', return_value=report.copy()) as research, redirect_stdout(io.StringIO()):
                module.main(['--capability', 'integrity diagnosis', '--domain', 'transit', '--pain', 'overlap', '--out', str(output)])
            research.assert_called_once_with('integrity diagnosis transit', 'overlap', patterns=[], issue_repos=[], subreddit=None, limit=3, reddit_route='browser')
            saved = json.loads(output.read_text())
            self.assertEqual(saved['research_scope']['capability'], 'integrity diagnosis')
            self.assertEqual(saved['research_scope']['professional_tenure'], 'not_demonstrated')
            with patch.object(module, 'research', return_value=report.copy()) as research, redirect_stdout(io.StringIO()):
                module.main(['--technology', 'sqlite', '--pain', 'collision'])
            self.assertEqual(research.call_args.args, ('sqlite', 'collision'))

    def test_capability_scope_validation_happens_before_network(self):
        for args in [ ['--capability', ' ', '--pain', 'overlap'],
                      ['--technology', 'sqlite', '--domain', 'transit', '--pain', 'overlap'],
                      ['--technology', 'sqlite', '--capability', 'diagnosis', '--pain', 'overlap'] ]:
            with patch.object(module, 'research') as research, redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                module.main(args)
            research.assert_not_called()

    def test_discovery_guidance_does_not_force_trends_counts_or_tenure_claims(self):
        result = module.research('diagnosis', 'overlap', fetch=lambda _: {'items': []})
        guidance = ' '.join(result['next'])
        self.assertIn('job capability', guidance)
        self.assertIn('not a prerequisite', guidance)
        self.assertIn('hypothesis', guidance)
        self.assertNotIn('Compare three', guidance)
        self.assertEqual(result['selection'], 'unreviewed')

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
