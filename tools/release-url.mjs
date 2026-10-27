// Wrangler prints custom domains without an https:// prefix.
export function deployedUrl(output) {
  const custom=String(output).match(/^\s*([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,})\s+\(custom domain\)\s*$/im);
  if(custom) return 'https://'+custom[1];
  const worker=String(output).match(/https:\/\/[a-z0-9.-]+\.workers\.dev\b\/?/i);
  if(worker) return worker[0].replace(/\/$/,'');
  throw new Error('Deployment output contains no verified custom-domain or workers.dev endpoint.');
}
