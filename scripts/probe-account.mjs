/**
 * 探测当前 Cloudflare 账户对各产品的可用性（只读 GET，不创建资源）
 * 依据 wrangler OAuth token
 */
import fs from 'node:fs';

const TOKEN = (() => {
  const p = 'C:/Users/surface/AppData/Roaming/xdg.config/.wrangler/config/default.toml';
  const s = fs.readFileSync(p, 'utf8');
  const m = s.match(/oauth_token\s*=\s*"([^"]+)"/);
  return m ? m[1] : '';
})();
const ACCOUNT = '9e80bc9e85ac5d70f6729a67192c5921';
const ZONE = 'a6a49f74d5d58d70abc340017213611a';

if (!TOKEN) {
  console.error('NO_TOKEN');
  process.exit(1);
}

async function probe(label, path) {
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    const text = await res.text();
    let j = null;
    try {
      j = JSON.parse(text);
    } catch {
      /* ignore */
    }
    const ok = j?.success === true;
    const count = Array.isArray(j?.result) ? j.result.length : j?.result ? 1 : 0;
    const err = ok ? '' : (j?.errors ?? []).map((e) => `${e.code}:${e.message}`).join('; ').slice(0, 90);
    console.log(
      `${ok ? '✓' : '✗'} ${label.padEnd(26)} HTTP ${res.status}  ${ok ? `items=${count}` : err || text.slice(0, 80)}`,
    );
    return { label, ok, count, err };
  } catch (e) {
    console.log(`✗ ${label.padEnd(26)} ERROR ${e.message}`);
    return { label, ok: false };
  }
}

const results = [];
results.push(await probe('Workers 脚本', `/accounts/${ACCOUNT}/workers/scripts`));
results.push(await probe('D1 数据库', `/accounts/${ACCOUNT}/d1/database`));
results.push(await probe('R2 存储桶', `/accounts/${ACCOUNT}/r2/buckets`));
results.push(await probe('KV 命名空间', `/accounts/${ACCOUNT}/storage/kv/namespaces`));
results.push(await probe('Queues 队列', `/accounts/${ACCOUNT}/queues`));
results.push(await probe('Vectorize 索引', `/accounts/${ACCOUNT}/vectorize/v2/indexes`));
results.push(await probe('Hyperdrive 配置', `/accounts/${ACCOUNT}/hyperdrive/configs`));
results.push(await probe('AI Gateway', `/accounts/${ACCOUNT}/ai-gateway/gateways`));
results.push(await probe('Workflows', `/accounts/${ACCOUNT}/workflows`));
results.push(await probe('Pages 项目', `/accounts/${ACCOUNT}/pages/projects`));
results.push(await probe('Workers 子域', `/accounts/${ACCOUNT}/workers/subdomain`));
results.push(await probe('Email Routing 规则', `/zones/${ZONE}/email/routing/rules`));
results.push(await probe('Zone 详情', `/zones/${ZONE}`));
results.push(await probe('账户订阅', `/accounts/${ACCOUNT}/subscriptions`));
results.push(await probe('账户详情', `/accounts/${ACCOUNT}`));

console.log('\n--- 汇总 ---');
console.log('可用:', results.filter((r) => r.ok).map((r) => r.label).join('、'));
console.log('不可用/无权限:', results.filter((r) => !r.ok).map((r) => r.label).join('、'));
