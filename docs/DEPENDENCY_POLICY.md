# Dependency Remediation Policy

Runtime dependencies are pinned and reviewed through weekly Dependabot updates. CI runs `pip-audit` against backend requirements and blocks critical npm advisories in production dependencies. Backend vulnerabilities and critical production mobile vulnerabilities block merge unless a repository owner records a time-bounded exception with affected package/path, exploitability, compensating control, upstream issue, owner, and expiry date.

High/moderate advisories in the Expo/React Native build chain are reviewed rather than force-fixed across incompatible major versions. A supported upstream update is preferred over `npm audit fix --force`. Runtime reachability, whether the vulnerable package is shipped or development-only, and platform exposure must be recorded. Exceptions expire within 30 days for critical issues and 90 days for high issues.

After dependency changes, run backend tests, mobile tests/typecheck, Expo web and Android exports, `pip-audit`, and `npm audit --omit=dev`. Never suppress an advisory by removing the scan or editing a lockfile without reinstalling.
