# Contributing to Octo Admin

Thanks for your interest in contributing to Octo Admin! This document explains how to report issues, propose changes, and submit pull requests.

## Reporting Bugs

Bugs are tracked as [GitHub Issues](../../issues). Before opening a new issue, please search existing issues to avoid duplicates.

When filing a bug report, include:

- A clear, descriptive title.
- Steps to reproduce the problem.
- Expected behavior and what actually happened.
- Your environment (OS, Node.js version, browser, Octo Admin version or commit).
- Relevant logs, stack traces, or screenshots.

## Feature Requests

Feature requests are also tracked through [GitHub Issues](../../issues). Please:

- Search first to see if the idea has already been proposed.
- Describe the use case and the problem the feature would solve.
- Outline any alternatives you have considered.

Discussion happens on the issue before implementation work begins.

## Pull Request Process

1. **Fork** the repository and clone your fork locally.
2. **Create a branch** from `main` for your change. Use a descriptive name, e.g. `feat/space-invites-panel` or `fix/login-redirect`.
3. **Make your changes**, keeping commits focused and logically grouped.
4. **Test** your changes locally. Run the linter and type checker, and verify the affected UI flows in the browser.
5. **Push** your branch to your fork and **open a pull request** against `main`.
6. Fill in the PR description: what changed, why, and how it was tested. Link any related issues.
7. Address review feedback by pushing additional commits to the same branch. Maintainers may ask for changes before merging.

All PRs must pass CI (lint, type check, build) before they can be merged.

## Development Setup

See the [README](./README.md) for prerequisites, installation steps, and instructions for running the development server, building, and running tests.

## Code Style

- **TypeScript** is used in strict mode. New code must type-check cleanly without `any` escape hatches where avoidable.
- **ESLint** enforces style and correctness rules. Run the linter before pushing and fix all reported issues.
- Prefer small, focused components and functions. Match the conventions already established in the surrounding code.
- Do not commit formatter- or lint-only changes mixed with functional changes.

## Commit Messages

This project follows the [Conventional Commits](https://www.conventionalcommits.org/) specification. Each commit message should take the form:

```
<type>(<optional scope>): <short summary>

<optional body>

<optional footer>
```

Common types:

- `feat` — a new feature
- `fix` — a bug fix
- `docs` — documentation only
- `style` — formatting, missing semicolons, etc.; no code change
- `refactor` — code change that neither fixes a bug nor adds a feature
- `perf` — performance improvement
- `test` — adding or correcting tests
- `chore` — tooling, build, or auxiliary changes

Example: `feat(spaces): add invite revocation to members panel`

## License

Octo Admin is licensed under the [Apache License, Version 2.0](./LICENSE). By submitting a contribution, you agree that your contribution will be licensed under the same Apache 2.0 terms, and you certify that you have the right to submit it under that license.
