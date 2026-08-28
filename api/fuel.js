/*
 * PROXY CORS — Prezzi carburante ufficiali (Osservaprezzi Carburanti, MIMIT)
 * =========================================================================
 * L'API ufficiale https://carburanti.mise.gov.it/ospzApi NON invia header CORS
 * (preflight -> 403), quindi il WebView / browser non puo' chiamarla direttamente.
 * Questa funzione serverless (Vercel) la interroga LATO SERVER e riespone i dati
 * con Access-Control-Allow-Origin: *, cosi' la WebApp (telefono e web) puo' leggerli.
 *
 * POST /api/fuel
 *   body: { points: [{lat,lng}, ...], mode?: "route"|"zone", radius?: km }
 *   -> { success, count, updated, results: [ { id, name, brand, lat, lng, distKm,
 *          updated, fuels: [ { name, price, self, fuelId } ] } ] }
 *
 * "route" (default) cerca i distributori lungo il corridoio dei punti passati.
 * "zone" cerca entro `radius` km attorno ai punti.
 */

const OSPZ_BASE = 'https://carburanti.mise.gov.it/ospzApi';

module.exports = async function handler(req, res) {
  // --- CORS (questa e' la ragione d'essere del proxy) ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Cache CDN breve: i prezzi cambiano al piu' una volta al giorno.
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Metodo non consentito' });
    return;
  }

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};

    const points = Array.isArray(body.points)
      ? body.points
          .filter(p => p && isFinite(p.lat) && isFinite(p.lng))
          .slice(0, 30)
          .map(p => ({ lat: +p.lat, lng: +p.lng }))
      : [];

    if (!points.length) {
      res.status(400).json({ success: false, error: 'Nessun punto (points) valido' });
      return;
    }

    const mode = body.mode === 'zone' ? 'zone' : 'route';
    const payload = { points, fuelType: 0, priceOrder: 'asc' };
    if (mode === 'zone') payload.radius = Math.min(50, Math.max(1, Number(body.radius) || 5));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let upstream;
    try {
      upstream = await fetch(`${OSPZ_BASE}/search/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!upstream || !upstream.ok) {
      res.status(502).json({ success: false, error: 'Osservaprezzi non raggiungibile (' + (upstream && upstream.status) + ')' });
      return;
    }

    const data = await upstream.json();
    const raw = Array.isArray(data && data.results) ? data.results : [];

    let latestTs = 0;
    const results = raw.slice(0, 80).map(s => {
      const fuels = Array.isArray(s.fuels)
        ? s.fuels.map(f => ({
            name: f.name,
            price: typeof f.price === 'number' ? f.price : parseFloat(f.price),
            self: !!f.isSelf,
            fuelId: f.fuelId,
          }))
        : [];
      if (s.insertDate) {
        const t = Date.parse(s.insertDate);
        if (t && t > latestTs) latestTs = t;
      }
      const distM = (typeof s.distance === 'number') ? s.distance : null;
      return {
        id: s.id,
        name: s.name,
        brand: s.brand || null,
        lat: s.location ? s.location.lat : null,
        lng: s.location ? s.location.lng : null,
        distKm: distM != null ? Math.round(distM / 100) / 10 : null,
        updated: s.insertDate || null,
        fuels,
      };
    }).filter(s => s.lat != null && s.lng != null && s.fuels.length);

    res.status(200).json({
      success: true,
      count: results.length,
      updated: latestTs ? new Date(latestTs).toISOString() : null,
      results,
    });
  } catch (e) {
    const msg = (e && e.name === 'AbortError') ? 'Timeout Osservaprezzi' : String((e && e.message) || e);
    res.status(500).json({ success: false, error: msg });
  }
};
