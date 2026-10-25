[CmdletBinding()]
param(
    [int]$Limit = 10,
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'GitHub CLI (gh) is required. Install it and run gh auth login first.'
}

$issuesJson = gh api "search/issues?q=repo:dependabot/dependabot-core+is:issue+is:open&sort=created&order=desc&per_page=$Limit"
$issues = @((($issuesJson | ConvertFrom-Json).items))

$results = foreach ($issue in $issues) {
    $commentsJson = gh api --paginate --slurp "repos/dependabot/dependabot-core/issues/$($issue.number)/comments?per_page=100"
    $comments = @($commentsJson | ConvertFrom-Json | ForEach-Object { $_ })

    [pscustomobject]@{
        number    = $issue.number
        title     = $issue.title
        url       = $issue.html_url
        createdAt = $issue.created_at
        updatedAt = $issue.updated_at
        author    = $issue.user.login
        comments  = @($comments | ForEach-Object {
            [pscustomobject]@{
                author    = $_.user.login
                createdAt = $_.created_at
                updatedAt = $_.updated_at
                body      = $_.body
                url       = $_.html_url
            }
        })
    }
}

$json = @($results) | ConvertTo-Json -Depth 10

if ($OutputPath) {
    $json | Set-Content -Path $OutputPath -Encoding utf8
    Write-Host "Saved $($results.Count) issues to $OutputPath"
} else {
    $json
}