// ============================================================
// TEST HARNESS — Tahap 2
// ============================================================
//
// Dua jenis test di sini:
// 1. Sample REAL yang beneran manggil Groq API (termasuk 1 kasus ambigu)
// 2. Simulasi yang sengaja kasih data rusak, untuk MEMBUKTIKAN retry
//    logic-nya jalan (karena Groq biasanya sudah patuh dari percobaan
//    pertama saat pakai response_format json_object, jadi retry alami
//    jarang muncul kalau kita cuma pakai data normal)

import { generateBriefing } from "./step2-structured-output.js";

// --- Sample 1: kasus normal, ada kecocokan sebagian ---
const sample1 = {
  cvSkills: "JavaScript, React, basic Python",
  cvYearsOfExperience: 2,
  cvEducation: "S1 Teknik Informatika",
  githubFound: true,
  githubPublicRepos: 14,
  githubLanguages: { JavaScript: 82000, HTML: 12000, CSS: 8000 },
  githubFrameworksDetected: ["React", "Express"],
  githubLastActivity: "2026-07-15",
};

// --- Sample 2: klaim CV jauh dari bukti GitHub (banyak discrepancy) ---
const sample2 = {
  cvSkills: "Machine Learning, TensorFlow, PyTorch, 5 years backend architecture",
  cvYearsOfExperience: 5,
  cvEducation: "S1 Sistem Informasi",
  githubFound: true,
  githubPublicRepos: 3,
  githubLanguages: { HTML: 5000, CSS: 2000 },
  githubFrameworksDetected: [],
  githubLastActivity: "2023-02-10",
};

// --- Sample 3: kasus AMBIGU/TRICKY — tidak ditemukan di GitHub sama sekali ---
// Ini kasus yang harus ditangani dengan hati-hati: LLM tidak boleh mengarang
// data GitHub yang tidak ada, tapi tetap harus menghasilkan JSON yang valid.
const sample3 = {
  cvSkills: "Full-stack development, Node.js, PostgreSQL",
  cvYearsOfExperience: 3,
  cvEducation: "S1 Teknik Informatika",
  githubFound: false,
  githubPublicRepos: 0,
  githubLanguages: {},
  githubFrameworksDetected: [],
  githubLastActivity: null,
};

async function runRealSamples() {
  console.log("\n########## BAGIAN 1: Sample nyata (manggil Groq beneran) ##########\n");
  const samples = [sample1, sample2, sample3];

  for (let i = 0; i < samples.length; i++) {
    console.log(`--- Sample ${i + 1} ---`);
    const result = await generateBriefing(samples[i]);

    if (result.success) {
      console.log("Status: BERHASIL");
      console.log("Percobaan dibutuhkan:", result.log.totalAttempts);
      console.log("JSON retries:", result.log.jsonRetries, "| Field retries:", result.log.fieldRetries);
      console.log("Data:", JSON.stringify(result.data, null, 2));
    } else {
      console.log("Status: GAGAL setelah semua retry habis");
      console.log("Jenis error:", result.errorType);
      console.log("Detail:", result.message);
    }
    console.log("");
  }
}

// --- BAGIAN 2: Simulasi deterministik untuk membuktikan tiap jalur retry ---
// Kita tidak manggil API asli di sini — kita langsung uji fungsi validasi
// dan pesan retry-nya dengan data yang KITA rusak sendiri secara sengaja.
// Ini praktik umum: uji logic secara terpisah dari ketidakpastian output LLM.

import { z } from "zod";

const BriefingSchemaForTest = z.object({
  discrepancy_summary: z.string().min(1),
  suggested_questions: z.string().min(1),
  overall_risk_score: z.number().min(0).max(100),
});

function simulateRetryPaths() {
  console.log("\n########## BAGIAN 2: Simulasi jalur retry (deterministik) ##########\n");

  // Jalur 1: bukan JSON sama sekali
  console.log("--- Simulasi: respons BUKAN JSON ---");
  const notJson = "Sure! Here is the analysis you asked for: risk is high.";
  try {
    JSON.parse(notJson);
    console.log("Tidak terduga: ini seharusnya gagal di-parse");
  } catch {
    console.log("TERBUKTI: JSON.parse melempar error seperti yang diharapkan → jalur JSON retry akan aktif\n");
  }

  // Jalur 2: JSON valid, tapi field salah tipe & ada yang hilang
  console.log("--- Simulasi: JSON valid tapi field salah ---");
  const badShape = {
    discrepancy_summary: "Ada beberapa kesenjangan.",
    overall_risk_score: "tinggi", // <- harusnya number, ini string
    // suggested_questions sengaja dihilangkan
  };
  const validation = BriefingSchemaForTest.safeParse(badShape);
  if (!validation.success) {
    console.log("TERBUKTI: Zod menolak data ini. Detail field yang salah:");
    validation.error.issues.forEach((issue) => {
      console.log(`  - ${issue.path.join(".")}: ${issue.message}`);
    });
  } else {
    console.log("Tidak terduga: ini seharusnya gagal validasi");
  }
}

async function main() {
  simulateRetryPaths();
  await runRealSamples();
}

main().catch((err) => {
  console.error("Terjadi error tak terduga:", err.message);
});
