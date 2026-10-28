# #16622: real registry in Codespaces

Select **Terraform #16622: real registry + full dry run** and follow
[the reproduction commands](PR-COMPARISON.md).

| Core code | Registry receives | Result |
| --- | --- | --- |
| v0.401.0 | `acme/rds/aws` | Missing-`versions` KeyError |
| Same release + PR #16628 patch | `acme/RDS/aws` | Version check succeeds |

This is a functional comparison, not a full PR regression or security review.
Codespaces validation is pending; Linux Docker commands were tested.

[Vagrant-specific setup](README-VAGRANT.md).
