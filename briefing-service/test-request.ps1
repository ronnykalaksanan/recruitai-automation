# Ganti dua baris di bawah ini dengan nilai asli kamu sebelum dijalankan:
# 1. $apiKey -> SERVICE_API_KEY yang sama dengan di Environment Variables Vercel
# 2. $vercelUrl -> URL Vercel kamu (TANPA garis miring / di akhir)
 
$apiKey = "iniserviceapikeynya"
$vercelUrl = "https://recruitai-automation.vercel.app"
 
$body = @{
    cvSkills = "JavaScript, React"
    cvYearsOfExperience = 2
    cvEducation = "S1 Teknik Informatika"
    githubFound = $true
    githubPublicRepos = 14
    githubLanguages = @{ JavaScript = 82000 }
    githubFrameworksDetected = @("React")
    githubLastActivity = "2026-07-15"
} | ConvertTo-Json
 
$response = Invoke-RestMethod -Uri "$vercelUrl/generate-briefing" `
    -Method Post `
    -ContentType "application/json" `
    -Headers @{ "x-api-key" = $apiKey } `
    -Body $body
 
$response.data | ConvertTo-Json -Depth 5