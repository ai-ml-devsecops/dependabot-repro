# Dependabot issue reproductions

Open the issue's devcontainer, then follow its README. Local devcontainers can use your unpublished working files.

For Codespaces:

1. Choose **Code > Codespaces > ... > New with options**.
2. Select the case's branch and **Dev container configuration**. For the real-registry case, use `repro/16622-real-private-registry`; the other cases use `main`.
3. Create the codespace, wait for the build, then follow the issue's instructions:

- [Terraform #16622: uppercase private registry modules](cases/terraform/16622/README.md)
- [Terraform #16622: real registry and full Core dry runs](cases/terraform/16622/real-registry/README.md)
- [uv #16589: dependencies ignored with build-only Poetry configuration](cases/uv/16589/README.md)
- [Python #6300: version ordering and caret requirements](cases/pip/6300/README.md)
- [pip-tools #3143: changing comment paths](cases/pip/3143/README.md)

Results:

- `reproduced`: the reported behavior occurred.
- `not_reproduced`: the check completed without that behavior.
- `blocked`: the check could not reach a conclusion.
