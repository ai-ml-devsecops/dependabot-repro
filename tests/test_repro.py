import copy
import unittest
import repro


class RecipeTests(unittest.TestCase):
    def setUp(self):
        self.recipe = "terraform-private-registry-module-case"
        self.case = repro.read_json(repro.ROOT / "recipes" / self.recipe / "case.json")

    def test_reported_case_is_sufficient_without_real_registry_credentials(self):
        result = repro.assess(self.case)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["module_identifier"], "acme/RDS/aws")

    def test_sparse_case_requests_only_inputs_needed_by_recipe(self):
        result = repro.assess({"recipe": self.recipe})
        self.assertEqual(result["status"], "needs_info")
        self.assertEqual(set(result["missing_fields"]), set(repro.QUESTIONS))
        self.assertFalse(any("token" in q.lower() for q in result["questions"]))

    def test_unknown_recipe_is_unsupported(self):
        self.assertEqual(repro.assess({"recipe": "unknown"})["status"], "unsupported")

    def test_malformed_case_is_not_treated_as_a_reproduction(self):
        self.assertEqual(repro.assess([])["status"], "unsupported")
        self.case["manifest"] = 42
        self.assertEqual(repro.assess(self.case)["status"], "needs_info")
        self.case["manifest"] = 'module "db" { source = "example.com/acme/RDS/aws" }'
        self.case["registry_upper_response"]["body"] = {"modules": [42]}
        self.assertEqual(repro.assess(self.case)["status"], "unsupported")

    def test_lowercase_source_does_not_match_this_recipe(self):
        self.case["manifest"] = self.case["manifest"].replace("RDS", "rds")
        self.assertEqual(repro.assess(self.case)["status"], "unsupported")

    def test_failure_requires_real_request_control_and_matching_exception(self):
        evidence = {
            "stage": "update_checker", "control": {"status": 200},
            "module_identifier": "acme/rds/aws",
            "exception": {"class": "KeyError", "message": 'key not found: "versions"',
                          "backtrace": ["registry_client.rb:100:in all_module_versions"]}}
        request = {"phase": "dependabot", "path": "/v1/modules/acme/rds/aws/versions",
                   "status": 200, "body": {"modules": [{}]}}
        self.assertEqual(repro.classify(evidence, [request], 1, "acme/RDS/aws"), "reproduced")
        for replacement in ([], [{**request, "phase": "fixture-check"}],
                            [{**request, "phase": "ruby-control"}]):
            self.assertEqual(repro.classify(evidence, replacement, 1, "acme/RDS/aws"), "blocked")
        unrelated = copy.deepcopy(evidence)
        unrelated["exception"]["backtrace"] = ["unrelated.rb:1"]
        self.assertEqual(repro.classify(unrelated, [request], 1, "acme/RDS/aws"), "blocked")

    def test_tls_failure_is_blocked_even_when_parser_lowercases(self):
        evidence = {"module_identifier": "acme/rds/aws",
                    "exception": {"class": "Dependabot::PrivateSourceCertificateFailure",
                                  "message": "TLS failure"}}
        self.assertEqual(repro.classify(evidence, [], 1, "acme/RDS/aws"), "blocked")

    def test_success_needs_a_real_versions_request(self):
        evidence = {"latest_version": "1.1.0"}
        request = {"phase": "dependabot", "path": "/v1/modules/acme/RDS/aws/versions",
                   "status": 200, "body": self.case["registry_upper_response"]["body"]}
        self.assertEqual(repro.classify(evidence, [request], 0, "acme/RDS/aws"), "not_reproduced")
        self.assertEqual(repro.classify(evidence, [], 0, "acme/RDS/aws"), "blocked")


if __name__ == "__main__":
    unittest.main()
