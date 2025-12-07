# Contributing to YouTube Researcher

Thank you for considering contributing to YouTube Researcher! This is a portfolio project, but contributions are welcome.

## How to Contribute

### Reporting Issues

If you find a bug or have a feature request:

1. **Check existing issues** to avoid duplicates
2. **Create a new issue** with:
   - Clear, descriptive title
   - Steps to reproduce (for bugs)
   - Expected vs. actual behavior
   - YouTube video URL used (if applicable)
   - Error messages or screenshots
   - Your environment (Node version, OS, browser)

### Submitting Pull Requests

1. **Fork the repository** and create a new branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following these guidelines:
   - Follow existing code style and conventions
   - Use TypeScript strict mode
   - Add Zod schemas for new API endpoints
   - Write clear, descriptive commit messages
   - Test with multiple YouTube videos (different lengths, languages)

3. **Ensure code quality**:
   ```bash
   npm run build  # Must compile without errors
   npm run lint   # Fix any linting issues
   ```

4. **Update documentation**:
   - Update README.md if adding features
   - Add JSDoc comments for new functions
   - Update API reference if changing endpoints

5. **Submit your PR** with:
   - Clear description of changes
   - Reference any related issues
   - Screenshots/GIFs for UI changes

## Code Standards

### TypeScript
- Use strict mode
- Avoid `any` types
- Prefer interfaces over type aliases for objects
- Use Zod for runtime validation

### Security
- Never weaken existing security headers
- Sanitize all user inputs
- Use error whitelisting for messages
- Follow principle of least privilege

### Performance
- Avoid redundant API calls
- Reuse agent/client instances
- Use contextual compression when appropriate
- Monitor cost implications of changes

### Testing
While this project doesn't have formal tests yet, please:
- Test manually with various video lengths (5 min, 30 min, 2+ hours)
- Test with different languages
- Test error cases (invalid URLs, missing transcripts)
- Verify security headers aren't weakened

## What We're Looking For

**High Priority:**
- Unit tests (Jest + React Testing Library)
- Integration tests for API routes
- Distributed rate limiting (Redis-based)
- Cost monitoring utilities

**Medium Priority:**
- UI/UX improvements
- Performance optimizations
- Multi-language support enhancements
- Better error messages

**Nice to Have:**
- Dark mode
- Conversation history
- Playlist support
- Export functionality

## Questions?

Feel free to open an issue for discussion before starting work on major features.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
