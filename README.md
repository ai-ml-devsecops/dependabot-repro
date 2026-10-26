# Dependabot issue reproductions

1. Choose **Code > Codespaces > ... > New with options**.
2. Select `main` and the issue under **Dev container configuration**.
3. Create the codespace, wait for the build, then follow the issue's instructions:

- [Terraform #16622: uppercase private registry modules](cases/terraform/16622/README.md)
- [uv #16589: dependencies ignored with build-only Poetry configuration](cases/uv/16589/README.md)

Results:

- `reproduced`: the reported behavior occurred.
- `not_reproduced`: the check completed without that behavior.
- `blocked`: the check could not reach a conclusion.
