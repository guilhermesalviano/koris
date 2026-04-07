# GitHub Actions Workflows

This directory contains CI/CD workflows for automated testing, building, and deployment.

## Workflows

### 🧪 test.yml
**Trigger**: Push or PR to `main` or `develop` branches

**Jobs**:
- **test**: Runs unit tests on Node.js 18.x and 20.x
  - Installs dependencies with pnpm
  - Runs `pnpm test`
  - Uploads test results and coverage as artifacts

- **build**: Verifies the project builds successfully
  - Runs `pnpm build`
  - Checks that `dist/` directory is created

### 📋 lint.yml
**Trigger**: Push or PR to `main` or `develop` branches

**Jobs**:
- **lint**: TypeScript type checking
  - Runs `tsc --noEmit` to check for type errors
  - Ensures code quality before merging

## Local Testing

Test workflows locally with [act](https://github.com/nektos/act):

```bash
# Install act
curl -s https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Run tests workflow
act -j test

# Run all workflows
act push
```

## Matrix Testing

Tests run on multiple Node.js versions:
- Node.js 22.x (LTS)

This ensures compatibility across different Node versions.

## Artifacts

Test results and coverage reports are saved as artifacts:
- Available in GitHub Actions UI
- Retained for 30 days
- Can be downloaded for debugging

## Environment Variables

No secrets required for basic CI. Add these in GitHub Settings > Secrets if needed:
- `TELEGRAM_BOT_TOKEN` (for integration tests)
- `NPM_TOKEN` (for publishing to npm)

## Customization

### Add more Node versions
Edit the matrix in `test.yml`:
```yaml
strategy:
  matrix:
    node-version: [20.x, 22.x]
```

### Add code coverage reporting
Install coverage tool:
```bash
pnpm add -D @vitest/coverage-v8
```

Update workflow to publish coverage:
```yaml
- name: Generate coverage
  run: pnpm test:coverage

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v4
  with:
    file: ./coverage/coverage-final.json
```

### Run on more branches
Edit workflow triggers:
```yaml
on:
  push:
    branches: [ main, develop, feature/* ]
```

## Troubleshooting

### Tests failing in CI but passing locally
- Check Node.js version differences
- Ensure `--frozen-lockfile` flag is used
- Review environment-specific issues

### Slow test runs
- Use `cache: 'pnpm'` to cache dependencies
- Consider splitting tests into parallel jobs
- Use `--run` flag for CI (no watch mode)

### Build failures
- Ensure all dependencies are in package.json
- Check for missing environment variables
- Verify TypeScript configuration
