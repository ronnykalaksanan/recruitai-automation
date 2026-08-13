// ============================================================
// TAHAP 3 — Express API
// ============================================================
//
// Tujuan: bungkus generateBriefing() (dari Tahap 2) jadi endpoint HTTP
// yang bisa dipanggil n8n lewat HTTP Request node.
//
// Ada 4 hal baru di tahap ini:
// 1. Validasi request YANG MASUK (sebelum sempat manggil LLM sama sekali)
// 2. API key check sederhana lewat header
// 3. Logging terstruktur (retry apa terjadi, berapa percobaan)
// 4. Endpoint /health untuk cek service masih hidup

import express from "express";
import { z } from "zod";
import "dotenv/config";
import { generateBriefing } from "./step2-structured-output.js";

const app = express();
app.use(express.json()); // supaya Express bisa baca body JSON dari request masuk

const PORT = process.env.PORT || 3000;

// --- BAGIAN 1: Skema validasi REQUEST MASUK ---
// Ini beda dari BriefingSchema di Tahap 2 (itu validasi OUTPUT dari LLM).
// Ini validasi INPUT dari n8n — pastikan data yang dikirim n8n sudah
// lengkap & bertipe benar SEBELUM kita buang-buang panggilan API ke Groq.

const RequestBodySchema = z.object({
  cvSkills: z.string().min(1),
  cvYearsOfExperience: z.number().min(0),
  cvEducation: z.string().min(1),
  githubFound: z.boolean(),
  githubPublicRepos: z.number().min(0),
  githubLanguages: z.record(z.number()), // object bebas, tapi tiap value harus number
  githubFrameworksDetected: z.array(z.string()),
  githubLastActivity: z.string().nullable(), // boleh null kalau githubFound: false
});

// --- BAGIAN 2: Middleware API key check ---
// "Middleware" itu fungsi yang jalan SEBELUM handler utama, buat setiap
// request yang cocok. Di sini dipakai buat cek header sebelum request
// diteruskan ke handler /generate-briefing.

function checkApiKey(req, res, next) {
  const providedKey = req.header("x-api-key");

  if (!providedKey) {
    return res.status(401).json({ error: "Missing x-api-key header" });
  }
  if (providedKey !== process.env.SERVICE_API_KEY) {
    return res.status(403).json({ error: "Invalid API key" });
  }

  next(); // key valid, lanjutkan ke handler berikutnya
}

// --- BAGIAN 3: Endpoint utama ---

app.post("/generate-briefing", checkApiKey, async (req, res) => {
  const startTime = Date.now();

  // Validasi request masuk DULU, sebelum manggil LLM sama sekali.
  const validation = RequestBodySchema.safeParse(req.body);
  if (!validation.success) {
    console.log(
      `[${new Date().toISOString()}] REQUEST DITOLAK — field bermasalah:`,
      validation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)
    );
    return res.status(400).json({
      error: "Invalid request body",
      details: validation.error.issues,
    });
  }

  // Request valid, lanjut generate briefing.
  const result = await generateBriefing(validation.data);
  const durationMs = Date.now() - startTime;

  // --- Logging terstruktur ---
  // Ini yang bikin reliability improvement-nya KELIHATAN, bukan cuma
  // teori: setiap request, kita catat apakah ada retry, jenis apa,
  // dan berapa percobaan totalnya.
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      success: result.success,
      totalAttempts: result.log?.totalAttempts ?? null,
      jsonRetries: result.log?.jsonRetries ?? null,
      fieldRetries: result.log?.fieldRetries ?? null,
      durationMs,
      errorType: result.success ? null : result.errorType,
    })
  );

  if (!result.success) {
    return res.status(502).json({
      error: "Failed to generate briefing after retries",
      errorType: result.errorType,
      message: result.message,
    });
  }

  return res.status(200).json({
    data: result.data,
    meta: {
      totalAttempts: result.log.totalAttempts,
      jsonRetries: result.log.jsonRetries,
      fieldRetries: result.log.fieldRetries,
      durationMs,
    },
  });
});

// --- BAGIAN 4: Health check ---
// Endpoint sederhana buat cek "service ini masih hidup atau tidak",
// dipakai monitoring/uptime checker, dan nanti Railway/Render juga
// biasanya pakai endpoint semacam ini buat tahu servicenya sehat.

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Service berjalan di http://localhost:${PORT}`);
  console.log(`Coba: curl http://localhost:${PORT}/health`);
});
