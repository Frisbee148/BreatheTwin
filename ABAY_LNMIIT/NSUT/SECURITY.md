# Security Policy and Safeguards

## 1. Supported Deployment Boundary

BreathTwin is an **investigational research prototype** designed for decision-support exploration using synthetic cohorts. 

| Deployment Type | Supported | Policy & Requirements |
| :--- | :---: | :--- |
| **Local Development & Evaluation** | Supported | Uses seeded local demo credentials and synthetic patient cohort data. |
| **Air-Gapped / Offline Research** | Supported | Runs without external network egress; uses deterministic regex/ontology clinical note parsing. |
| **Public Production Deployment** | Conditional | Requires external identity provider (OAuth2/OIDC), rotation of secrets, TLS 1.3, and isolated KMS. |

## 2. Seeded Credentials Boundary

Default credentials listed in the documentation (e.g., `doctor@synclave.health` / `doctor123`) are provided **strictly for local synthetic demonstration**. They must not be utilized on internet-facing servers or production clinical networks.

## 3. Secret Management & External APIs

- **Environment Isolation**: `.env` and `aasthma/.env` are explicitly excluded from version control via `.gitignore`.
- **Zero Real Protected Health Information (PHI)**: All patient records, spirometry curves, and time series are synthetic. No identifiable human data is collected, stored, or transmitted.
- **External LLM Egress**: Outbound requests to OpenAI or Hugging Face occur only when explicit API tokens are configured. Setting tokens to empty strings disables external LLM communication and redirects the system to offline deterministic parsing.

## 4. Reporting a Security Vulnerability

If you discover a security vulnerability or sensitive secret disclosure in this repository:
1. **Do not open a public issue.**
2. Report the vulnerability privately to the project maintainers via GitHub Security Advisories or by contacting the lead developer (`Aarush Bhattacharjee / @Frisbee148`).
3. Include detailed steps to reproduce the vulnerability, along with an impact assessment.
4. Maintainers will acknowledge receipt within 48 hours and work with you on a coordinated disclosure timeline.
