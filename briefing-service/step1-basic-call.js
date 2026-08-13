// ============================================================
// TAHAP 1 — Script dasar: panggil Groq API, print hasil ke console
// ============================================================
//
// Tujuan tahap ini CUMA satu: buktikan kita bisa manggil Groq API
// langsung dari Node.js (tanpa n8n), dan dapat balasannya.
// Belum ada validasi, belum ada retry — itu Tahap 2.

// --- BAGIAN 1: Import (memuat library yang kita butuhkan) ---
// "import X from 'Y'" itu setara dengan "ambil kode dari package Y,
// simpan sebagai nama X biar bisa dipakai di file ini"

import Groq from "groq-sdk";       // SDK resmi Groq buat manggil API-nya
import "dotenv/config";             // otomatis baca file .env dan taruh isinya ke process.env

// --- BAGIAN 2: Inisialisasi client ---
// "client" ini objek yang tahu cara ngobrol ke Groq API.
// API key-nya TIDAK kita tulis langsung di kode (praktik buruk & bahaya
// kalau ke-push ke GitHub) — kita ambil dari environment variable.

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// --- BAGIAN 3: Contoh data yang biasanya datang dari workflow n8n ---
// Nanti di Tahap 3, data ini akan datang dari request HTTP.
// Sekarang kita hardcode dulu biar fokus ke "cara manggil API"-nya saja.

const sampleInput = {
  cvSkills: "JavaScript, React, basic Python",
  cvYearsOfExperience: 2,
  cvEducation: "S1 Teknik Informatika",
  githubFound: true,
  githubPublicRepos: 14,
  githubLanguages: { JavaScript: 82000, HTML: 12000, CSS: 8000 },
  githubFrameworksDetected: ["React", "Express"],
  githubLastActivity: "2026-07-15",
};

// --- BAGIAN 4: Susun prompt ---
// Ini pola yang sama dipakai node GenerateInterviewerBriefing di n8n kamu:
// bandingkan klaim CV vs bukti GitHub, minta ringkasan + pertanyaan follow-up.

const prompt = `Compare this candidate's CV claims against their GitHub activity, and prepare an interviewer briefing.

CV Claims:
- Skills: ${sampleInput.cvSkills}
- Years of Experience: ${sampleInput.cvYearsOfExperience}
- Education: ${sampleInput.cvEducation}

GitHub Data:
- Found on GitHub: ${sampleInput.githubFound}
- Public Repos: ${sampleInput.githubPublicRepos}
- Languages (by bytes): ${JSON.stringify(sampleInput.githubLanguages)}
- Frameworks Detected: ${JSON.stringify(sampleInput.githubFrameworksDetected)}
- Last Activity: ${sampleInput.githubLastActivity}

Identify concrete discrepancies. Then produce 3-5 specific follow-up interview questions.`;

// --- BAGIAN 5: Fungsi utama (async karena manggil API itu proses yang butuh waktu) ---
// "async function" artinya fungsi ini boleh pakai "await" di dalamnya —
// "await" artinya "tunggu proses ini selesai dulu sebelum lanjut ke baris berikutnya".
// Tanpa await, kode akan lanjut jalan duluan padahal API belum kasih jawaban.

async function main() {
  console.log("Mengirim prompt ke Groq...\n");

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",  // model yang sama dipakai node screening di n8n kamu
    messages: [
      {
        role: "system",
        content:
          "You are a technical interviewer's assistant. Base your analysis ONLY on the data provided. Do not invent GitHub activity that wasn't given to you.",
      },
      { role: "user", content: prompt },
    ],
  });

  // response.choices[0].message.content itu tempat teks balasan LLM berada.
  // "response" itu objek besar berisi metadata juga (token usage, model, dll),
  // kita cuma ambil bagian teksnya.

  const outputText = response.choices[0].message.content;

  console.log("=== HASIL DARI GROQ ===\n");
  console.log(outputText);
}

// --- BAGIAN 6: Jalankan fungsi utama, tangkap error kalau ada ---
// ".catch" di sini nangkep kalau ada error (misal API key salah, koneksi gagal)
// biar tidak crash tanpa pesan yang jelas.

main().catch((err) => {
  console.error("Terjadi error saat manggil Groq API:");
  console.error(err.message);
});
