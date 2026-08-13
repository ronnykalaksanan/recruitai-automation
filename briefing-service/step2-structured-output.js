// ============================================================
// TAHAP 2 — Structured output + validasi Zod + retry logic
// ============================================================
//
// Tujuan: LLM WAJIB balikin JSON dengan bentuk yang kita tentukan.
// Kalau gagal (3 jenis kegagalan berbeda), kita tangani dengan cara
// yang beda-beda juga.

import Groq from "groq-sdk";
import { z } from "zod";
import "dotenv/config";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// --- BAGIAN 1: Skema yang kita wajibkan ---
// Ini "kontrak" bentuk data yang harus dipatuhi LLM.
// Kalau LLM ngasih data yang tidak cocok ini, Zod akan menolaknya.

const BriefingSchema = z.object({
  discrepancy_summary: z.string().min(1, "tidak boleh kosong"),
  suggested_questions: z.string().min(1, "tidak boleh kosong"),
  overall_risk_score: z
    .number()
    .min(0, "minimal 0")
    .max(100, "maksimal 100"),
});

// --- BAGIAN 2: Batas jumlah retry per jenis kegagalan ---
// Angka ini sesuai yang kamu minta di brief awal.

const MAX_JSON_RETRIES = 2;   // kalau responsnya bukan JSON sama sekali
const MAX_FIELD_RETRIES = 2;  // kalau JSON valid tapi field-nya salah
const MAX_API_RETRIES = 3;    // kalau panggilan API-nya sendiri gagal

// Helper kecil: "tidur" sekian milidetik sebelum lanjut.
// Dipakai untuk exponential backoff (jeda yang makin lama tiap retry).
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- BAGIAN 3: Susun prompt ---
function buildMessages(input) {
  const userPrompt = `Compare this candidate's CV claims against their GitHub activity.

CV Claims:
- Skills: ${input.cvSkills}
- Years of Experience: ${input.cvYearsOfExperience}
- Education: ${input.cvEducation}

GitHub Data:
- Found on GitHub: ${input.githubFound}
- Public Repos: ${input.githubPublicRepos}
- Languages (by bytes): ${JSON.stringify(input.githubLanguages)}
- Frameworks Detected: ${JSON.stringify(input.githubFrameworksDetected)}
- Last Activity: ${input.githubLastActivity}

Return your analysis as JSON with EXACTLY this shape, nothing else:
{
  "discrepancy_summary": "2-4 sentence summary of concrete mismatches between CV and GitHub",
  "suggested_questions": "3-5 numbered follow-up interview questions as one string",
  "overall_risk_score": <number 0-100, how much the CV claims should be treated with suspicion>
}`;

  return [
    {
      role: "system",
      content:
        "You are a technical interviewer's assistant. Base your analysis ONLY on the data provided, never invent activity that wasn't given. Always respond with ONLY valid JSON, no markdown code fences, no explanation text before or after.",
    },
    { role: "user", content: userPrompt },
  ];
}

// --- BAGIAN 4: Panggil Groq, dengan retry KHUSUS untuk kegagalan API ---
// Ini terpisah total dari retry JSON/field di bawah, karena penyebabnya beda:
// di sini bukan soal isi jawaban LLM, tapi soal koneksi/server-nya sendiri
// (timeout, rate limit 429, error server 5xx).

async function callGroqWithBackoff(messages, attempt = 0) {
  try {
    return await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      response_format: { type: "json_object" }, // minta Groq "mode JSON" secara native
    });
  } catch (err) {
    const status = err?.status;
    // Retryable: timeout, rate limit (429), atau error server (5xx).
    // TIDAK retryable: error 4xx lain (misal API key salah / 401) — retry tidak akan membantu itu.
    const isRetryable =
      status === 429 || (status >= 500 && status < 600) || err.code === "ETIMEDOUT";

    if (isRetryable && attempt < MAX_API_RETRIES) {
      const delayMs = 1000 * 2 ** attempt; // 1000ms, 2000ms, 4000ms — makin lama tiap percobaan
      console.log(
        `  [API retry] percobaan ke-${attempt + 1} gagal (status ${status}), tunggu ${delayMs}ms...`
      );
      await sleep(delayMs);
      return callGroqWithBackoff(messages, attempt + 1); // panggil diri sendiri lagi (rekursi)
    }
    throw err; // sudah habis jatah retry, atau errornya memang bukan jenis yang bisa diperbaiki dengan retry
  }
}

// --- BAGIAN 5: Fungsi utama — orkestrasi semua jenis retry ---

export async function generateBriefing(input) {
  const messages = buildMessages(input);
  const log = { jsonRetries: 0, fieldRetries: 0, totalAttempts: 0 };

  while (true) {
    log.totalAttempts++;
    const response = await callGroqWithBackoff(messages);
    const rawText = response.choices[0].message.content;

    // --- Cek jenis kegagalan 1: apakah ini JSON yang valid? ---
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      log.jsonRetries++;
      if (log.jsonRetries > MAX_JSON_RETRIES) {
        return {
          success: false,
          errorType: "invalid_json",
          message: "LLM tidak berhasil menghasilkan JSON valid setelah beberapa percobaan.",
          log,
        };
      }
      console.log(`  [JSON retry] percobaan ke-${log.jsonRetries}, respons bukan JSON valid`);
      messages.push({ role: "assistant", content: rawText });
      messages.push({
        role: "user",
        content:
          "That was not valid JSON. Return ONLY valid JSON, no markdown code fences, no text before or after.",
      });
      continue; // ulangi loop, coba lagi
    }

    // --- Cek jenis kegagalan 2: JSON valid, tapi apakah bentuknya sesuai skema? ---
    const validation = BriefingSchema.safeParse(parsed);
    if (!validation.success) {
      log.fieldRetries++;
      if (log.fieldRetries > MAX_FIELD_RETRIES) {
        return {
          success: false,
          errorType: "schema_validation",
          message: "LLM tidak berhasil menghasilkan field yang sesuai skema.",
          issues: validation.error.issues,
          log,
        };
      }
      // Susun pesan yang menyebutkan PERSIS field mana yang salah — ini bedanya
      // dengan retry generik n8n, yang cuma bilang "gagal" tanpa detail.
      const issueList = validation.error.issues
        .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
        .join("\n");
      console.log(`  [Field retry] percobaan ke-${log.fieldRetries}, field bermasalah:\n${issueList}`);
      messages.push({ role: "assistant", content: rawText });
      messages.push({
        role: "user",
        content: `Your JSON had these field problems:\n${issueList}\nReturn the corrected full JSON with the exact same shape.`,
      });
      continue; // ulangi loop, coba lagi
    }

    // Lolos semua pengecekan
    return { success: true, data: validation.data, log };
  }
}
