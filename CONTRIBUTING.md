# Contributing to BoltBerry

Thank you for considering a contribution to BoltBerry!

## How to Report a Bug

1. Search [existing issues](https://github.com/RollBerry-Studios/BoltBerry/issues) to avoid duplicates.
2. Open a new issue using the **Bug Report** template.
3. Include steps to reproduce, expected vs. actual behaviour, and your OS/version.

## How to Request a Feature

Open a new issue using the **Feature Request** template. Describe the use case, not just the solution.

## Development Setup

```bash
git clone https://github.com/RollBerry-Studios/BoltBerry.git
cd BoltBerry
npm install
npm run dev
```

## Pull Request Guidelines

1. Fork the repository and create a branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Keep changes focused — one feature or fix per PR.
3. Follow the existing code style (TypeScript strict, React functional components, Zustand stores).
4. Run tests before submitting:
   ```bash
   npm test
   ```
5. Fill in the PR template completely.
6. Link any related issue in the PR description.

## Code Style

- TypeScript strict mode — no `any` without justification
- No CSS-in-JS string literals for colors — use CSS custom properties (`var(--accent-blue)`, etc.)
- Electron IPC calls must be wrapped in `try/catch`
- Prefer small, focused functions over large components

## Commit Convention

Use conventional commit prefixes:

| Prefix | When |
|---|---|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `refactor:` | Code change with no behaviour change |
| `style:` | Formatting, CSS only |
| `docs:` | Documentation only |
| `chore:` | Build/tooling/dependency updates |

## License

By contributing you agree that your changes will be licensed under the [MIT License](LICENSE).
