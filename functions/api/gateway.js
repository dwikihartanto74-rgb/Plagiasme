/**
 * functions/api/gateway.js
 * Cloudflare Pages Function — API Proxy antara Frontend Cloudflare Pages & Google Apps Script Web App.
 * Otomatis aktif di route: https://<nama-project>.pages.dev/api/gateway
 */

// Opsional: Tempelkan URL Web App Google Apps Script Anda di bawah ini sebagai default,
// atau atur melalui Environment Variable "APPS_SCRIPT_URL" di dashboard Cloudflare Pages.
const DEFAULT_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyafbz1QNJhyY6aTAfK4Vflj5tf_2TD9XHQwlwEbJlEUDioV63LCUCrO2S-HKPz4phq/exec";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json; charset=utf-8"
};

export async function onRequest(context) {
  const { request, env } = context;

  // 1. Tangani CORS Preflight (OPTIONS)
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Ambil URL Apps Script dari Environment Variable Cloudflare atau konstanta default
  const appsScriptUrl = (env && env.APPS_SCRIPT_URL) ? env.APPS_SCRIPT_URL.trim() : DEFAULT_APPS_SCRIPT_URL;

  if (!appsScriptUrl || !appsScriptUrl.startsWith("https://script.google.com/") || appsScriptUrl.includes("PASTE_DEPLOYMENT_ID")) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Konfigurasi APPS_SCRIPT_URL belum diatur di Cloudflare Pages Environment Variables atau functions/api/gateway.js."
      }),
      { status: 500, headers: CORS_HEADERS }
    );
  }

  // 2. Endpoint GET untuk cek status koneksi dari browser (/api/gateway)
  if (request.method === "GET") {
    try {
      const pingRes = await fetch(`${appsScriptUrl}?ping=1`, { redirect: "follow" });
      const pingText = await pingRes.text();
      return new Response(
        JSON.stringify({
          ok: true,
          proxy: "Cloudflare Pages Function Active",
          appsScriptStatus: pingRes.status,
          upstream: JSON.parse(pingText)
        }),
        { status: 200, headers: CORS_HEADERS }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ ok: false, error: "Gagal ping ke Apps Script: " + err.message }),
        { status: 502, headers: CORS_HEADERS }
      );
    }
  }

  // 3. Teruskan semua permintaan POST (API Frontend maupun Webhook BRI) ke Google Apps Script
  if (request.method === "POST") {
    try {
      const rawBody = await request.text();

      // Google Apps Script mengembalikan HTTP 302 redirect setelah mengeksekusi doPost(e),
      // redirect: "follow" memastikan Cloudflare mengikuti redirect dan mengambil JSON hasilnya.
      const gasResponse = await fetch(appsScriptUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: rawBody,
        redirect: "follow"
      });

      const responseText = await gasResponse.text();

      // Validasi bahwa respons dari Google adalah JSON (bukan halaman login HTML Google)
      try {
        JSON.parse(responseText);
      } catch (parseErr) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "Google Apps Script tidak mengembalikan JSON. Pastikan Deployment Web App diatur ke 'Execute as: Me' dan 'Who has access: Anyone'."
          }),
          { status: 502, headers: CORS_HEADERS }
        );
      }

      return new Response(responseText, {
        status: 200,
        headers: CORS_HEADERS
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Cloudflare Proxy Error: " + (err.message || "Gagal menghubungi Google Apps Script.")
        }),
        { status: 502, headers: CORS_HEADERS }
      );
    }
  }

  return new Response(
    JSON.stringify({ ok: false, error: "Metode HTTP tidak diizinkan." }),
    { status: 405, headers: CORS_HEADERS }
  );
}
