// Vercel 서버리스 프록시 — 서버측에서 Apps Script leadstats를 가져와 same-origin JSON으로 반환.
// 목적: 브라우저가 script.google.com에 직접 붙을 때 다계정 세션이 /u/N/ 로 튕겨(503) 실패하는 문제 우회.
export default async function handler(req, res) {
  const key = (req.query && req.query.key) || '';
  const base = 'https://script.google.com/macros/s/AKfycbzsVNBCcCwLMavq8gcgYAx8p3ss5Xj9vue3vRmqeUziGIqnwySjZ_uK5gk-hlkrfKGl/exec';
  const url = base + '?action=leadstats&key=' + encodeURIComponent(key);
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  try {
    const r = await fetch(url, { redirect: 'follow' });
    const text = await r.text();
    return res.status(200).send(text);
  } catch (e) {
    return res.status(200).send(JSON.stringify({ ok: false, error: 'proxy_fail' }));
  }
}
