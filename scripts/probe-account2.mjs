import fs from 'node:fs';
const TOKEN = (() => {
  const s = fs.readFileSync('C:/Users/surface/AppData/Roaming/xdg.config/.wrangler/config/default.toml','utf8');
  const m = s.match(/oauth_token\s*=\s*"([^"]+)"/); return m ? m[1] : '';
})();
const A = '9e80bc9e85ac5d70f6729a67192c5921';
async function probe(label, path, method='GET') {
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, { method, headers: { authorization: `Bearer ${TOKEN}` } });
    const t = await res.text();
    let j=null; try { j = JSON.parse(t); } catch {}
    const ok = j?.success === true;
    const count = Array.isArray(j?.result) ? j.result.length : (j?.result ? 1 : 0);
    const err = ok ? '' : (j?.errors ?? []).map(e=>`${e.code}:${e.message}`).join('; ').slice(0,70);
    console.log(`${ok?'✓':'✗'} ${label.padEnd(24)} HTTP ${res.status} ${ok?`items=${count}`:err||t.slice(0,60)}`);
  } catch(e) { console.log(`✗ ${label.padEnd(24)} ERROR ${e.message}`); }
}
await probe('Workers AI 模型', `/accounts/${A}/ai/models/search?per_page=5`);
await probe('AI Search', `/accounts/${A}/ai-search/namespaces`);
await probe('Pipelines', `/accounts/${A}/pipelines`);
await probe('Secrets Store', `/accounts/${A}/secrets_store/stores`);
await probe('Containers 应用', `/accounts/${A}/containers/applications`);
await probe('Durable Objects NS', `/accounts/${A}/workers/durable_objects/namespaces`);
await probe('Workers 域名', `/accounts/${A}/workers/domains`);
await probe('R2 目录', `/accounts/${A}/r2-catalog/catalogs`);
await probe('Logpush 任务', `/accounts/${A}/logpush/jobs`);
await probe('Email Sending', `/accounts/${A}/email/sending`);
await probe('Browser Rendering', `/accounts/${A}/browser-rendering`);
await probe('Zone 规则集', `/zones/a6a49f74d5d58d70abc340017213611a/rulesets`);
await probe('Turnstile', `/accounts/${A}/challenges/widgets`);
