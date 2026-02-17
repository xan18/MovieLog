param(
  [string]$OutputFile = ".env.local"
)

$ErrorActionPreference = "Stop"

function Require-Command {
  param([string]$CommandName)
  if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
    throw "Command '$CommandName' not found. Install Vercel CLI first: npm i -g vercel"
  }
}

function Invoke-Checked {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $FilePath $($Arguments -join ' ')"
  }
}

Require-Command "vercel"

Invoke-Checked -FilePath "vercel" -Arguments @("whoami")

if (-not (Test-Path ".vercel\project.json")) {
  Write-Host "Vercel project is not linked yet. Running 'vercel link'..."
  Invoke-Checked -FilePath "vercel" -Arguments @("link")
}

Write-Host "Pulling environment variables from Vercel into $OutputFile ..."
Invoke-Checked -FilePath "vercel" -Arguments @("env", "pull", $OutputFile)

Write-Host "Done. Run 'npm run dev' to start the app."
